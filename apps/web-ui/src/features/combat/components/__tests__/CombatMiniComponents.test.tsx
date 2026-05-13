import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useGameStore } from '@/store';
import { useCombatStore } from '../../stores/combatStore';
import { useGameModeStore } from '../../stores/gameModeStore';
import { TurnBanner } from '../TurnBanner';
import { ActionEconomyBar } from '../ActionEconomyBar';
import { GameModeSwitch } from '../GameModeSwitch';
import { ProtocolService } from '@lib/api';

vi.mock('@lib/api', () => ({
  ProtocolService: { getProtocol: vi.fn().mockReturnValue({ sendMessage: vi.fn() }) },
}));
vi.mock('@lib/websocket', () => ({
  createMessage: vi.fn().mockReturnValue({}),
  MessageType: { TURN_END: 'TURN_END', GAME_MODE_CHANGE: 'GAME_MODE_CHANGE' },
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
  phase: 'active' as const,
  round_number: 1,
  current_turn_index: 0,
  combatants: [makeCombatant()],
  settings: {} as never,
};

beforeEach(() => {
  vi.clearAllMocks();
  useGameStore.setState({ userId: 42, sessionRole: 'player' });
  useCombatStore.setState({ combat: null, getCurrentCombatant: () => null });
  useGameModeStore.setState({ mode: 'free_roam', roundNumber: 0 });
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
    const sendMessage = vi.fn();
    // ProtocolService is already mocked at top — override for this test
    vi.mocked(ProtocolService.getProtocol).mockReturnValue({ sendMessage } as never);
    const c = makeCombatant({ controlled_by: ['42'] });
    useCombatStore.setState({
      combat: { ...baseCombat, combatants: [c] },
      getCurrentCombatant: () => c,
    });
    render(<TurnBanner />);
    fireEvent.click(screen.getByRole('button', { name: /end turn/i }));
    expect(sendMessage).toHaveBeenCalled();
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

  it('shows movement remaining', () => {
    useCombatStore.setState({ combat: { ...baseCombat, combatants: [makeCombatant({ controlled_by: ['42'], movement_remaining: 25 })] } });
    render(<ActionEconomyBar />);
    expect(screen.getByText('25ft')).toBeTruthy();
  });
});

// ── GameModeSwitch ────────────────────────────────────────────────────────────

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
});
