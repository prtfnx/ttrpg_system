from __future__ import annotations

import time
import uuid
from copy import deepcopy
from dataclasses import dataclass
from dataclasses import field as dataclass_field
from enum import Enum
from typing import Any, Awaitable, Callable, Optional

from core_table.combat import CombatAction, CombatState
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from service.combat_persistence_service import CombatPersistenceService
from utils.roles import is_dm


class CombatCommandType(str, Enum):
    START_COMBAT = "start_combat"
    END_COMBAT = "end_combat"
    ADD_COMBATANT = "add_combatant"
    SET_TERRAIN = "set_terrain"
    ADD_COVER_ZONE = "add_cover_zone"
    REMOVE_COVER_ZONE = "remove_cover_zone"
    MOVE = "move"
    ATTACK = "attack"
    CAST_SPELL = "cast_spell"
    DASH = "dash"
    DODGE = "dodge"
    DISENGAGE = "disengage"
    HELP = "help"
    HIDE = "hide"
    END_TURN = "end_turn"
    DM_OVERRIDE = "dm_override"
    ROLL_INITIATIVE = "roll_initiative"
    SET_INITIATIVE = "set_initiative"
    REMOVE_COMBATANT = "remove_combatant"
    SKIP_TURN = "skip_turn"
    ROLL_DEATH_SAVE = "roll_death_save"
    REVERT_ACTION = "revert_action"
    RESOLVE_OPPORTUNITY_ATTACK = "resolve_opportunity_attack"


class DMOverrideType(str, Enum):
    SET_HP = "set_hp"
    SET_TEMP_HP = "set_temp_hp"
    APPLY_DAMAGE = "apply_damage"
    APPLY_HEALING = "apply_healing"
    GRANT_RESOURCE = "grant_resource"
    ADD_CONDITION = "add_condition"
    REMOVE_CONDITION = "remove_condition"
    SET_DAMAGE_TRAITS = "set_damage_traits"
    SET_SURPRISED = "set_surprised"
    CONFIGURE_AI = "configure_ai"
    RESTORE_SPELL_SLOT = "restore_spell_slot"


class DMResourceType(str, Enum):
    ACTION = "action"
    BONUS_ACTION = "bonus_action"
    REACTION = "reaction"
    MOVEMENT = "movement"


class CombatCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: CombatCommandType
    actor_id: str = Field(min_length=1)
    entity_id: Optional[str] = None
    entity_ids: list[str] = Field(default_factory=list)
    combatants: list[dict[str, Any]] = Field(default_factory=list)
    names: dict[str, str] = Field(default_factory=dict)
    settings: Optional[dict[str, Any]] = None
    name: Optional[str] = None
    character_id: Optional[str] = None
    cells: list[Any] = Field(default_factory=list)
    mode: str = "add"
    zone: Optional[dict[str, Any]] = None
    zone_id: Optional[str] = None
    target_id: Optional[str] = None
    target_ids: list[str] = Field(default_factory=list)
    table_id: Optional[str] = None
    target_x: Optional[float] = None
    target_y: Optional[float] = None
    from_x: Optional[float] = None
    from_y: Optional[float] = None
    cost_ft: Optional[float] = None
    path: list[Any] = Field(default_factory=list)
    attack_bonus: int = 0
    damage_formula: str = "1d4"
    damage_type: str = "bludgeoning"
    attack_type: str = "melee"
    range_ft: float = 5.0
    spell_name: str = ""
    spell_level: int = 1
    save_ability: str = ""
    save_dc: int = 0
    requires_attack_roll: bool = False
    is_concentration: bool = False
    confirm_opportunity_attacks: bool = False
    override_type: Optional[DMOverrideType] = None
    value: Optional[float] = None
    resource: Optional[DMResourceType] = None
    condition_type: Optional[str] = None
    duration: Optional[int] = Field(default=None, ge=1)
    source: str = "dm"
    resistances: Optional[list[str]] = None
    vulnerabilities: Optional[list[str]] = None
    immunities: Optional[list[str]] = None
    surprised: Optional[bool] = None
    initiative: Optional[float] = None
    ai_enabled: Optional[bool] = None
    ai_behavior: Optional[str] = None
    slot_level: Optional[int] = Field(default=None, ge=1, le=9)
    use_reaction: bool = True

    @field_validator("target_ids", mode="before")
    @classmethod
    def _coerce_target_ids(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, list):
            return [str(v) for v in value]
        return [str(value)]

    @field_validator("entity_ids", mode="before")
    @classmethod
    def _coerce_entity_ids(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, list):
            return [str(v) for v in value if v]
        return [str(value)]


class CombatCommandEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sequence_id: int = 0
    commands: list[CombatCommand] = Field(default_factory=list, min_length=1)

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "CombatCommandEnvelope":
        return cls.model_validate(payload)


@dataclass(frozen=True)
class CombatCommandContext:
    session_code: str
    client_id: str
    role: str
    user_id: Optional[int]
    table_lookup: Callable[[str], Any | None] = lambda _table_id: None
    move_sprite: Optional[
        Callable[[str, str, dict[str, float], dict[str, float], str], Awaitable[dict[str, Any]]]
    ] = None
    validate_move: Optional[
        Callable[[str, str, dict[str, float], dict[str, float], list[Any], Any], dict[str, Any]]
    ] = None
    build_combatants: Optional[
        Callable[[str, list[str], list[dict[str, Any]]], list[dict[str, Any]]]
    ] = None
    save_table: Optional[Callable[[str], str | None]] = None


@dataclass
class CombatCommandResult:
    accepted: bool
    sequence_id: int
    applied: list[dict[str, Any]]
    combat: dict[str, Any] | None = None
    failed_index: int | None = None
    reason: str = ""
    details: dict[str, Any] = dataclass_field(default_factory=dict)
    state_version: int | None = None
    duplicate: bool = False

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "accepted": self.accepted,
            "sequence_id": self.sequence_id,
            "applied": self.applied,
        }
        if self.combat is not None:
            data["combat"] = self.combat
        if self.failed_index is not None:
            data["failed_index"] = self.failed_index
        if self.reason:
            data["reason"] = self.reason
        if self.details:
            data["details"] = self.details
        if self.state_version is not None:
            data["state_version"] = self.state_version
        if self.duplicate:
            data["duplicate"] = True
        return data

    @classmethod
    def from_dict(
        cls,
        data: dict[str, Any],
        *,
        duplicate: bool = False,
    ) -> "CombatCommandResult":
        return cls(
            accepted=bool(data.get("accepted")),
            sequence_id=int(data.get("sequence_id", 0)),
            applied=list(data.get("applied", [])),
            combat=data.get("combat"),
            failed_index=data.get("failed_index"),
            reason=str(data.get("reason", "")),
            details=dict(data.get("details", {})),
            state_version=data.get("state_version"),
            duplicate=duplicate,
        )


class CombatCommandService:
    """Server-authoritative combat command application service.

    React may preview and compose commands, but accepted mutations go through this
    service so turn checks, ownership, resources, and outcomes stay centralized.
    """

    def __init__(
        self,
        combat_engine=None,
        persistence: CombatPersistenceService | None = None,
    ):
        if combat_engine is None:
            from service.combat_engine import CombatEngine
            combat_engine = CombatEngine
        self._engine = combat_engine
        self._persistence = persistence

    def parse_envelope(self, payload: dict[str, Any]) -> CombatCommandEnvelope:
        return CombatCommandEnvelope.from_payload(payload)

    def apply(
        self,
        envelope: CombatCommandEnvelope,
        context: CombatCommandContext,
    ) -> CombatCommandResult:
        for idx, command in enumerate(envelope.commands):
            if command.type == CombatCommandType.MOVE:
                return self._reject(envelope.sequence_id, idx, "Movement commands require async application")
        state = self._engine.get_state(context.session_code)
        if not state:
            return self._reject(envelope.sequence_id, 0, "No active combat")

        snapshot = deepcopy(state.to_dict())
        duplicate = self._find_duplicate(envelope, context, state.combat_id)
        if duplicate:
            return duplicate
        applied: list[dict[str, Any]] = []

        for idx, command in enumerate(envelope.commands):
            actor_id: str | None = None
            if self._requires_existing_combatant(command):
                actor_id = self._resolve_combatant_id(state, command.actor_id)
                if actor_id is None:
                    self._restore(context.session_code, snapshot)
                    return self._reject(envelope.sequence_id, idx, "Combatant not found")

            error = self._assert_turn_and_control(state, actor_id, command, context)
            if error:
                self._restore(context.session_code, snapshot)
                return self._reject(envelope.sequence_id, idx, error)

            command_result = self._apply_one(command, context, state, actor_id)
            if "error" in command_result:
                self._restore(context.session_code, snapshot)
                return self._reject(
                    envelope.sequence_id,
                    idx,
                    str(command_result["error"]),
                    self._result_details(command_result),
                )

            applied.append({
                "sequence_index": idx,
                "action_type": command.type.value,
                "actor_id": actor_id,
                "result": command_result,
            })
            state = self._engine.get_state(context.session_code)
            if not state:
                self._restore(context.session_code, snapshot)
                return self._reject(envelope.sequence_id, idx, "Combat ended unexpectedly")

        current = self._engine.get_state(context.session_code)
        accepted_result = CombatCommandResult(
            accepted=True,
            sequence_id=envelope.sequence_id,
            applied=applied,
            combat=current.to_dict() if current else None,
        )
        try:
            return self._persist_result(
                envelope,
                context,
                snapshot,
                current,
                accepted_result,
            )
        except Exception:
            self._restore(context.session_code, snapshot)
            return self._reject(
                envelope.sequence_id,
                0,
                "Failed to persist combat command",
            )

    async def apply_async(
        self,
        envelope: CombatCommandEnvelope,
        context: CombatCommandContext,
    ) -> CombatCommandResult:
        single_command_types = {CombatCommandType.START_COMBAT, CombatCommandType.END_COMBAT}
        if len(envelope.commands) > 1 and any(command.type in single_command_types for command in envelope.commands):
            return self._reject(
                envelope.sequence_id,
                0,
                "Combat lifecycle commands must be sent individually",
            )

        table_environment_types = self._table_environment_types()
        state = self._engine.get_state(context.session_code)
        if (
            not state
            and envelope.commands[0].type != CombatCommandType.START_COMBAT
            and envelope.commands[0].type not in table_environment_types
        ):
            return self._reject(envelope.sequence_id, 0, "No active combat")

        snapshot = deepcopy(state.to_dict()) if state else None
        duplicate = self._find_duplicate(envelope, context, state.combat_id) if state else None
        if duplicate:
            return duplicate
        applied: list[dict[str, Any]] = []
        move_undos: list[tuple[str, str, dict[str, float], dict[str, float]]] = []

        for idx, command in enumerate(envelope.commands):
            actor_id: str | None = None
            if self._requires_existing_combatant(command):
                if state is None:
                    await self._restore_async(context, snapshot, move_undos)
                    return self._reject(envelope.sequence_id, idx, "No active combat")
                actor_id = self._resolve_combatant_id(state, command.actor_id)
                if actor_id is None:
                    await self._restore_async(context, snapshot, move_undos)
                    return self._reject(envelope.sequence_id, idx, "Combatant not found")

            error = self._assert_turn_and_control(state, actor_id, command, context)
            if error:
                await self._restore_async(context, snapshot, move_undos)
                return self._reject(envelope.sequence_id, idx, error)

            command_result = await self._apply_one_async(
                command, context, state, actor_id, move_undos
            )
            if "error" in command_result:
                await self._restore_async(context, snapshot, move_undos)
                return self._reject(
                    envelope.sequence_id,
                    idx,
                    str(command_result["error"]),
                    self._result_details(command_result),
                )

            applied.append({
                "sequence_index": idx,
                "action_type": command.type.value,
                "actor_id": (
                    command_result.get("combatant_id")
                    or actor_id
                    or command.actor_id
                ),
                "result": command_result,
            })
            state = self._engine.get_state(context.session_code)
            if (
                not state
                and command.type != CombatCommandType.END_COMBAT
                and command.type not in table_environment_types
            ):
                await self._restore_async(context, snapshot, move_undos)
                return self._reject(envelope.sequence_id, idx, "Combat ended unexpectedly")

        current = self._engine.get_state(context.session_code)
        accepted_result = CombatCommandResult(
            accepted=True,
            sequence_id=envelope.sequence_id,
            applied=applied,
            combat=(
                current.to_dict()
                if current
                else command_result.get("combat")
            ),
        )
        if current is None and all(command.type in table_environment_types for command in envelope.commands):
            return accepted_result
        try:
            return self._persist_result(
                envelope,
                context,
                snapshot,
                current,
                accepted_result,
            )
        except Exception:
            await self._restore_async(context, snapshot, move_undos)
            return self._reject(
                envelope.sequence_id,
                0,
                "Failed to persist combat command",
            )

    def _apply_one(
        self,
        command: CombatCommand,
        context: CombatCommandContext,
        state,
        actor_id: str | None,
    ) -> dict[str, Any]:
        if command.type in {
            CombatCommandType.START_COMBAT,
            CombatCommandType.END_COMBAT,
            CombatCommandType.ADD_COMBATANT,
            *self._table_environment_types(),
        }:
            return {"error": "Combat lifecycle commands require async application"}
        if command.type == CombatCommandType.REVERT_ACTION:
            return self._apply_revert_action(context, state)
        if actor_id is None:
            return {"error": "Combatant not found"}
        if command.type == CombatCommandType.DM_OVERRIDE:
            return self._apply_dm_override(command, context, state, actor_id)

        if command.type == CombatCommandType.RESOLVE_OPPORTUNITY_ATTACK:
            return self._apply_opportunity_attack(command, context, state, actor_id)

        if command.type == CombatCommandType.ATTACK:
            if not command.target_id:
                return {"error": "target_id required"}
            target_id = self._resolve_combatant_id(state, command.target_id)
            if target_id is None:
                return {"error": "target_id not found"}
            table = context.table_lookup(command.table_id or "")
            return self._engine.execute_attack(
                context.session_code,
                attacker_id=actor_id,
                target_id=target_id,
                attack_bonus=command.attack_bonus,
                damage_formula=command.damage_formula,
                damage_type=command.damage_type,
                attack_type=command.attack_type,
                weapon_range_ft=command.range_ft,
                table=table,
            )

        if command.type == CombatCommandType.CAST_SPELL:
            target_ids = [
                combatant_id
                for target in command.target_ids
                if (combatant_id := self._resolve_combatant_id(state, target)) is not None
            ]
            if command.target_ids and len(target_ids) != len(command.target_ids):
                return {"error": "target_id not found"}
            return self._engine.execute_spell(
                context.session_code,
                caster_id=actor_id,
                spell_name=command.spell_name,
                spell_level=command.spell_level,
                target_ids=target_ids,
                damage_formula=command.damage_formula,
                save_ability=command.save_ability,
                save_dc=command.save_dc,
                damage_type=command.damage_type,
                requires_attack_roll=command.requires_attack_roll,
                attack_bonus=command.attack_bonus,
                is_concentration=command.is_concentration,
            )

        if command.type == CombatCommandType.ROLL_INITIATIVE:
            value = self._engine.roll_initiative(context.session_code, actor_id)
            if value is None:
                return {"error": "Failed to roll initiative"}
            return {
                "combatant_id": actor_id,
                "value": value,
                "order": self._initiative_order(state),
            }

        if command.type == CombatCommandType.ROLL_DEATH_SAVE:
            result = self._engine.roll_death_save(context.session_code, actor_id)
            if result is None:
                return {"error": "Cannot roll — combatant is not downed"}
            return result

        if command.type == CombatCommandType.SET_INITIATIVE:
            if command.initiative is None:
                return {"error": "initiative required"}
            if not self._engine.set_initiative(
                context.session_code,
                actor_id,
                command.initiative,
            ):
                return {"error": "Failed to set initiative"}
            return {
                "combatant_id": actor_id,
                "value": command.initiative,
                "order": self._initiative_order(state),
            }

        if command.type == CombatCommandType.REMOVE_COMBATANT:
            if not self._engine.remove_combatant(context.session_code, actor_id):
                return {"error": "Failed to remove combatant"}
            return {
                "removed": actor_id,
                "order": self._initiative_order(state),
            }

        if command.type == CombatCommandType.SKIP_TURN:
            current = state.get_current_combatant()
            if current is None or current.combatant_id != actor_id:
                return {"error": "Can only skip the current turn"}
            result = self._engine.next_turn(context.session_code)
            return result or {"error": "Failed to skip turn"}

        if command.type == CombatCommandType.END_TURN:
            if not self._engine.end_turn(context.session_code, actor_id):
                return {"error": "Cannot end turn"}
            return {"action_type": "end_turn", "combatant_id": actor_id}

        return self._engine.execute_utility(
            context.session_code,
            actor_id,
            command.type.value,
        )

    def _apply_opportunity_attack(
        self,
        command: CombatCommand,
        context: CombatCommandContext,
        state,
        actor_id: str,
    ) -> dict[str, Any]:
        if not command.use_reaction:
            return {
                "resolved": True,
                "passed": True,
                "attacker": actor_id,
                "target": command.target_id,
            }
        if not command.target_id:
            return {"error": "target_id required"}
        target_id = self._resolve_combatant_id(state, command.target_id)
        if target_id is None:
            return {"error": "target_id not found"}

        attacker = self._get_combatant(state, actor_id)
        target = self._get_combatant(state, target_id)
        if attacker is None or target is None:
            return {"error": "Combatant not found"}
        if not attacker.has_reaction:
            return {"error": "Reaction already used"}

        from core_table.session_rules import SessionRules
        from service.attack_resolver import AttackResolver

        attacker.has_reaction = False
        resolver = AttackResolver(SessionRules.defaults(context.session_code or "default"))
        result = resolver.resolve_attack(
            attacker,
            target,
            attack_bonus=command.attack_bonus,
            damage_formula=command.damage_formula or "1d6+0",
            damage_type=command.damage_type or "bludgeoning",
            combat=state,
        )
        damage_result = None
        if result.hit:
            damage_result = self._engine.apply_damage(
                context.session_code,
                target_id,
                result.damage_dealt,
            )

        payload = {
            "hit": result.hit,
            "damage": result.damage_dealt,
            "attacker": actor_id,
            "target": target_id,
            "reason": result.reason,
        }
        if damage_result is not None:
            payload["damage_result"] = damage_result
        return payload

    def _apply_revert_action(
        self,
        context: CombatCommandContext,
        state,
    ) -> dict[str, Any]:
        if self._persistence is None:
            return {"error": "Combat persistence unavailable"}

        last_action = self._persistence.last_action(state.combat_id)
        if (
            last_action is None
            or last_action.command_type in {"dm_revert_action", "revert_action"}
            or not last_action.state_before
        ):
            return {"error": "Nothing to revert"}

        from core_table.combat import CombatState

        reverted_state = CombatState.from_dict(last_action.state_before)
        self._engine._active[context.session_code] = reverted_state
        return {
            "reverted": True,
            "reverted_command_type": last_action.command_type,
            "reverted_state_version": last_action.state_version,
        }

    def _apply_dm_override(
        self,
        command: CombatCommand,
        context: CombatCommandContext,
        state,
        actor_id: str,
    ) -> dict[str, Any]:
        if command.override_type is None:
            return {"error": "override_type required"}
        actor = self._get_combatant(state, actor_id)
        if actor is None:
            return {"error": "Combatant not found"}

        if command.override_type == DMOverrideType.SET_HP:
            if command.value is None:
                return {"error": "value required"}
            if not self._engine.dm_set_hp(context.session_code, actor_id, int(command.value)):
                return {"error": "Failed to set HP"}
            return {
                "override_type": command.override_type.value,
                "combatant_id": actor_id,
                "hp": actor.hp,
            }

        if command.override_type == DMOverrideType.SET_TEMP_HP:
            if command.value is None:
                return {"error": "value required"}
            result = self._engine.set_temp_hp(
                context.session_code,
                actor_id,
                int(command.value),
            )
            return result or {"error": "Failed to set temporary HP"}

        if command.override_type == DMOverrideType.APPLY_DAMAGE:
            if command.value is None or command.value < 0:
                return {"error": "non-negative value required"}
            return self._engine.apply_damage(
                context.session_code,
                actor_id,
                int(command.value),
                damage_type=command.damage_type,
                is_dm=True,
            )

        if command.override_type == DMOverrideType.APPLY_HEALING:
            if command.value is None or command.value < 0:
                return {"error": "non-negative value required"}
            return self._engine.apply_healing(
                context.session_code,
                actor_id,
                int(command.value),
            )

        if command.override_type == DMOverrideType.GRANT_RESOURCE:
            if command.resource is None:
                return {"error": "resource required"}
            amount = command.value if command.value is not None else 1
            if not self._engine.dm_grant_resource(
                context.session_code,
                actor_id,
                command.resource.value,
                amount,
            ):
                return {"error": "Failed to grant resource"}
            return {
                "override_type": command.override_type.value,
                "combatant_id": actor_id,
                "resource": command.resource.value,
                "amount": amount,
            }

        if command.override_type == DMOverrideType.ADD_CONDITION:
            if not command.condition_type:
                return {"error": "condition_type required"}
            return self._engine.add_condition(
                context.session_code,
                actor_id,
                command.condition_type,
                source=command.source,
                duration=command.duration,
            )

        if command.override_type == DMOverrideType.REMOVE_CONDITION:
            if not command.condition_type:
                return {"error": "condition_type required"}
            return self._engine.remove_condition(
                context.session_code,
                actor_id,
                command.condition_type,
            )

        if command.override_type == DMOverrideType.SET_DAMAGE_TRAITS:
            if (
                command.resistances is None
                and command.vulnerabilities is None
                and command.immunities is None
            ):
                return {"error": "damage traits required"}
            result = self._engine.set_resistances(
                context.session_code,
                actor_id,
                resistances=command.resistances,
                vulnerabilities=command.vulnerabilities,
                immunities=command.immunities,
            )
            return result or {"error": "Failed to set damage traits"}

        if command.override_type == DMOverrideType.SET_SURPRISED:
            if command.surprised is None:
                return {"error": "surprised required"}
            result = self._engine.set_surprised(
                context.session_code,
                [actor_id],
                command.surprised,
            )
            return result or {"error": "Failed to set surprised state"}

        if command.override_type == DMOverrideType.CONFIGURE_AI:
            return self._engine.configure_ai(
                context.session_code,
                actor_id,
                enabled=command.ai_enabled,
                behavior=command.ai_behavior,
            )

        if command.override_type == DMOverrideType.RESTORE_SPELL_SLOT:
            if command.slot_level is None:
                return {"error": "slot_level required"}
            return self._engine.restore_spell_slot(
                context.session_code,
                actor_id,
                command.slot_level,
            )

        return {"error": "Unsupported DM override"}

    async def _apply_one_async(
        self,
        command: CombatCommand,
        context: CombatCommandContext,
        state,
        actor_id: str | None,
        move_undos: list[tuple[str, str, dict[str, float], dict[str, float]]],
    ) -> dict[str, Any]:
        if command.type == CombatCommandType.START_COMBAT:
            return self._apply_start_combat(command, context)
        if command.type == CombatCommandType.END_COMBAT:
            return self._apply_end_combat(context)
        if command.type == CombatCommandType.ADD_COMBATANT:
            return self._apply_add_combatant(command, context, state)
        if command.type == CombatCommandType.SET_TERRAIN:
            return self._apply_set_terrain(command, context)
        if command.type == CombatCommandType.ADD_COVER_ZONE:
            return self._apply_add_cover_zone(command, context)
        if command.type == CombatCommandType.REMOVE_COVER_ZONE:
            return self._apply_remove_cover_zone(command, context)
        if command.type == CombatCommandType.MOVE:
            if actor_id is None:
                return {"error": "Combatant not found"}
            return await self._apply_move(command, context, state, actor_id, move_undos)
        return self._apply_one(command, context, state, actor_id)

    def _apply_start_combat(
        self,
        command: CombatCommand,
        context: CombatCommandContext,
    ) -> dict[str, Any]:
        if not command.table_id:
            return {"error": "table_id required"}

        from core_table.combat import CombatSettings

        incoming_combatants = [item for item in command.combatants if isinstance(item, dict)]
        entity_ids = list(command.entity_ids)
        if not entity_ids:
            entity_ids = [str(item.get("entity_id")) for item in incoming_combatants if item.get("entity_id")]
        combatants = (
            context.build_combatants(command.table_id, entity_ids, incoming_combatants)
            if context.build_combatants is not None
            else incoming_combatants
        )
        settings = CombatSettings.from_dict(command.settings) if command.settings else None
        state = self._engine.start_combat(
            session_id=context.session_code,
            table_id=command.table_id,
            entity_ids=entity_ids,
            settings=settings,
            names=command.names,
            combatants=combatants,
        )
        return {
            "combat": state.to_dict(),
            "table_id": command.table_id,
            "combatant_count": len(state.combatants),
        }

    def _apply_end_combat(self, context: CombatCommandContext) -> dict[str, Any]:
        state = self._engine.end_combat(context.session_code)
        if not state:
            return {"error": "No active combat"}
        return {"combat": state.to_dict(), "ended": True}

    def _apply_add_combatant(
        self,
        command: CombatCommand,
        context: CombatCommandContext,
        state,
    ) -> dict[str, Any]:
        if state is None:
            return {"error": "No active combat"}
        entity_id = command.entity_id or command.actor_id
        if not entity_id or entity_id == "__dm__":
            return {"error": "entity_id required"}
        table_id = command.table_id or str(getattr(state, "table_id", "") or "")
        if not table_id:
            return {"error": "table_id required"}
        incoming = {
            "entity_id": entity_id,
            "character_id": command.character_id,
            "name": command.name,
        }
        incoming_combatants = command.combatants or [incoming]
        resolved = (
            context.build_combatants(table_id, [str(entity_id)], incoming_combatants)
            if context.build_combatants is not None
            else incoming_combatants
        )
        payload = dict(resolved[0]) if resolved else incoming
        extra = {k: v for k, v in payload.items() if k != "entity_id"}
        combatant = self._engine.add_combatant(context.session_code, str(entity_id), **extra)
        if not combatant:
            return {"error": "No active combat"}
        current = self._engine.get_state(context.session_code) or state
        return {
            "combatant_id": combatant.combatant_id,
            "combatant": combatant.to_dict(),
            "order": self._initiative_order(current),
        }

    def _apply_set_terrain(
        self,
        command: CombatCommand,
        context: CombatCommandContext,
    ) -> dict[str, Any]:
        if not command.table_id:
            return {"error": "table_id required"}
        table = context.table_lookup(command.table_id)
        if table is None:
            return {"error": "Table not found"}
        if not hasattr(table, "difficult_terrain_cells"):
            table.difficult_terrain_cells = set()
        previous_cells = set(table.difficult_terrain_cells)
        try:
            if command.mode == "clear":
                table.difficult_terrain_cells.clear()
            elif command.mode == "remove":
                for col, row in command.cells:
                    table.difficult_terrain_cells.discard((col, row))
            else:
                for col, row in command.cells:
                    table.difficult_terrain_cells.add((col, row))
        except (TypeError, ValueError):
            table.difficult_terrain_cells = previous_cells
            return {"error": "Invalid terrain cells"}
        persist_error = self._save_table(context, command.table_id)
        if persist_error:
            table.difficult_terrain_cells = previous_cells
            return {"error": persist_error}
        return {
            "table_id": command.table_id,
            "mode": command.mode,
            "difficult_terrain": [list(cell) for cell in table.difficult_terrain_cells],
        }

    def _apply_add_cover_zone(
        self,
        command: CombatCommand,
        context: CombatCommandContext,
    ) -> dict[str, Any]:
        if not command.table_id:
            return {"error": "table_id required"}
        if not command.zone:
            return {"error": "zone required"}
        table = context.table_lookup(command.table_id)
        if table is None:
            return {"error": "Table not found"}
        from core_table.table import CoverZone
        zone = CoverZone.from_dict(command.zone)
        if not hasattr(table, "cover_zones"):
            table.cover_zones = []
        previous_zones = list(table.cover_zones)
        table.cover_zones = [item for item in table.cover_zones if item.zone_id != zone.zone_id]
        table.cover_zones.append(zone)
        persist_error = self._save_table(context, command.table_id)
        if persist_error:
            table.cover_zones = previous_zones
            return {"error": persist_error}
        return {"table_id": command.table_id, "zone": zone.to_dict()}

    def _apply_remove_cover_zone(
        self,
        command: CombatCommand,
        context: CombatCommandContext,
    ) -> dict[str, Any]:
        if not command.table_id:
            return {"error": "table_id required"}
        if not command.zone_id:
            return {"error": "zone_id required"}
        table = context.table_lookup(command.table_id)
        if table is None:
            return {"error": "Table not found"}
        previous_zones = list(getattr(table, "cover_zones", []))
        if hasattr(table, "cover_zones"):
            table.cover_zones = [item for item in table.cover_zones if item.zone_id != command.zone_id]
        persist_error = self._save_table(context, command.table_id)
        if persist_error:
            table.cover_zones = previous_zones
            return {"error": persist_error}
        return {"table_id": command.table_id, "zone_id": command.zone_id}

    @staticmethod
    def _save_table(context: CombatCommandContext, table_id: str) -> str | None:
        if context.save_table is None:
            return None
        return context.save_table(table_id)

    async def _apply_move(
        self,
        command: CombatCommand,
        context: CombatCommandContext,
        state,
        actor_id: str,
        move_undos: list[tuple[str, str, dict[str, float], dict[str, float]]],
    ) -> dict[str, Any]:
        if context.move_sprite is None:
            return {"error": "move_sprite callback required"}
        if not command.table_id:
            return {"error": "table_id required"}
        if command.target_x is None or command.target_y is None:
            return {"error": "target_x and target_y required"}
        if command.from_x is None or command.from_y is None:
            return {"error": "from_x and from_y required"}
        if context.validate_move is None:
            return {"error": "validate_move callback required"}

        actor = self._get_combatant(state, actor_id)
        if actor is None:
            return {"error": "Combatant not found"}

        from_pos = {
            "x": float(command.from_x),
            "y": float(command.from_y),
        }
        to_pos = {"x": float(command.target_x), "y": float(command.target_y)}
        validation = context.validate_move(
            command.table_id,
            actor.entity_id,
            from_pos,
            to_pos,
            command.path,
            actor,
        )
        if not validation.get("success", False):
            return {"error": validation.get("message") or "Move validation failed"}
        movement_cost = validation.get("movement_cost")
        if not isinstance(movement_cost, (int, float)) or movement_cost < 0:
            return {"error": "Movement validation did not return a valid cost"}
        if movement_cost > actor.movement_remaining:
            return {
                "error": (
                    f"Insufficient movement: need {movement_cost:.0f}ft, "
                    f"have {actor.movement_remaining:.0f}ft"
                )
            }
        triggers = validation.get("opportunity_attack_triggers") or []
        if triggers and not command.confirm_opportunity_attacks:
            return {
                "error": "Opportunity attack warning",
                "details": {
                    "code": "opportunity_attack_warning",
                    "entity_id": actor.entity_id,
                    "triggers": triggers,
                },
            }

        actor_before = actor.to_dict()
        move_result = await context.move_sprite(
            command.table_id,
            actor.entity_id,
            from_pos,
            to_pos,
            context.session_code,
        )
        if not move_result.get("success", False):
            return {"error": move_result.get("message") or "Move failed"}

        actor.movement_remaining -= movement_cost
        state.action_log.append(CombatAction(
            action_id=str(uuid.uuid4()),
            combat_id=state.combat_id,
            round_number=state.round_number,
            turn_index=state.current_turn_index,
            actor_id=actor_id,
            action_type="move",
            action_cost="movement",
            outcome="moved",
            state_before=actor_before,
            timestamp=time.time(),
        ))
        move_undos.append((command.table_id, actor.entity_id, to_pos, from_pos))
        return {
            "action_type": "move",
            "combatant_id": actor_id,
            "entity_id": actor.entity_id,
            "from": from_pos,
            "to": to_pos,
            "cost_ft": movement_cost,
            "declared_cost_ft": command.cost_ft,
            "movement_remaining": actor.movement_remaining,
            "path": command.path,
        }

    def _resolve_combatant_id(self, state, identifier: str) -> str | None:
        for combatant in state.combatants:
            if identifier in {combatant.combatant_id, combatant.entity_id, combatant.character_id}:
                return combatant.combatant_id
        return None

    def _get_combatant(self, state, combatant_id: str):
        return next((c for c in state.combatants if c.combatant_id == combatant_id), None)

    @staticmethod
    def _initiative_order(state) -> list[dict[str, Any]]:
        return [
            {
                "combatant_id": combatant.combatant_id,
                "name": combatant.name,
                "initiative": combatant.initiative,
            }
            for combatant in state.combatants
        ]

    def _assert_turn_and_control(
        self,
        state,
        actor_id: str | None,
        command: CombatCommand,
        context: CombatCommandContext,
    ) -> str | None:
        if command.type in {
            CombatCommandType.START_COMBAT,
            CombatCommandType.END_COMBAT,
            CombatCommandType.ADD_COMBATANT,
            *self._table_environment_types(),
        }:
            return None if is_dm(context.role) else "DMs only"
        if command.type == CombatCommandType.DM_OVERRIDE:
            return None if is_dm(context.role) else "DMs only"
        if command.type in {
            CombatCommandType.SET_INITIATIVE,
            CombatCommandType.REMOVE_COMBATANT,
            CombatCommandType.SKIP_TURN,
            CombatCommandType.REVERT_ACTION,
        }:
            return None if is_dm(context.role) else "DMs only"
        if actor_id is None:
            return "Combatant not found"
        if command.type == CombatCommandType.RESOLVE_OPPORTUNITY_ATTACK:
            if is_dm(context.role):
                return None
            actor = self._get_combatant(state, actor_id)
            if (
                actor is None
                or context.user_id is None
                or str(context.user_id) not in actor.controlled_by
            ):
                return "You do not control this combatant"
            return None
        if command.type in {
            CombatCommandType.ROLL_INITIATIVE,
            CombatCommandType.ROLL_DEATH_SAVE,
        }:
            if is_dm(context.role):
                return None
            actor = self._get_combatant(state, actor_id)
            if (
                actor is None
                or context.user_id is None
                or str(context.user_id) not in actor.controlled_by
            ):
                return "You do not control this combatant"
            return None
        current = state.get_current_combatant()
        if not current or current.combatant_id != actor_id:
            return "Not your turn"
        if is_dm(context.role):
            return None
        if context.user_id is None or str(context.user_id) not in current.controlled_by:
            return "You do not control this combatant"
        return None

    @staticmethod
    def _requires_existing_combatant(command: CombatCommand) -> bool:
        return command.type not in {
            CombatCommandType.START_COMBAT,
            CombatCommandType.END_COMBAT,
            CombatCommandType.ADD_COMBATANT,
            *CombatCommandService._table_environment_types(),
            CombatCommandType.REVERT_ACTION,
        }

    @staticmethod
    def _table_environment_types() -> set[CombatCommandType]:
        return {
            CombatCommandType.SET_TERRAIN,
            CombatCommandType.ADD_COVER_ZONE,
            CombatCommandType.REMOVE_COVER_ZONE,
        }

    def _restore(self, session_code: str, snapshot: dict[str, Any] | None) -> None:
        if snapshot is None:
            self._engine._active.pop(session_code, None)
            return
        self._engine._active[session_code] = CombatState.from_dict(snapshot)

    def _persist(self, session_code: str) -> None:
        persist = getattr(self._engine, "persist", None)
        if callable(persist):
            persist(session_code)

    def _find_duplicate(
        self,
        envelope: CombatCommandEnvelope,
        context: CombatCommandContext,
        encounter_id: str,
    ) -> CombatCommandResult | None:
        if self._persistence is None:
            return None
        stored = self._persistence.find_result(
            encounter_id,
            self._persistence.requester_key(context.user_id, context.client_id),
            envelope.sequence_id,
        )
        if stored is None:
            return None
        return CombatCommandResult.from_dict(stored.result, duplicate=True)

    def _persist_result(
        self,
        envelope: CombatCommandEnvelope,
        context: CombatCommandContext,
        snapshot: dict[str, Any] | None,
        current: CombatState | None,
        result: CombatCommandResult,
    ) -> CombatCommandResult:
        if self._persistence is None:
            self._persist(context.session_code)
            return result
        state_after = current.to_dict() if current is not None else result.combat
        if state_after is None:
            raise RuntimeError("Combat ended before persistence")

        command_types = [command.type.value for command in envelope.commands]
        persisted = self._persistence.persist_accepted(
            session_code=context.session_code,
            requester_key=self._persistence.requester_key(
                context.user_id,
                context.client_id,
            ),
            sequence_id=envelope.sequence_id,
            actor_id=result.applied[0].get("actor_id") if result.applied else None,
            command_type=command_types[0] if len(command_types) == 1 else "batch",
            command_payload=envelope.model_dump(mode="json"),
            result_payload=result.to_dict(),
            state_before=snapshot or {},
            state_after=state_after,
            created_by=context.user_id,
        )
        if current is not None:
            current.state_version = persisted.state_version
        return CombatCommandResult.from_dict(
            persisted.result,
            duplicate=persisted.duplicate,
        )

    async def _restore_async(
        self,
        context: CombatCommandContext,
        snapshot: dict[str, Any] | None,
        move_undos: list[tuple[str, str, dict[str, float], dict[str, float]]],
    ) -> None:
        if context.move_sprite is not None:
            for table_id, entity_id, from_pos, to_pos in reversed(move_undos):
                try:
                    await context.move_sprite(table_id, entity_id, from_pos, to_pos, context.session_code)
                except Exception:
                    pass
        self._restore(context.session_code, snapshot)

    def _result_details(self, result: dict[str, Any]) -> dict[str, Any]:
        details = result.get("details")
        return details if isinstance(details, dict) else {}

    def _reject(
        self,
        sequence_id: int,
        failed_index: int,
        reason: str,
        details: dict[str, Any] | None = None,
    ) -> CombatCommandResult:
        return CombatCommandResult(
            accepted=False,
            sequence_id=sequence_id,
            applied=[],
            failed_index=failed_index,
            reason=reason,
            details=details or {},
        )


def parse_combat_command_payload(payload: dict[str, Any]) -> CombatCommandEnvelope:
    try:
        return CombatCommandEnvelope.from_payload(payload)
    except ValidationError:
        raise
