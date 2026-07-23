from __future__ import annotations

import re
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from typing import Any

CharacterLoader = Callable[[str], Mapping[str, Any] | None]


@dataclass(frozen=True)
class CombatantFactoryContext:
    table: Any = None
    load_character: CharacterLoader | None = None


class CombatantFactory:
    """Build combatant payloads from server-owned token and character data."""

    _DM_OVERRIDE_FIELDS = {
        'armor_class',
        'hp',
        'is_hidden',
        'is_npc',
        'max_hp',
        'movement_speed',
        'name',
    }

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
        explicit_overrides = self._override_values(
            client_payload.get('overrides') or client_payload.get('dm_overrides'),
        )

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
        nested_data = self._dict_value(character.get('data'))
        data = nested_data or self._dict_value(character)
        stats = self._dict_value(data.get('stats'))
        abilities = self._dict_value(
            data.get('abilityScores')
            or data.get('ability_scores')
            or data.get('abilities')
        )
        monster_stats = stats if self._has_ability_scores(stats) else self._dict_value(data.get('attributes'))
        dexterity = self._ability_score(abilities or monster_stats, 'dex')
        constitution = self._ability_score(abilities or monster_stats, 'con')
        hp = self._first_value(stats.get('hp'), data.get('current_hp'), data.get('hit_points'), data.get('hp'))
        max_hp = self._first_value(
            stats.get('maxHp'),
            stats.get('max_hp'),
            data.get('max_hp'),
            data.get('hit_points'),
            data.get('hp'),
        )
        armor_class = self._first_value(
            stats.get('ac'),
            stats.get('armor_class'),
            data.get('armor_class'),
            data.get('ac'),
        )
        speed = self._first_value(
            stats.get('speed'),
            data.get('movement_speed'),
            data.get('speed'),
        )
        death_saves = self._dict_value(stats.get('deathSaves') or stats.get('death_saves'))
        spellcasting = self._dict_value(data.get('spellcasting'))
        values: dict[str, Any] = {
            'name': self._text_value(character.get('name')) or self._text_value(data.get('name')),
            'hp': self._int_value(hp, 0),
            'max_hp': self._int_value(max_hp, 0),
            'temp_hp': self._int_value(
                self._first_value(stats.get('tempHp'), stats.get('temp_hp'), data.get('temp_hp')),
                0,
            ),
            'armor_class': self._int_value(self._scalar_value(armor_class), 10),
            'movement_speed': self._speed_value(speed, 30),
            'initiative_modifier': self._int_value(
                self._first_value(
                    stats.get('initiative'),
                    data.get('initiative_modifier'),
                    data.get('initiative_bonus'),
                ),
                self._ability_modifier(dexterity),
            ),
            'constitution_modifier': self._int_value(
                self._first_value(data.get('constitution_modifier'), data.get('con_modifier')),
                self._ability_modifier(constitution),
            ),
            'attacks_per_action': self._int_value(
                self._first_value(
                    stats.get('attacksPerAction'),
                    stats.get('attacks_per_action'),
                    data.get('attacksPerAction'),
                    data.get('attacks_per_action'),
                ),
                1,
            ),
            'death_save_successes': self._int_value(death_saves.get('successes'), 0),
            'death_save_failures': self._int_value(death_saves.get('failures'), 0),
            'damage_resistances': self._string_list(
                data.get('damageResistances') or data.get('damage_resistances'),
            ),
            'damage_vulnerabilities': self._string_list(
                data.get('damageVulnerabilities') or data.get('damage_vulnerabilities'),
            ),
            'damage_immunities': self._string_list(
                data.get('damageImmunities') or data.get('damage_immunities'),
            ),
            'is_npc': bool(
                data.get('npc')
                or data.get('is_npc')
                or str(data.get('type', '')).lower() == 'npc'
                or str(character.get('type', '')).lower() == 'npc'
            ),
            'spell_save_dc': self._int_value(
                self._first_value(
                    spellcasting.get('spellSaveDC'),
                    spellcasting.get('spell_save_dc'),
                    data.get('spellSaveDC'),
                    data.get('spell_save_dc'),
                ),
                0,
            ),
            'spell_attack_bonus': self._int_value(
                self._first_value(
                    spellcasting.get('spellAttackBonus'),
                    spellcasting.get('spell_attack_bonus'),
                    data.get('spellAttackBonus'),
                    data.get('spell_attack_bonus'),
                ),
                0,
            ),
            'save_modifiers': self._save_modifiers(
                data.get('savingThrows') or data.get('saving_throws') or data.get('saves'),
            ),
            'actor_actions': self._actor_actions(data),
        }
        raw_spell_slots = (
            data.get('spellSlots')
            or data.get('spell_slots')
            or spellcasting.get('spellSlots')
            or spellcasting.get('spell_slots')
        )
        spell_slots_max = self._spell_slots(raw_spell_slots)
        if spell_slots_max:
            spell_slots_used = {
                int(level): self._int_value(used, 0)
                for level, used in self._dict_value(data.get('spellSlotsUsed') or data.get('spell_slots_used')).items()
                if str(level).isdigit()
            }
            spell_slots_used.update(self._nested_spell_slots_used(raw_spell_slots))
            values['spell_slots_max'] = spell_slots_max
            values['spell_slots'] = {
                level: max(0, total - spell_slots_used.get(level, 0))
                for level, total in spell_slots_max.items()
            }
        return {k: v for k, v in values.items() if v not in (None, '')}

    def _override_values(self, raw_overrides: Any) -> dict[str, Any]:
        overrides = self._dict_value(raw_overrides)
        return {
            key: value
            for key, value in overrides.items()
            if key in self._DM_OVERRIDE_FIELDS
        }

    def _spell_slots(self, raw_slots: Any) -> dict[int, int]:
        slots: dict[int, int] = {}
        for level, value in self._dict_value(raw_slots).items():
            normalized_level = self._slot_level(level)
            if normalized_level is None:
                continue
            total = (
                self._first_value(value.get('total'), value.get('max'))
                if isinstance(value, Mapping)
                else value
            )
            slots[normalized_level] = self._int_value(total, 0)
        return {level: total for level, total in slots.items() if total > 0}

    def _nested_spell_slots_used(self, raw_slots: Any) -> dict[int, int]:
        used_slots: dict[int, int] = {}
        for level, value in self._dict_value(raw_slots).items():
            normalized_level = self._slot_level(level)
            if (
                normalized_level is None
                or not isinstance(value, Mapping)
                or 'used' not in value
            ):
                continue
            used_slots[normalized_level] = self._int_value(value.get('used'), 0)
        return used_slots

    def _slot_level(self, value: Any) -> int | None:
        match = re.search(r'\d+', str(value))
        return int(match.group(0)) if match else None

    def _save_modifiers(self, raw_saves: Any) -> dict[str, int]:
        modifiers: dict[str, int] = {}
        for ability, raw_value in self._dict_value(raw_saves).items():
            value = (
                self._first_value(raw_value.get('bonus'), raw_value.get('modifier'))
                if isinstance(raw_value, Mapping)
                else raw_value
            )
            if value is not None:
                modifiers[str(ability).lower()] = self._int_value(value, 0)
        return modifiers

    def _actor_actions(self, data: Mapping[str, Any]) -> list[dict[str, Any]]:
        actions: list[dict[str, Any]] = []
        sources = (
            ('action', data.get('actions') or data.get('attacks')),
            ('bonus_action', data.get('bonusActions') or data.get('bonus_actions')),
            ('reaction', data.get('reactions')),
            ('legendary', data.get('legendaryActions') or data.get('legendary_actions')),
        )
        for action_cost, raw_actions in sources:
            if not isinstance(raw_actions, list):
                continue
            for raw_action in raw_actions:
                if isinstance(raw_action, Mapping):
                    action = dict(raw_action)
                elif raw_action:
                    action = {'name': str(raw_action)}
                else:
                    continue
                action.setdefault('action_cost', action_cost)
                actions.append(action)
        return actions

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

    def _ability_score(self, abilities: Mapping[str, Any], short_name: str) -> Any:
        aliases = {
            'con': ('con', 'constitution', 'CON'),
            'dex': ('dex', 'dexterity', 'DEX'),
        }
        for name in aliases[short_name]:
            if name in abilities:
                return abilities[name]
        return None

    def _has_ability_scores(self, values: Mapping[str, Any]) -> bool:
        return any(key in values for key in ('STR', 'DEX', 'CON', 'strength', 'dexterity', 'constitution'))

    def _first_value(self, *values: Any) -> Any:
        for value in values:
            if value is not None and value != '':
                return value
        return None

    def _scalar_value(self, value: Any) -> Any:
        if isinstance(value, list) and value:
            return self._scalar_value(value[0])
        if isinstance(value, Mapping):
            return self._first_value(value.get('value'), value.get('ac'), value.get('base'))
        return value

    def _speed_value(self, value: Any, fallback: float) -> float:
        if isinstance(value, Mapping):
            value = self._first_value(value.get('walk'), value.get('walking'), value.get('value'))
        if isinstance(value, str):
            match = re.search(r'-?\d+(?:\.\d+)?', value)
            value = match.group(0) if match else value
        return self._float_value(value, fallback)

    def _string_list(self, value: Any) -> list[str]:
        values: Iterable[Any]
        if isinstance(value, str):
            values = re.split(r'[,;]', value)
        elif isinstance(value, (list, tuple, set)):
            values = value
        else:
            return []
        return [str(item).strip().lower() for item in values if str(item).strip()]

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
