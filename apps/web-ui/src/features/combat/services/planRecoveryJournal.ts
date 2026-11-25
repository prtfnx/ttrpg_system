import type { CombatCommandBatch } from '../hooks/useCombatCommands';
import type { PlannedAction } from '../stores/planningStore';

export interface PlanScope { sessionCode: string; userId: number; sessionInstance: string }
export interface PlanBinding { combatId: string; tableId: string; actorId: string; round: number }
export interface SavedPlan {
  format: 1;
  binding: PlanBinding;
  selectedSpriteId: string;
  queue: PlannedAction[];
  pending: { sequenceId: number; actionIds: string[]; payload: CombatCommandBatch } | null;
}
const MAX_BYTES = 512 * 1024;
const ACTIONS = new Set(['move', 'attack', 'cast_spell', 'use_item', 'dodge', 'dash', 'disengage', 'hide', 'help', 'ready', 'bonus_action', 'reaction']);
function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 160; }
function safe(value: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'string') return value.length <= 4096;
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
  if (Array.isArray(value)) return value.length <= 1000 && value.every(item => safe(item, depth + 1));
  if (value && typeof value === 'object') return Object.keys(value).length <= 64
    && Object.entries(value).every(([key, item]) => !['__proto__', 'constructor', 'prototype'].includes(key) && safe(item, depth + 1));
  return false;
}
function validAction(action: PlannedAction): boolean {
  const strings = ['actor_id', 'table_id', 'target_id', 'action_id', 'spell_id', 'spell_name', 'item_id', 'damage_formula', 'damage_type', 'save_ability'];
  const numbers = ['target_x', 'target_y', 'cost_ft', 'attack_bonus', 'range_ft', 'save_dc', 'spell_level'];
  const booleans = ['manual', 'save_half', 'requires_attack_roll', 'is_concentration'];
  const keys = ['id', 'label', 'action_type', 'sequence_index', 'target_ids', 'path', 'effect', 'attack_type', 'cost_type', ...strings, ...numbers, ...booleans];
  return Boolean(action && text(action.id) && typeof action.label === 'string' && action.label.length <= 1024
    && ACTIONS.has(action.action_type) && Number.isSafeInteger(action.sequence_index) && action.sequence_index >= 0
    && Object.keys(action).every(key => keys.includes(key))
    && strings.every(key => !(key in action) || typeof (action as unknown as Record<string, unknown>)[key] === 'string')
    && numbers.every(key => !(key in action) || typeof (action as unknown as Record<string, unknown>)[key] === 'number')
    && booleans.every(key => !(key in action) || typeof (action as unknown as Record<string, unknown>)[key] === 'boolean')
    && (action.target_ids === undefined || Array.isArray(action.target_ids) && action.target_ids.length <= 20 && action.target_ids.every(text))
    && (action.path === undefined || Array.isArray(action.path) && action.path.length >= 2 && action.path.length <= 1000
      && action.path.every(point => Array.isArray(point) && point.length === 2 && point.every(n => typeof n === 'number' && Number.isFinite(n))))
    && (action.effect === undefined || ['attack_roll', 'saving_throw', 'automatic'].includes(action.effect))
    && (action.attack_type === undefined || ['melee', 'ranged'].includes(action.attack_type))
    && (action.cost_type === undefined || ['action', 'bonus_action', 'reaction', 'movement', 'free'].includes(action.cost_type)));
}
function validate(value: unknown): asserts value is SavedPlan {
  const record = value as SavedPlan;
  if (!record || !safe(record) || record.format !== 1 || !record.binding
    || !text(record.binding.combatId) || !text(record.binding.tableId) || !text(record.binding.actorId)
    || !Number.isSafeInteger(record.binding.round) || record.binding.round < 0 || !text(record.selectedSpriteId)
    || !Array.isArray(record.queue) || record.queue.length > 200
    || record.queue.some(action => !validAction(action))
    || new Set(record.queue.map(action => action.id)).size !== record.queue.length) throw new Error('Invalid saved plan');
  if (record.pending !== null) {
    const pending = record.pending;
    if (!pending || !Number.isSafeInteger(pending.sequenceId) || pending.sequenceId < 0
      || !Array.isArray(pending.actionIds) || pending.actionIds.length < 1 || pending.actionIds.length > 50
      || new Set(pending.actionIds).size !== pending.actionIds.length
      || pending.actionIds.some(id => !text(id))
      || !pending.payload || pending.payload.sequence_id !== pending.sequenceId
      || pending.payload.combat_id !== record.binding.combatId
      || !Number.isSafeInteger(pending.payload.expected_state_version) || Number(pending.payload.expected_state_version) < 0
      || !Array.isArray(pending.payload.commands)
      || pending.payload.commands.length !== pending.actionIds.length || pending.payload.commands.length > 50
      || pending.payload.commands.some(command => !command || !text(command.type) || !text(command.actor_id))) {
      throw new Error('Invalid saved submission');
    }
  }
}

/** One tab-local record per authenticated session; encounter/turn binding lives inside it. */
export class PlanRecoveryJournal {
  private readonly key: string;
  private readonly storage: Storage;
  constructor(scope: PlanScope, storage: Storage) {
    this.storage = storage;
    if (!text(scope.sessionCode) || !text(scope.sessionInstance) || !Number.isSafeInteger(scope.userId) || scope.userId <= 0) {
      throw new Error('Authenticated plan scope is required');
    }
    this.key = `ttrpg:combat-plan:v1:${encodeURIComponent(JSON.stringify([scope.sessionCode, scope.userId, scope.sessionInstance]))}`;
  }
  read(): SavedPlan | null {
    const raw = this.storage.getItem(this.key);
    if (raw === null) return null;
    if (new TextEncoder().encode(raw).length > MAX_BYTES) throw new Error('Saved plan exceeds storage limit');
    const result: unknown = JSON.parse(raw);
    validate(result);
    return result;
  }
  write(record: SavedPlan): void {
    // JSON round-trip also removes optional undefined properties before validation.
    const raw = JSON.stringify(record);
    if (new TextEncoder().encode(raw).length > MAX_BYTES) throw new Error('Saved plan exceeds storage limit');
    validate(JSON.parse(raw));
    const old = this.read();
    if (old?.pending && record.pending?.sequenceId === old.pending.sequenceId
      && JSON.stringify(old.pending.payload) !== JSON.stringify(record.pending.payload)) throw new Error('Submission identity already owns different input');
    this.storage.setItem(this.key, raw);
    if (this.storage.getItem(this.key) !== raw) throw new Error('Saved plan write could not be verified');
  }
  clear(): void { this.storage.removeItem(this.key); }
}
