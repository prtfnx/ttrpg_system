"""Explicit executable definitions drawn only from the encounter's saved actors."""

from hashlib import sha256
from typing import Literal

from core_table.combat import Combatant
from core_table.dice import validate_dice_formula
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

DamageType = Literal[
    'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic',
    'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder',
]
Ability = Literal['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']


class CombatActionDefinition(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True, frozen=True, allow_inf_nan=False)

    schema_version: Literal[1] = 1
    name: str = Field(min_length=1, max_length=120)
    kind: Literal['attack', 'spell']
    effect: Literal['attack_roll', 'saving_throw', 'automatic']
    damage_formula: str = Field(min_length=1, max_length=200)
    damage_type: DamageType
    range_ft: float = Field(gt=0, le=100_000)
    attack_type: Literal['melee', 'ranged'] = 'melee'
    attack_bonus: int = Field(default=0, ge=-100, le=100)
    spell_level: int = Field(default=0, ge=0, le=9)
    save_ability: Ability | None = None
    save_dc: int = Field(default=0, ge=0, le=100)
    save_half: bool = False
    is_concentration: bool = False
    max_targets: int = Field(default=1, ge=1, le=20)

    @field_validator('damage_formula')
    @classmethod
    def valid_dice(cls, value: str) -> str:
        validate_dice_formula(value)
        return value

    @field_validator('name')
    @classmethod
    def valid_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError('Action name must not be blank')
        return value.strip()

    @model_validator(mode='after')
    def consistent_effect(self):
        if self.kind == 'attack' and (
            self.effect != 'attack_roll' or self.spell_level or self.max_targets != 1
            or self.is_concentration or self.save_ability is not None or self.save_half
        ):
            raise ValueError('Weapon attacks require one attack-roll target')
        if self.effect == 'saving_throw' and self.save_ability is None:
            raise ValueError('Saving-throw effects require an ability')
        if self.effect != 'saving_throw' and (self.save_ability is not None or self.save_half):
            raise ValueError('Save settings require a saving-throw effect')
        return self

    @property
    def action_id(self) -> str:
        # Include resolved actor spell statistics; a reference cannot silently
        # change mechanics when its source changes.
        return 'action_' + sha256(self.model_dump_json().encode()).hexdigest()[:24]

    def to_public(self) -> dict:
        return {'action_id': self.action_id, **self.model_dump(mode='json')}


def available_combat_actions(actor: Combatant) -> list[CombatActionDefinition]:
    definitions: dict[str, CombatActionDefinition] = {}
    for raw in actor.actor_actions[:64]:
        if not isinstance(raw, dict) or raw.get('action_cost', 'action') != 'action':
            continue
        structured = raw.get('combat')
        if not isinstance(structured, dict):
            # Descriptive compendium text is not executable rules metadata.
            continue
        try:
            action = CombatActionDefinition.model_validate({**structured, 'name': raw.get('name')})
            if action.kind == 'spell':
                # The encounter's actor, never client input, owns spell bonuses.
                resolved = action.model_dump()
                resolved['attack_bonus'] = actor.spell_attack_bonus
                resolved['save_dc'] = actor.spell_save_dc if action.effect == 'saving_throw' else 0
                action = CombatActionDefinition.model_validate(resolved)
                if action.effect == 'saving_throw' and action.save_dc <= 0:
                    continue
        except (ValidationError, ValueError, TypeError):
            continue
        definitions[action.action_id] = action
    return list(definitions.values())


def find_combat_action(actor: Combatant, action_id: str) -> CombatActionDefinition | None:
    return next((action for action in available_combat_actions(actor) if action.action_id == action_id), None)
