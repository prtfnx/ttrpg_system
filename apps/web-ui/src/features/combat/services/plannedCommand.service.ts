import type { CombatCommandPayload } from '../hooks/useCombatCommands';
import type { PlannedAction } from '../stores/planningStore';

export interface PlannedCommandContext {
  actorId: string | null;
  tableId: string | null;
  actorPosition?: {
    x: number;
    y: number;
  };
}

export type PlannedCommandBuildResult =
  | { ok: true; commands: CombatCommandPayload[] }
  | { ok: false; error: string };

const UTILITY_ACTIONS = new Set(['dash', 'dodge', 'disengage', 'help', 'hide']);

export function buildPlannedCombatCommands(
  queue: PlannedAction[],
  context: PlannedCommandContext,
): PlannedCommandBuildResult {
  const commands: CombatCommandPayload[] = [];
  let from = context.actorPosition;

  for (const action of queue) {
    const actorId = action.actor_id || context.actorId;
    if (!actorId) {
      return { ok: false, error: `${action.label} is missing an actor.` };
    }

    if (action.action_type === 'move') {
      const tableId = action.table_id || context.tableId;
      if (!tableId || !from) {
        return { ok: false, error: `${action.label} is missing its table or source position.` };
      }
      if (action.target_x == null || action.target_y == null || action.cost_ft == null) {
        return { ok: false, error: `${action.label} is missing its destination or movement cost.` };
      }
      commands.push({
        type: 'move',
        actor_id: actorId,
        table_id: tableId,
        from_x: from.x,
        from_y: from.y,
        target_x: action.target_x,
        target_y: action.target_y,
        cost_ft: action.cost_ft,
        path: action.path ?? [],
      });
      from = { x: action.target_x, y: action.target_y };
      continue;
    }

    if (action.action_type === 'attack') {
      if (!action.target_id) {
        return { ok: false, error: `${action.label} is missing a target.` };
      }
      commands.push({
        type: 'attack',
        actor_id: actorId,
        target_id: action.target_id,
        table_id: action.table_id || context.tableId || undefined,
        attack_bonus: action.attack_bonus ?? 0,
        damage_formula: action.damage_formula || '1d4',
        damage_type: action.damage_type || 'bludgeoning',
        attack_type: action.attack_type || 'melee',
        range_ft: action.range_ft ?? 5,
      });
      continue;
    }

    if (action.action_type === 'cast_spell') {
      if (!action.spell_name?.trim()) {
        return { ok: false, error: `${action.label} is missing a spell name.` };
      }
      commands.push({
        type: 'cast_spell',
        actor_id: actorId,
        spell_name: action.spell_name.trim(),
        spell_level: action.spell_level ?? 0,
        target_ids: action.target_ids ?? (action.target_id ? [action.target_id] : []),
        damage_formula: action.damage_formula || '',
        save_ability: action.save_ability || '',
        save_dc: action.save_dc ?? 0,
        damage_type: action.damage_type || 'fire',
        requires_attack_roll: action.requires_attack_roll ?? false,
        attack_bonus: action.attack_bonus ?? 0,
        is_concentration: action.is_concentration ?? false,
      });
      continue;
    }

    if (UTILITY_ACTIONS.has(action.action_type)) {
      commands.push({
        type: action.action_type,
        actor_id: actorId,
      });
      continue;
    }

    return { ok: false, error: `Unsupported planned action: ${action.action_type}` };
  }

  return { ok: true, commands };
}
