import { createMessage, MessageType } from '@lib/websocket/message';
import { parseCombatMessage } from '@lib/websocket/combatMessages';
import type { CombatStateView } from '../stores/combatStore';

/** Validate public wire data, then fill fields omitted by older/public views. */
export function decodeCombatState(value: unknown): CombatStateView | null {
  const wire = parseCombatMessage(createMessage(MessageType.COMBAT_STATE, { combat: value }), MessageType.COMBAT_STATE).data.combat;
  if (wire === null) return null;
  const settings = wire.settings;
  const hpVisibility = settings?.show_npc_hp_to_players;
  return {
    ...wire,
    session_id: wire.session_id ?? '',
    phase: wire.phase ?? 'inactive',
    action_log: wire.action_log ?? [],
    started_at: wire.started_at ?? null,
    state_hash: wire.state_hash ?? '',
    pending_movement: wire.pending_movement ?? undefined,
    settings: {
      auto_roll_npc_initiative: settings?.auto_roll_npc_initiative ?? true,
      auto_sort_initiative: settings?.auto_sort_initiative ?? true,
      skip_defeated: settings?.skip_defeated ?? true,
      allow_player_end_turn: settings?.allow_player_end_turn ?? true,
      show_npc_hp_to_players: typeof hpVisibility === 'boolean' ? hpVisibility ? 'full' : 'none' : hpVisibility ?? 'descriptor',
      group_initiative: settings?.group_initiative ?? false,
      ai_auto_act: settings?.ai_auto_act ?? false,
      death_saves_enabled: settings?.death_saves_enabled ?? true,
      critical_hit_rule: settings?.critical_hit_rule ?? 'double_dice',
    },
    combatants: wire.combatants.map(actor => ({
      ...actor,
      character_id: actor.character_id ?? null,
      name: actor.name ?? '',
      initiative: actor.initiative ?? null,
      has_action: actor.has_action ?? false,
      has_bonus_action: actor.has_bonus_action ?? false,
      has_reaction: actor.has_reaction ?? false,
      movement_remaining: actor.movement_remaining ?? 0,
      movement_speed: actor.movement_speed ?? 0,
      hp: actor.hp ?? null,
      max_hp: actor.max_hp ?? null,
      temp_hp: actor.temp_hp ?? 0,
      conditions: actor.conditions ?? [],
      is_npc: actor.is_npc ?? false,
      is_hidden: actor.is_hidden ?? false,
      is_defeated: actor.is_defeated ?? false,
      controlled_by: actor.controlled_by ?? [],
    })),
  };
}
