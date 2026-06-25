from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable, Optional

from core_table.combat import CombatState
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from utils.roles import is_dm


class CombatCommandType(str, Enum):
    ATTACK = "attack"
    CAST_SPELL = "cast_spell"
    DASH = "dash"
    DODGE = "dodge"
    DISENGAGE = "disengage"
    HELP = "help"
    HIDE = "hide"
    END_TURN = "end_turn"


class CombatCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: CombatCommandType
    actor_id: str = Field(min_length=1)
    target_id: Optional[str] = None
    target_ids: list[str] = Field(default_factory=list)
    table_id: Optional[str] = None
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

    @field_validator("target_ids", mode="before")
    @classmethod
    def _coerce_target_ids(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, list):
            return [str(v) for v in value]
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


@dataclass
class CombatCommandResult:
    accepted: bool
    sequence_id: int
    applied: list[dict[str, Any]]
    combat: dict[str, Any] | None = None
    failed_index: int | None = None
    reason: str = ""

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
        return data


class CombatCommandService:
    """Server-authoritative combat command application service.

    React may preview and compose commands, but accepted mutations go through this
    service so turn checks, ownership, resources, and outcomes stay centralized.
    """

    def __init__(self, combat_engine=None):
        if combat_engine is None:
            from service.combat_engine import CombatEngine
            combat_engine = CombatEngine
        self._engine = combat_engine

    def parse_envelope(self, payload: dict[str, Any]) -> CombatCommandEnvelope:
        return CombatCommandEnvelope.from_payload(payload)

    def apply(
        self,
        envelope: CombatCommandEnvelope,
        context: CombatCommandContext,
    ) -> CombatCommandResult:
        state = self._engine.get_state(context.session_code)
        if not state:
            return self._reject(envelope.sequence_id, 0, "No active combat")

        snapshot = state.to_dict()
        applied: list[dict[str, Any]] = []

        for idx, command in enumerate(envelope.commands):
            actor_id = self._resolve_combatant_id(state, command.actor_id)
            if actor_id is None:
                self._restore(context.session_code, snapshot)
                return self._reject(envelope.sequence_id, idx, "Combatant not found")

            error = self._assert_turn_and_control(state, actor_id, context)
            if error:
                self._restore(context.session_code, snapshot)
                return self._reject(envelope.sequence_id, idx, error)

            result = self._apply_one(command, context, state, actor_id)
            if "error" in result:
                self._restore(context.session_code, snapshot)
                return self._reject(envelope.sequence_id, idx, str(result["error"]))

            applied.append({
                "sequence_index": idx,
                "action_type": command.type.value,
                "actor_id": actor_id,
                "result": result,
            })
            state = self._engine.get_state(context.session_code)
            if not state:
                self._restore(context.session_code, snapshot)
                return self._reject(envelope.sequence_id, idx, "Combat ended unexpectedly")

        current = self._engine.get_state(context.session_code)
        return CombatCommandResult(
            accepted=True,
            sequence_id=envelope.sequence_id,
            applied=applied,
            combat=current.to_dict() if current else None,
        )

    def _apply_one(
        self,
        command: CombatCommand,
        context: CombatCommandContext,
        state,
        actor_id: str,
    ) -> dict[str, Any]:
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

        if command.type == CombatCommandType.END_TURN:
            if not self._engine.end_turn(context.session_code, actor_id):
                return {"error": "Cannot end turn"}
            return {"action_type": "end_turn", "combatant_id": actor_id}

        return self._engine.execute_utility(
            context.session_code,
            actor_id,
            command.type.value,
        )

    def _resolve_combatant_id(self, state, identifier: str) -> str | None:
        for combatant in state.combatants:
            if identifier in {combatant.combatant_id, combatant.entity_id, combatant.character_id}:
                return combatant.combatant_id
        return None

    def _assert_turn_and_control(
        self,
        state,
        actor_id: str,
        context: CombatCommandContext,
    ) -> str | None:
        current = state.get_current_combatant()
        if not current or current.combatant_id != actor_id:
            return "Not your turn"
        if is_dm(context.role):
            return None
        if context.user_id is None or str(context.user_id) not in current.controlled_by:
            return "You do not control this combatant"
        return None

    def _restore(self, session_code: str, snapshot: dict[str, Any]) -> None:
        self._engine._active[session_code] = CombatState.from_dict(snapshot)

    def _reject(self, sequence_id: int, failed_index: int, reason: str) -> CombatCommandResult:
        return CombatCommandResult(
            accepted=False,
            sequence_id=sequence_id,
            applied=[],
            failed_index=failed_index,
            reason=reason,
        )


def parse_combat_command_payload(payload: dict[str, Any]) -> CombatCommandEnvelope:
    try:
        return CombatCommandEnvelope.from_payload(payload)
    except ValidationError:
        raise
