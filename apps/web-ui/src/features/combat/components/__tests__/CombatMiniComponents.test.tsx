import { useGameStore } from '@/store';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCombatStore } from '../../stores/combatStore';
import { useGameModeStore } from '../../stores/gameModeStore';
import { usePlanningStore } from '../../stores/planningStore';
import { ActionPanel } from '../ActionPanel';
import { ActionEconomyBar } from '../ActionEconomyBar';
import { GameModeSwitch } from '../GameModeSwitch';
import { TurnBanner } from '../TurnBanner';

const mockOptionalProtocol = { sendMessage: vi.fn() };

vi.mock('@lib/api', () => ({
  useOptionalProtocol: vi.fn(() => ({ protocol: mockOptionalProtocol })),
}));
vi.mock('@lib/websocket', () => ({
  createMessage: vi.fn((type, data) => ({ type, data })),
  MessageType: {
    COMBAT_COMMAND: 'combat_command',
    GAME_MODE_CHANGE: 'GAME_MODE_CHANGE',
  },
}));
vi.mock('@features/session/types/roles', () => ({
  isDM: (role: string) => role === 'owner' || role === 'dm',
}));

const makeCombatant = (overrides = {}) => ({
  combatant_id: 'c1',
  entity_id: 'e1',
  character_id: null,
  name: 'Goblin',
  initiative: 12,
  has_action: true,
  has_bonus_action: true,
  has_reaction: true,
  movement_remaining: 30,
  movement_speed: 30,
  hp: 10,
  max_hp: 10,
  temp_hp: 0,
  armor_class: 12,
  conditions: [],
  is_npc: true,
  is_hidden: false,
  is_defeated: false,
  controlled_by: ['42'],
  ai_enabled: false,
  ai_behavior: 'passive',
  ...overrides,
});

const baseCombat = {
  combat_id: 'combat1',
  session_id: 'session1',
  table_id: 'table1',
  phase: 'active' as const,
  round_number: 1,
  current_turn_index: 0,
  combatants: [makeCombatant()],
  action_log: [],
  started_at: Date.now(),
  state_hash: 'hash1',
  settings: {} as never,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockOptionalProtocol.sendMessage.mockClear();
  useGameStore.setState({ userId: 42, sessionRole: 'player' });
  useCombatStore.setState({ combat: null, getCurrentCombatant: () => null });
  useGameModeStore.setState({ mode: 'free_roam', roundNumber: 0 });
  usePlanningStore.setState({
    queue: [],
    isPlanningMode: false,
    selectedSpriteId: null,
    sequenceId: 0,
  });
});

// ── TurnBanner ────────────────────────────────────────────────────────────────

describe('TurnBanner', () => {
  it('renders nothing when no active combatant', () => {
    const { container } = render(<TurnBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('shows other turn when not my combatant', () => {
    const c = makeCombatant({ controlled_by: ['99'] });
    useCombatStore.setState({
      combat: { ...baseCombat, combatants: [c] },
      getCurrentCombatant: () => c,
    });
    render(<TurnBanner />);
    expect(screen.getByText(/Goblin.*Turn/)).toBeTruthy();
  });

  it("shows 'Your Turn!' when it is my combatant", () => {
    const c = makeCombatant({ controlled_by: ['42'] });
    useCombatStore.setState({
      combat: { ...baseCombat, combatants: [c] },
      getCurrentCombatant: () => c,
    });
    render(<TurnBanner />);
    expect(screen.getByText('Your Turn!')).toBeTruthy();
    expect(screen.getByRole('button', { name: /end turn/i })).toBeTruthy();
  });

  it('calls endTurn on button click', () => {
    const c = makeCombatant({ controlled_by: ['42'] });
    useCombatStore.setState({
      combat: { ...baseCombat, combatants: [c] },
      getCurrentCombatant: () => c,
    });
    render(<TurnBanner />);
    fireEvent.click(screen.getByRole('button', { name: /end turn/i }));
    expect(mockOptionalProtocol.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'combat_command',
      data: expect.objectContaining({
        commands: [expect.objectContaining({
          type: 'end_turn',
          actor_id: c.combatant_id,
        })],
      }),
    }));
  });
});

// ── ActionEconomyBar ──────────────────────────────────────────────────────────

describe('ActionEconomyBar', () => {
  it('renders nothing when no combat', () => {
    const { container } = render(<ActionEconomyBar />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when phase is not active', () => {
    useCombatStore.setState({ combat: { ...baseCombat, phase: 'setup' as never } });
    const { container } = render(<ActionEconomyBar />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when userId not in controlled_by', () => {
    useCombatStore.setState({ combat: { ...baseCombat, combatants: [makeCombatant({ controlled_by: ['99'] })] } });
    const { container } = render(<ActionEconomyBar />);
    expect(container.firstChild).toBeNull();
  });

  it('renders action pips for my combatant', () => {
    useCombatStore.setState({ combat: { ...baseCombat, combatants: [makeCombatant({ controlled_by: ['42'] })] } });
    render(<ActionEconomyBar />);
    expect(screen.getByText('Action')).toBeTruthy();
    expect(screen.getByText('Bonus')).toBeTruthy();
    expect(screen.getByText('Reaction')).toBeTruthy();
  });

  it('shows the active actor economy to a DM without token ownership', () => {
    useGameStore.setState({ sessionRole: 'owner', userId: 42 });
    useCombatStore.setState({
      combat: {
        ...baseCombat,
        combatants: [makeCombatant({ controlled_by: [] })],
      },
    });

    render(<ActionEconomyBar />);

    expect(screen.getByText('Action')).toBeTruthy();
    expect(screen.getByText('30ft')).toBeTruthy();
  });

  it('shows movement remaining', () => {
    useCombatStore.setState({ combat: { ...baseCombat, combatants: [makeCombatant({ controlled_by: ['42'], movement_remaining: 25 })] } });
    render(<ActionEconomyBar />);
    expect(screen.getByText('25ft')).toBeTruthy();
  });
});

// ── GameModeSwitch ────────────────────────────────────────────────────────────

describe('ActionPanel', () => {
  it('lets a DM resolve the active uncontrolled actor', () => {
    useGameStore.setState({ sessionRole: 'owner', userId: 42 });
    const actor = makeCombatant({
      combatant_id: 'npc-actor',
      name: 'Goblin',
      controlled_by: [],
    });
    const target = makeCombatant({
      combatant_id: 'target',
      name: 'Borin',
      controlled_by: ['99'],
    });
    useCombatStore.setState({ combat: { ...baseCombat, combatants: [actor, target] } });

    render(<ActionPanel />);
    fireEvent.click(screen.getByRole('button', { name: /attack/i }));

    expect(screen.getByText('Active Actor - Goblin')).toBeTruthy();
    expect(mockOptionalProtocol.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'combat_command',
        data: expect.objectContaining({
          commands: [expect.objectContaining({
            type: 'attack',
            actor_id: 'npc-actor',
            target_id: 'target',
          })],
        }),
      }),
    );
  });

  it('sends attack commands with the selected target', () => {
    const actor = makeCombatant({ combatant_id: 'attacker', name: 'Ada' });
    const target = makeCombatant({ combatant_id: 'target', name: 'Borin', controlled_by: ['99'] });
    useCombatStore.setState({ combat: { ...baseCombat, combatants: [actor, target] } });

    render(<ActionPanel />);
    fireEvent.click(screen.getByRole('button', { name: /attack/i }));

    expect(mockOptionalProtocol.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'combat_command',
        data: expect.objectContaining({
          commands: [expect.objectContaining({
            type: 'attack',
            actor_id: 'attacker',
            target_id: 'target',
          })],
        }),
      }),
    );
  });

  it('sends spell commands from caster controls', () => {
    const actor = makeCombatant({
      combatant_id: 'caster',
      name: 'Ada',
      spell_slots: { 1: 1 },
      spell_slots_max: { 1: 1 },
    });
    const target = makeCombatant({ combatant_id: 'target', name: 'Borin', controlled_by: ['99'] });
    useCombatStore.setState({ combat: { ...baseCombat, combatants: [actor, target] } });

    render(<ActionPanel />);
    fireEvent.change(screen.getByLabelText(/spell/i), { target: { value: 'Burning Hands' } });
    fireEvent.change(screen.getByLabelText(/damage/i), { target: { value: '3d6' } });
    fireEvent.click(screen.getByRole('button', { name: /cast spell/i }));

    expect(mockOptionalProtocol.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'combat_command',
        data: expect.objectContaining({
          commands: [expect.objectContaining({
            type: 'cast_spell',
            actor_id: 'caster',
            spell_name: 'Burning Hands',
            spell_level: 1,
            target_ids: ['target'],
            damage_formula: '3d6',
          })],
        }),
      }),
    );
  });

  it('queues an attack instead of sending while planning', () => {
    const actor = makeCombatant({ combatant_id: 'attacker', name: 'Ada' });
    const target = makeCombatant({ combatant_id: 'target', name: 'Borin', controlled_by: ['99'] });
    useCombatStore.setState({ combat: { ...baseCombat, combatants: [actor, target] } });
    usePlanningStore.setState({ isPlanningMode: true, selectedSpriteId: actor.entity_id });

    render(<ActionPanel />);
    fireEvent.click(screen.getByRole('button', { name: /attack/i }));

    expect(usePlanningStore.getState().queue).toEqual([
      expect.objectContaining({
        action_type: 'attack',
        label: 'Attack Borin',
        actor_id: 'attacker',
        table_id: 'table1',
        target_id: 'target',
        cost_type: 'action',
        sequence_index: 0,
      }),
    ]);
    expect(mockOptionalProtocol.sendMessage).not.toHaveBeenCalled();
  });

  it('queues schema-complete spell intent while planning', () => {
    const actor = makeCombatant({
      combatant_id: 'caster',
      name: 'Ada',
      spell_slots: { 1: 1 },
      spell_slots_max: { 1: 1 },
      spell_save_dc: 14,
      spell_attack_bonus: 6,
    });
    const target = makeCombatant({ combatant_id: 'target', name: 'Borin', controlled_by: ['99'] });
    useCombatStore.setState({ combat: { ...baseCombat, combatants: [actor, target] } });
    usePlanningStore.setState({ isPlanningMode: true, selectedSpriteId: actor.entity_id });

    render(<ActionPanel />);
    fireEvent.change(screen.getByLabelText(/spell/i), { target: { value: 'Burning Hands' } });
    fireEvent.change(screen.getByLabelText(/damage/i), { target: { value: '3d6' } });
    fireEvent.click(screen.getByRole('button', { name: /cast spell/i }));

    expect(usePlanningStore.getState().queue).toEqual([
      expect.objectContaining({
        action_type: 'cast_spell',
        label: 'Cast Burning Hands',
        actor_id: 'caster',
        target_ids: ['target'],
        spell_name: 'Burning Hands',
        spell_level: 1,
        damage_formula: '3d6',
        save_dc: 14,
        attack_bonus: 6,
        cost_type: 'action',
        sequence_index: 0,
      }),
    ]);
    expect(mockOptionalProtocol.sendMessage).not.toHaveBeenCalled();
  });

  it('sends utility actions through combat_command', () => {
    useCombatStore.setState({ combat: { ...baseCombat, combatants: [makeCombatant({ combatant_id: 'cmb-1' })] } });

    render(<ActionPanel />);
    fireEvent.click(screen.getByRole('button', { name: /dash/i }));

    expect(mockOptionalProtocol.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'combat_command',
        data: expect.objectContaining({
          commands: [expect.objectContaining({ type: 'dash', actor_id: 'cmb-1' })],
        }),
      }),
    );
  });

  it('sends end turn through combat_command', () => {
    useCombatStore.setState({ combat: { ...baseCombat, combatants: [makeCombatant({ combatant_id: 'cmb-2' })] } });

    render(<ActionPanel />);
    fireEvent.click(screen.getByRole('button', { name: /end turn/i }));

    expect(mockOptionalProtocol.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'combat_command',
        data: expect.objectContaining({
          commands: [expect.objectContaining({ type: 'end_turn', actor_id: 'cmb-2' })],
        }),
      }),
    );
  });
});

describe('GameModeSwitch', () => {
  it('renders nothing for non-DM', () => {
    useGameStore.setState({ sessionRole: 'player' });
    const { container } = render(<GameModeSwitch />);
    expect(container.firstChild).toBeNull();
  });

  it('renders mode select for DM', () => {
    useGameStore.setState({ sessionRole: 'owner' });
    render(<GameModeSwitch />);
    expect(screen.getByRole('combobox')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Free Roam' })).toBeTruthy();
  });

  it('shows round badge in fight mode', () => {
    useGameStore.setState({ sessionRole: 'owner' });
    useGameModeStore.setState({ mode: 'fight', roundNumber: 3 });
    render(<GameModeSwitch />);
    expect(screen.getByText('Round 3')).toBeTruthy();
  });

  it('does not show round badge in free_roam', () => {
    useGameStore.setState({ sessionRole: 'owner' });
    useGameModeStore.setState({ mode: 'free_roam', roundNumber: 0 });
    render(<GameModeSwitch />);
    expect(screen.queryByText(/Round/)).toBeNull();
  });

  it('sends mode changes through the combat command hook', () => {
    useGameStore.setState({ sessionRole: 'owner' });
    render(<GameModeSwitch />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'fight' } });

    expect(mockOptionalProtocol.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'GAME_MODE_CHANGE',
        data: { game_mode: 'fight' },
      })
    );
  });
});
