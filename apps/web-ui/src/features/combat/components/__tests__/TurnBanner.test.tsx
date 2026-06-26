import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCombatStore } from '../../stores/combatStore';
import { TurnBanner } from '../TurnBanner';

const mockSendMessage = vi.fn();

vi.mock('@/store', () => ({
  useGameStore: (sel?: (s: { userId: number | null }) => unknown) =>
    sel ? sel({ userId: 42 }) : { userId: 42 },
}));

vi.mock('@lib/api', () => ({
  useOptionalProtocol: vi.fn(() => ({ protocol: { sendMessage: mockSendMessage } })),
}));

vi.mock('@lib/websocket', () => ({
  createMessage: vi.fn((type, data) => ({ type, data })),
  MessageType: { COMBAT_COMMAND: 'combat_command' },
}));

const baseCombatant = {
  combatant_id: 'c1',
  entity_id: 'e1',
  character_id: null,
  name: 'Gandalf',
  initiative: 20,
  has_action: true,
  has_bonus_action: true,
  has_reaction: true,
  movement_remaining: 30,
  movement_speed: 30,
  hp: 50,
  max_hp: 50,
  temp_hp: 0,
  armor_class: 15,
  conditions: [],
  is_npc: false,
  is_hidden: false,
  is_defeated: false,
  controlled_by: ['42'], // matches userId=42
  ai_enabled: false,
  ai_behavior: 'passive',
};

const activeCombat = {
  combat_id: 'combat1',
  session_id: 's1',
  table_id: 't1',
  phase: 'active',
  round_number: 1,
  current_turn_index: 0,
  combatants: [baseCombatant],
  action_log: [],
  started_at: Date.now(),
  settings: {} as never,
  state_hash: 'abc',
};

beforeEach(() => {
  useCombatStore.setState({ combat: null, isMyTurn: false, getCurrentCombatant: () => null } as never);
  vi.clearAllMocks();
});

describe('TurnBanner', () => {
  it('renders nothing when no combat', () => {
    const { container } = render(<TurnBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when combat phase is not active', () => {
    useCombatStore.setState({ combat: { ...activeCombat, phase: 'setup' }, isMyTurn: false });
    const { container } = render(<TurnBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('shows "Your Turn!" when it is my turn', () => {
    useCombatStore.setState({
      combat: activeCombat,
      isMyTurn: true,
      getCurrentCombatant: () => baseCombatant,
    } as never);
    render(<TurnBanner />);
    expect(screen.getByText(/your turn/i)).toBeTruthy();
  });

  it('shows other character name when not my turn', () => {
    useCombatStore.setState({
      combat: activeCombat,
      isMyTurn: false,
      getCurrentCombatant: () => ({ ...baseCombatant, controlled_by: ['99'] }),
    } as never);
    render(<TurnBanner />);
    expect(screen.getByText(/gandalf/i)).toBeTruthy();
  });

  it('sends end turn through combat_command when End Turn clicked', async () => {
    useCombatStore.setState({
      combat: activeCombat,
      isMyTurn: true,
      getCurrentCombatant: () => baseCombatant,
    } as never);
    render(<TurnBanner />);
    await userEvent.click(screen.getByRole('button', { name: /end turn/i }));
    expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'combat_command',
      data: expect.objectContaining({
        commands: [expect.objectContaining({
          type: 'end_turn',
          actor_id: 'c1',
        })],
      }),
    }));
  });
});
