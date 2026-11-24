"""Server-owned reaction windows embedded in the durable encounter snapshot."""

from __future__ import annotations

import math
import time
import uuid
from copy import deepcopy
from dataclasses import replace

from service.combat_action_commands import ActionCommandRejected, apply_combat_action, validate_targets
from service.combat_actions import available_combat_actions
from utils.blocking import run_blocking
from utils.roles import can_interact, is_dm

MAX_TRIGGERS = 32
MAX_INTERSECTIONS = 8192


def _exit_point(start, end, center, radius):
    dx, dy = end[0] - start[0], end[1] - start[1]
    x, y = start[0] - center[0], start[1] - center[1]
    a = dx * dx + dy * dy
    if a <= 1e-12:
        return None
    b = 2 * (x * dx + y * dy)
    c = x * x + y * y - radius * radius
    discriminant = b * b - 4 * a * c
    if discriminant <= 0:
        return None
    leave = (-b + math.sqrt(discriminant)) / (2 * a)
    # A boundary endpoint does not leave reach until a later segment goes out.
    if 0 <= leave < 1 and (end[0] - center[0]) ** 2 + (end[1] - center[1]) ** 2 > radius**2 + 1e-8:
        inside = max(0.0, leave - 1e-9)
        return leave, [start[0] + inside * dx, start[1] + inside * dy]
    return None


def _table_at(table, mover, point):
    copied = deepcopy(table)
    token = copied.find_entity_by_sprite_id(mover.entity_id)
    if token is None:
        raise ValueError("Moving token is unavailable")
    token.position = tuple(point)
    return copied


def eligible_triggers(state, table, mover, path):
    if mover.is_disengaging or not mover.can_act() or mover.hp <= 0:
        return []
    candidates = [
        actor
        for actor in state.combatants
        if actor.is_npc != mover.is_npc
        and not actor.is_defeated
        and actor.hp > 0
        and actor.has_reaction
        and actor.can_act()
    ]
    if not candidates:
        return []
    if table is None:
        raise ValueError("Reaction geometry requires the encounter table")
    grid, distance = float(table.grid_cell_px), float(table.cell_distance)
    factor = distance / grid / (0.3048 if table.distance_unit == "m" else 1)
    if not math.isfinite(factor) or factor <= 0:
        raise ValueError("Invalid table units for reactions")
    triggers, checks = [], 0
    for actor in candidates:
        if mover.is_npc and mover.is_hidden and not actor.is_npc:
            continue
        token = table.find_entity_by_sprite_id(actor.entity_id)
        if token is None:
            continue
        actions = [
            action
            for action in available_combat_actions(actor)
            if action.kind == "attack" and action.attack_type == "melee"
        ]
        for reach in sorted({action.range_ft for action in actions}):
            for index, (first, last) in enumerate(zip(path, path[1:])):
                checks += 1
                if checks > MAX_INTERSECTIONS:
                    raise ValueError("Reaction geometry budget exceeded")
                exit_point = _exit_point(first, last, token.position, reach / factor)
                if exit_point is None:
                    continue
                t, point = exit_point
                scene = _table_at(table, mover, point)
                allowed = []
                for action in actions:
                    if action.range_ft != reach:
                        continue
                    try:
                        validate_targets(state, actor, [mover], scene, action, "owner")
                        allowed.append(action.action_id)
                    except ActionCommandRejected:
                        continue
                if allowed:
                    triggers.append(
                        {
                            "trigger_id": str(uuid.uuid4()),
                            "attacker_id": actor.combatant_id,
                            "action_ids": allowed,
                            "attacker_position": list(token.position),
                            "point": point,
                            "route_order": index + t,
                            "status": "pending",
                        }
                    )
                    if len(triggers) > MAX_TRIGGERS:
                        raise ValueError("Too many opportunity-attack triggers")
                break
    return sorted(triggers, key=lambda item: (item["route_order"], item["attacker_id"]))


def next_trigger(pending):
    return next((item for item in pending["triggers"] if item["status"] == "pending"), None)


def queue_movement(command, context, state, actor, path, cost, triggers, timeout):
    if context.user_id is None or context.movement_draft is None:
        return {"error": "Durable reaction movement requires an authenticated movement draft"}
    if context.command_count != 1:
        return {
            "error": "Moves with reactions must be submitted individually",
            "details": {"code": "reaction_move_requires_single_command"},
        }
    state.pending_movement = {
        "movement_id": str(uuid.uuid4()),
        "actor_id": actor.combatant_id,
        "requester_user_id": context.user_id,
        "round_number": state.round_number,
        "turn_index": state.current_turn_index,
        "table_id": state.table_id,
        "command": {
            **command.model_dump(mode="json"),
            "from_x": path[0][0],
            "from_y": path[0][1],
            "target_x": path[-1][0],
            "target_y": path[-1][1],
            "path": path,
        },
        "cost_ft": cost,
        "triggers": triggers,
        "timeout_seconds": max(1, min(int(timeout), 120)),
    }
    state.pending_movement["expires_at"] = time.time() + state.pending_movement["timeout_seconds"]
    return {"status": "awaiting_reactions", "movement_id": state.pending_movement["movement_id"]}


async def settle_reaction(service, command, context, state, actor_id, move_undos):
    pending = state.pending_movement
    if pending is None:
        return {"error": "No pending opportunity attack"}
    trigger = next_trigger(pending)
    expiry = command.type.value == "expire_opportunity_attacks"
    cancel = command.type.value == "cancel_pending_move"
    if cancel:
        if command.movement_id != pending["movement_id"]:
            return {"error": "Pending movement identity changed"}
        state.pending_movement = None
        return {"status": "cancelled", "movement_id": pending["movement_id"]}
    if trigger is None:
        return {"error": "No unresolved trigger"}
    if expiry:
        if not context.internal_expiry or time.time() < pending["expires_at"]:
            return {"error": "Reaction window has not expired"}
        trigger["status"] = "expired"
        result = {"status": "expired"}
    else:
        if command.trigger_id != trigger["trigger_id"] or actor_id != trigger["attacker_id"]:
            return {"error": "Reaction trigger is stale or belongs to another actor"}
        if command.target_id != pending["actor_id"]:
            return {"error": "Reaction target does not match its trigger"}
        if time.time() >= pending["expires_at"]:
            return {"error": "Reaction window expired; refresh combat state"}
        mover = service._get_combatant(state, pending["actor_id"])
        table = context.table_lookup(state.table_id)
        token = table.find_entity_by_sprite_id(mover.entity_id) if table and mover else None
        original = pending["command"]
        if token is None or tuple(token.position) != (original["from_x"], original["from_y"]):
            state.pending_movement = None
            return {
                "movement_status": "cancelled",
                "movement_id": pending["movement_id"],
                "reason": "Moving token changed",
            }
        if command.use_reaction:
            actor = service._get_combatant(state, actor_id)
            attacker_token = table.find_entity_by_sprite_id(actor.entity_id)
            if attacker_token is None or list(attacker_token.position) != trigger["attacker_position"]:
                return {"error": "Reacting token moved; pass or refresh this reaction"}
            mover = service._get_combatant(state, pending["actor_id"])
            if command.action_id not in trigger["action_ids"] or command.manual:
                return {"error": "Choose a melee action authorized by this trigger"}
            table = context.table_lookup(state.table_id)
            scene = await run_blocking(_table_at, table, mover, trigger["point"])
            # Trigger verification authorizes timing, never client mechanics.
            result = apply_combat_action(
                service,
                command,
                replace(context, reaction_authorized=True, table_lookup=lambda _table: scene),
                state,
                actor_id,
            )
            if "error" in result:
                return result
            trigger["status"] = "used"
        else:
            trigger["status"] = "passed"
            result = {"status": "passed"}
    result = {**result, "trigger_id": trigger["trigger_id"], "movement_id": pending["movement_id"]}
    mover = service._get_combatant(state, pending["actor_id"])
    if mover is None or mover.is_defeated or mover.hp <= 0 or not mover.can_act():
        state.pending_movement = None
        return {**result, "movement_status": "cancelled", "reason": "Mover cannot continue"}
    for item in pending["triggers"]:
        actor = service._get_combatant(state, item["attacker_id"])
        if item["status"] == "pending" and (
            actor is None or actor.hp <= 0 or actor.is_defeated or not actor.has_reaction or not actor.can_act()
        ):
            item["status"] = "unavailable"
    if next_trigger(pending) is not None:
        pending["expires_at"] = time.time() + pending["timeout_seconds"]
        return {**result, "movement_status": "awaiting_reactions"}
    # Revalidate membership, control, turn, geometry, budget and exact start.
    role = await run_blocking(context.mover_role, pending["requester_user_id"]) if context.mover_role else None
    if (
        not can_interact(role)
        or (not is_dm(role) and str(pending["requester_user_id"]) not in mover.controlled_by)
        or state.round_number != pending["round_number"]
        or state.current_turn_index != pending["turn_index"]
    ):
        state.pending_movement = None
        return {**result, "movement_status": "cancelled", "reason": "Movement authority changed"}
    if context.resume_context is None:
        return {"error": "Movement resume context unavailable"}
    resumed = context.resume_context(role, pending["requester_user_id"])
    resumed = replace(resumed, resuming_movement=True)
    move = type(command).model_validate(pending["command"])
    table = resumed.table_lookup(state.table_id)
    token = table.find_entity_by_sprite_id(mover.entity_id) if table else None
    if token is None or tuple(token.position) != (move.from_x, move.from_y):
        state.pending_movement = None
        return {**result, "movement_status": "cancelled", "reason": "Moving token changed"}
    movement = await service._apply_move(move, resumed, state, pending["actor_id"], move_undos)
    state.pending_movement = None
    if "error" in movement:
        return {**result, "movement_status": "cancelled", "reason": movement["error"]}
    return {**result, "movement_status": "completed", "movement": movement}
