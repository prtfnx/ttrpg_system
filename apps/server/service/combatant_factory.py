from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any


CharacterLoader = Callable[[str], Mapping[str, Any] | None]


@dataclass(frozen=True)
class CombatantFactoryContext:
    table: Any = None
    load_character: CharacterLoader | None = None


class CombatantFactory:
    """Build combatant payloads from server-owned token and character data."""

    def build_payload(
        self,
        entity_id: str,
        client_payload: Mapping[str, Any] | None = None,
        context: CombatantFactoryContext | None = None,
    ) -> dict[str, Any]:
        context = context or CombatantFactoryContext()
        client_payload = client_payload or {}
        token = self._find_token(context.table, entity_id)
        character_id = self._first_text(
            self._get_attr(token, 'character_id'),
            client_payload.get('character_id'),
        )
        character = context.load_character(character_id) if character_id and context.load_character else None

        token_values = self._token_values(token)
        character_values = self._character_values(character)
        fallback_values = self._fallback_values(entity_id, client_payload)
        explicit_overrides = self._dict_value(client_payload.get('overrides') or client_payload.get('dm_overrides'))

        payload = {
            **fallback_values,
            **character_values,
            **token_values,
            **explicit_overrides,
            'entity_id': entity_id,
        }
        payload['character_id'] = character_id or payload.get('character_id')
        payload['controlled_by'] = [str(x) for x in payload.get('controlled_by', []) if x is not None]
        payload['movement_speed'] = float(payload.get('movement_speed', 30) or 30)
        payload['is_npc'] = bool(payload.get('is_npc', len(payload['controlled_by']) == 0))
        return payload

    def build_many(
        self,
        entity_ids: list[str],
        client_payloads: list[Mapping[str, Any]] | None = None,
        context: CombatantFactoryContext | None = None,
    ) -> list[dict[str, Any]]:
        by_entity = {
            str(item.get('entity_id')): item
            for item in (client_payloads or [])
            if isinstance(item, Mapping) and item.get('entity_id')
        }
        return [self.build_payload(str(entity_id), by_entity.get(str(entity_id), {}), context) for entity_id in entity_ids]

    def _fallback_values(self, entity_id: str, payload: Mapping[str, Any]) -> dict[str, Any]:
        return {
            'entity_id': entity_id,
            'character_id': self._text_value(payload.get('character_id')),
            'name': self._text_value(payload.get('name')) or entity_id[:8],
            'hp': self._int_value(payload.get('hp'), 0),
            'max_hp': self._int_value(payload.get('max_hp'), 0),
            'armor_class': self._int_value(payload.get('armor_class'), 10),
            'movement_speed': self._float_value(payload.get('movement_speed'), 30),
            'controlled_by': [str(x) for x in payload.get('controlled_by', []) if x is not None],
            'is_npc': bool(payload.get('is_npc', False)),
        }

    def _token_values(self, token: Any) -> dict[str, Any]:
        if token is None:
            return {}
        values: dict[str, Any] = {
            'name': self._text_value(self._get_attr(token, 'name')),
            'character_id': self._text_value(self._get_attr(token, 'character_id')),
            'controlled_by': [str(x) for x in (self._get_attr(token, 'controlled_by') or []) if x is not None],
        }
        hp = self._get_attr(token, 'hp')
        max_hp = self._get_attr(token, 'max_hp')
        ac = self._get_attr(token, 'ac')
        if hp is not None:
            values['hp'] = self._int_value(hp, 0)
        if max_hp is not None:
            values['max_hp'] = self._int_value(max_hp, values.get('hp', 0))
        if ac is not None:
            values['armor_class'] = self._int_value(ac, 10)
        return {k: v for k, v in values.items() if v not in (None, '')}

    def _character_values(self, character: Mapping[str, Any] | None) -> dict[str, Any]:
        if not character:
            return {}
        data = self._dict_value(character.get('data'))
        stats = self._dict_value(data.get('stats'))
        abilities = self._dict_value(data.get('abilityScores') or data.get('ability_scores'))
        values: dict[str, Any] = {
            'name': self._text_value(character.get('name')) or self._text_value(data.get('name')),
            'hp': self._int_value(stats.get('hp'), 0),
            'max_hp': self._int_value(stats.get('maxHp') or stats.get('max_hp'), 0),
            'armor_class': self._int_value(stats.get('ac') or stats.get('armor_class'), 10),
            'movement_speed': self._float_value(stats.get('speed') or data.get('speed'), 30),
            'initiative_modifier': self._int_value(stats.get('initiative'), self._ability_modifier(abilities.get('dex'))),
            'constitution_modifier': self._ability_modifier(abilities.get('con')),
            'attacks_per_action': self._int_value(
                stats.get('attacksPerAction') or stats.get('attacks_per_action') or data.get('attacksPerAction'),
                1,
            ),
        }
        spell_slots_max = self._spell_slots(data.get('spellSlots') or data.get('spell_slots'))
        if spell_slots_max:
            spell_slots_used = {
                int(level): self._int_value(used, 0)
                for level, used in self._dict_value(data.get('spellSlotsUsed') or data.get('spell_slots_used')).items()
                if str(level).isdigit()
            }
            values['spell_slots_max'] = spell_slots_max
            values['spell_slots'] = {
                level: max(0, total - spell_slots_used.get(level, 0))
                for level, total in spell_slots_max.items()
            }
        return {k: v for k, v in values.items() if v not in (None, '')}

    def _spell_slots(self, raw_slots: Any) -> dict[int, int]:
        slots: dict[int, int] = {}
        for level, value in self._dict_value(raw_slots).items():
            if not str(level).isdigit():
                continue
            total = value.get('total') if isinstance(value, Mapping) else value
            slots[int(level)] = self._int_value(total, 0)
        return {level: total for level, total in slots.items() if total > 0}

    def _find_token(self, table: Any, entity_id: str) -> Any:
        if table is None:
            return None
        finder = getattr(table, 'find_entity_by_sprite_id', None)
        if callable(finder):
            token = finder(entity_id)
            if token is not None:
                return token
        entities = getattr(table, 'entities', {}) or {}
        if entity_id in entities:
            return entities[entity_id]
        if entity_id.isdigit() and int(entity_id) in entities:
            return entities[int(entity_id)]
        for token in entities.values():
            if str(self._get_attr(token, 'sprite_id') or '') == entity_id:
                return token
            if str(self._get_attr(token, 'entity_id') or '') == entity_id:
                return token
        return None

    def _ability_modifier(self, score: Any) -> int:
        if score is None:
            return 0
        return (self._int_value(score, 10) - 10) // 2

    def _dict_value(self, value: Any) -> dict:
        return dict(value) if isinstance(value, Mapping) else {}

    def _first_text(self, *values: Any) -> str:
        for value in values:
            text = self._text_value(value)
            if text:
                return text
        return ''

    def _text_value(self, value: Any) -> str:
        return str(value) if value is not None and str(value) else ''

    def _int_value(self, value: Any, fallback: int) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return fallback

    def _float_value(self, value: Any, fallback: float) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return fallback

    def _get_attr(self, value: Any, name: str) -> Any:
        if value is None:
            return None
        if isinstance(value, Mapping):
            return value.get(name)
        return getattr(value, name, None)
