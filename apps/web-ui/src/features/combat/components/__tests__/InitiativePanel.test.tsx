import { useGameStore } from '@/store';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCombatStore, type CombatSettings } from '../../stores/combatStore';
import { InitiativePanel } from '../InitiativePanel';

const mockSend = vi.fn();

vi.mock('@/store', () => ({
  useGameStore: vi.fn(),
}));

vi.mock('@lib/api', () => ({
  ProtocolService: {
    getProtocol: () => ({ sendMessage: mockSend }),
  },
}));

vi.mock('@lib/websocket', () => ({
  createMessage: vi.fn((type, payload) => ({ type, payload })),
  MessageType: {
    INITIATIVE_ROLL: 'INITIATIVE_ROLL',
    DEATH_SAVE_ROLL: 'DEATH_SAVE_ROLL',
    TURN_SKIP: 'TURN_SKIP',
    INITIATIVE_REMOVE: 'INITIATIVE_REMOVE',
  },
}));

vi.mock('../ConditionBadges', () => ({
  ConditionBadges: () => null,
}));

const baseCombatant = {
  combatant_id: 'c1',
  entity_id: 'e1',
  character_id: null,
  name: 'Goblin',
  initiative: 10,
  has_action: true,
  has_bonus_action: true,
  has_reaction: true,
  movement_remaining: 30,
  movement_speed: 30,
  hp: 20,
  max_hp: 20,
  temp_hp: 0,
  armor_class: 13,
  conditions: [],
  is_npc: true,
  is_hidden: false,
  is_defeated: false,
  controlled_by: [],
  ai_enabled: false,
  ai_behavior: 'none',
};

const baseCombat = {
  combat_id: 'cbt1',
  session_id: 's1',
  table_id: 't1',
  phase: 'active',
  round_number: 1,
  current_turn_index: 0,
  combatants: [baseCombatant],
  action_log: [],
  started_at: null,
  settings: {} as unknown as CombatSettings,
  state_hash: 'x',
};

function setupStore({ role = 'owner', userId = 1 } = {}) {
  vi.mocked(useGameStore).mockImplementation((sel: (s: ReturnType<typeof useGameStore.getState>) => unknown) =>
    sel({ sessionRole: role, userId, characters: [] } as unknown as ReturnType<typeof useGameStore.getState>)
  );
}

beforeEach(() => {
  useCombatStore.setState({ combat: null, isMyTurn: false });
  mockSend.mockReset();
  setupStore();
});

describe('InitiativePanel', () => {
  it('renders nothing when no combat', () => {
    const { container } = render(<InitiativePanel />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when combat phase is inactive', () => {
    useCombatStore.setState({ combat: { ...baseCombat, phase: 'inactive' } });
    const { container } = render(<InitiativePanel />);
    expect(container.firstChild).toBeNull();
  });

  it('renders round number and phase', () => {
    useCombatStore.setState({ combat: { ...baseCombat, round_number: 3, phase: 'active' } });
    render(<InitiativePanel />);
    expect(screen.getByText('Round 3')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
  });

  it('renders combatant name', () => {
    useCombatStore.setState({ combat: baseCombat });
    render(<InitiativePanel />);
    expect(screen.getByText('Goblin')).toBeInTheDocument();
  });

  it('renders initiative value', () => {
    useCombatStore.setState({ combat: baseCombat });
    render(<InitiativePanel />);
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('shows — when initiative is null', () => {
    useCombatStore.setState({
      combat: {
        ...baseCombat,
        combatants: [{ ...baseCombatant, initiative: null, controlled_by: ['1'] }],
      },
    });
    render(<InitiativePanel />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('DM sees skip and remove buttons', () => {
    useCombatStore.setState({ combat: baseCombat });
    render(<InitiativePanel />);
    expect(screen.getByTitle('Skip turn')).toBeInTheDocument();
    expect(screen.getByTitle('Remove')).toBeInTheDocument();
  });

  it('player does not see DM action buttons', () => {
    setupStore({ role: 'player' });
    useCombatStore.setState({ combat: baseCombat });
    render(<InitiativePanel />);
    expect(screen.queryByTitle('Skip turn')).toBeNull();
  });

  it('DM click remove sends INITIATIVE_REMOVE', () => {
    useCombatStore.setState({ combat: baseCombat });
    render(<InitiativePanel />);
    fireEvent.click(screen.getByTitle('Remove'));
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ type: 'INITIATIVE_REMOVE' }));
  });

  it('DM click skip sends TURN_SKIP', () => {
    useCombatStore.setState({ combat: baseCombat });
    render(<InitiativePanel />);
    fireEvent.click(screen.getByTitle('Skip turn'));
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ type: 'TURN_SKIP' }));
  });

  it('player sees roll initiative button for own combatant', () => {
    setupStore({ role: 'player', userId: 99 });
    useCombatStore.setState({
      combat: {
        ...baseCombat,
        combatants: [{ ...baseCombatant, initiative: null, controlled_by: ['99'] }],
      },
    });
    render(<InitiativePanel />);
    expect(screen.getByTitle('Roll initiative')).toBeInTheDocument();
  });

  it('roll initiative click sends INITIATIVE_ROLL', () => {
    setupStore({ role: 'player', userId: 99 });
    useCombatStore.setState({
      combat: {
        ...baseCombat,
        combatants: [{ ...baseCombatant, initiative: null, controlled_by: ['99'] }],
      },
    });
    render(<InitiativePanel />);
    fireEvent.click(screen.getByTitle('Roll initiative'));
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ type: 'INITIATIVE_ROLL' }));
  });

  it('shows death save button for DM when hp is 0', () => {
    useCombatStore.setState({
      combat: {
        ...baseCombat,
        combatants: [{ ...baseCombatant, hp: 0 }],
      },
    });
    render(<InitiativePanel />);
    expect(screen.getByTitle('Roll death save')).toBeInTheDocument();
  });

  it('click death save sends DEATH_SAVE_ROLL', () => {
    useCombatStore.setState({
      combat: {
        ...baseCombat,
        combatants: [{ ...baseCombatant, hp: 0 }],
      },
    });
    render(<InitiativePanel />);
    fireEvent.click(screen.getByTitle('Roll death save'));
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ type: 'DEATH_SAVE_ROLL' }));
  });

  it('shows concentration badge when concentrating', () => {
    useCombatStore.setState({
      combat: {
        ...baseCombat,
        combatants: [{ ...baseCombatant, concentration_spell: 'Bless' }],
      },
    });
    render(<InitiativePanel />);
    expect(screen.getByTitle('Concentrating: Bless')).toBeInTheDocument();
  });

  it('shows surprised badge when surprised', () => {
    useCombatStore.setState({
      combat: {
        ...baseCombat,
        combatants: [{ ...baseCombatant, surprised: true }],
      },
    });
    render(<InitiativePanel />);
    expect(screen.getByTitle(/Surprised/)).toBeInTheDocument();
  });
});
