import { bench, describe } from 'vitest';

/**
 * Bottleneck benchmarks for Zustand store spread patterns.
 *
 * These measure the actual hot paths identified in store.ts (updateSprite)
 * and combatStore.ts (updateCombatant/setConditions).
 *
 * Run: pnpm --filter @ttrpg/web-ui bench
 */

// ── Synthetic Sprite matching the Sprite interface ──

interface Sprite {
  id: string;
  name: string;
  tableId: string;
  characterId?: string;
  controlledBy?: string[];
  x: number;
  y: number;
  layer: string;
  texture: string;
  scale: { x: number; y: number };
  rotation: number;
  hp?: number;
  maxHp?: number;
  ac?: number;
  auraRadius?: number;
  auraColor?: string;
  isVisible?: boolean;
  visionRadius?: number;
  hasDarkvision?: boolean;
  darkvisionRadius?: number;
}

function makeSprites(n: number): Sprite[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `sprite_${i}`,
    name: `Token ${i}`,
    tableId: 'table_1',
    characterId: i % 3 === 0 ? `char_${i}` : undefined,
    controlledBy: [`user_${i % 5}`],
    x: (i % 30) * 64,
    y: Math.floor(i / 30) * 64,
    layer: i % 10 === 0 ? 'dm' : 'tokens',
    texture: `/assets/token_${i % 20}.png`,
    scale: { x: 1, y: 1 },
    rotation: 0,
    hp: 20 + i,
    maxHp: 40,
    ac: 15,
    isVisible: true,
  }));
}

// ── BOTTLENECK: store.ts updateSprite — O(N) array spread ──
// Every sprite update calls: sprites.map(s => s.id === id ? { ...s, ...updates } : s)

describe('store updateSprite spread (O(N) map)', () => {
  for (const count of [10, 50, 100, 500]) {
    const sprites = makeSprites(count);
    const targetId = `sprite_${Math.floor(count / 2)}`;
    const updates = { x: 999, y: 888 };

    bench(`${count} sprites`, () => {
      // Exact pattern from store.ts:361
      sprites.map((sprite) =>
        sprite.id === targetId ? { ...sprite, ...updates } : sprite
      );
    });
  }
});

// ── BOTTLENECK: combatStore.ts updateCombatant — triple nested spread ──

interface Combatant {
  combatant_id: string;
  entity_id: string;
  name: string;
  initiative: number | null;
  has_action: boolean;
  has_bonus_action: boolean;
  has_reaction: boolean;
  movement_remaining: number;
  movement_speed: number;
  hp: number | null;
  max_hp: number | null;
  temp_hp: number;
  armor_class: number;
  conditions: { condition_id: string; condition_type: string; source: string; duration_type: string; duration_remaining: number | null }[];
  is_npc: boolean;
  is_hidden: boolean;
  is_defeated: boolean;
  controlled_by: string[];
  ai_enabled: boolean;
}

interface CombatState {
  combat_id: string;
  session_id: string;
  table_id: string;
  phase: string;
  round_number: number;
  current_turn_index: number;
  combatants: Combatant[];
  action_log: unknown[];
  started_at: number | null;
  settings: Record<string, unknown>;
  state_hash: string;
}

function makeCombat(n: number): CombatState {
  return {
    combat_id: 'c1',
    session_id: 's1',
    table_id: 't1',
    phase: 'combat',
    round_number: 3,
    current_turn_index: 0,
    combatants: Array.from({ length: n }, (_, i) => ({
      combatant_id: `cbt_${i}`,
      entity_id: `ent_${i}`,
      name: `Combatant ${i}`,
      initiative: 10 + i,
      has_action: true,
      has_bonus_action: true,
      has_reaction: true,
      movement_remaining: 30,
      movement_speed: 30,
      hp: 20 + i,
      max_hp: 40,
      temp_hp: 0,
      armor_class: 15,
      conditions: [{ condition_id: 'c1', condition_type: 'prone', source: 'spell', duration_type: 'rounds', duration_remaining: 2 }],
      is_npc: i % 2 === 0,
      is_hidden: false,
      is_defeated: false,
      controlled_by: [`user_${i % 3}`],
      ai_enabled: false,
    })),
    action_log: [],
    started_at: Date.now(),
    settings: {},
    state_hash: 'abc123',
  };
}

describe('combatStore updateCombatant (triple spread)', () => {
  for (const count of [5, 10, 20, 50]) {
    const combat = makeCombat(count);
    const targetId = `cbt_${Math.floor(count / 2)}`;
    const patch = { hp: 15, has_action: false };

    bench(`${count} combatants`, () => {
      // Exact pattern from combatStore.ts:86-99
      combat
        ? {
            ...combat, // spread 1: CombatState
            combatants: combat.combatants.map((c) =>
              c.combatant_id === targetId ? { ...c, ...patch } : c // spreads 2+3
            ),
          }
        : null;
    });
  }
});

// ── BOTTLENECK: Batch message dispatch — sequential handler lookup ──

describe('WS batch dispatch (handler map lookup)', () => {
  const handlers = new Map<string, (d: unknown) => void>();
  handlers.set('sprite_move', (_d) => {});
  handlers.set('sprite_add', (_d) => {});
  handlers.set('sprite_remove', (_d) => {});
  handlers.set('chat_message', (_d) => {});
  handlers.set('combat_update', (_d) => {});
  handlers.set('ping', (_d) => {});
  handlers.set('table_switch', (_d) => {});

  for (const batchSize of [5, 15, 30]) {
    const messages = Array.from({ length: batchSize }, (_, i) => ({
      type: ['sprite_move', 'chat_message', 'combat_update', 'ping'][i % 4],
      data: { id: i },
    }));

    bench(`batch of ${batchSize} messages`, () => {
      for (const msg of messages) {
        const handler = handlers.get(msg.type);
        if (handler) handler(msg.data);
      }
    });
  }
});

// ── BOTTLENECK: Event system emit — O(N) handler iteration ──

describe('eventSystem emit (sequential handlers)', () => {
  type Handler = (data: unknown) => void;

  for (const handlerCount of [1, 5, 10, 20]) {
    const subscriptions: { handler: Handler; once: boolean }[] =
      Array.from({ length: handlerCount }, () => ({
        handler: (_d: unknown) => {},
        once: false,
      }));

    bench(`${handlerCount} handlers`, () => {
      // Exact pattern from eventSystem.service.ts:77-103
      const handlersToRemove: typeof subscriptions = [];
      for (const sub of subscriptions) {
        sub.handler({ x: 100, y: 200 });
        if (sub.once) handlersToRemove.push(sub);
      }
      if (handlersToRemove.length > 0) {
        subscriptions.filter((s) => !handlersToRemove.includes(s));
      }
    });
  }
});

// ── BOTTLENECK: Equipment list filter+map (no virtualization) ──

interface Equipment {
  name: string;
  cost: string;
  weight: number | null;
  category: string;
  description: string;
}

describe('equipment list filter+map (no virtualization)', () => {
  for (const count of [50, 200, 500]) {
    const equipment: Equipment[] = Array.from({ length: count }, (_, i) => ({
      name: `Item ${i}`,
      cost: `${i * 10} gp`,
      weight: i % 3 === 0 ? null : i * 0.5,
      category: ['weapon', 'armor', 'adventuring', 'tool'][i % 4],
      description: `A fine piece of equipment #${i}`,
    }));

    bench(`filter+map ${count} items`, () => {
      // Pattern from EquipmentSelectionStep.tsx — filter by category then map to render data
      const filtered = equipment.filter((e) => e.category === 'weapon');
      filtered.map((e) => ({
        name: e.name,
        cost: e.cost,
        weight: e.weight,
        hasDescription: !!e.description,
      }));
    });
  }
});
