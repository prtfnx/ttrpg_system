import { useGameStore } from '@/store';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCombatStore } from '../../stores/combatStore';
import { CombatDock } from '../CombatDock';

vi.mock('../ActionEconomyBar', () => ({ ActionEconomyBar: () => <div>Action economy</div> }));
vi.mock('../ActionPanel', () => ({ ActionPanel: () => <div>Player actions</div> }));
vi.mock('../CommitButton', () => ({ CommitButton: () => <div>Commit plan</div> }));
vi.mock('../DMCombatPanel', () => ({ DMCombatPanel: () => <div>DM work surface</div> }));
vi.mock('../GameModeSwitch', () => ({ GameModeSwitch: () => <div>Game mode</div> }));
vi.mock('../InitiativePanel', () => ({ InitiativePanel: () => <div>Initiative order</div> }));
vi.mock('../PlanningQueue', () => ({ PlanningQueue: () => <div>Planned actions</div> }));

const combat = {
  combat_id: 'combat-1',
  session_id: 'session-1',
  table_id: 'table-1',
  phase: 'active',
  round_number: 3,
  current_turn_index: 0,
  combatants: [{
    combatant_id: 'combatant-1',
    entity_id: 'token-1',
    character_id: 'character-1',
    name: 'Ada',
    initiative: 18,
    has_action: true,
    has_bonus_action: true,
    has_reaction: true,
    movement_remaining: 25,
    movement_speed: 30,
    hp: 20,
    max_hp: 24,
    temp_hp: 0,
    armor_class: 16,
    conditions: [],
    is_npc: false,
    is_hidden: false,
    is_defeated: false,
    controlled_by: ['7'],
    ai_enabled: false,
    ai_behavior: 'tactical',
  }],
  action_log: [],
  started_at: 1,
  settings: {},
  state_hash: 'hash',
} as never;

beforeEach(() => {
  useCombatStore.setState({ combat: null });
  useGameStore.setState({ sessionRole: 'player', userId: 7 });
});

describe('CombatDock', () => {
  it('stays hidden for a player outside combat', () => {
    const { container } = render(<CombatDock />);
    expect(container.firstChild).toBeNull();
  });

  it('puts the active actor, initiative, actions, and planning flow in one surface', () => {
    useCombatStore.setState({ combat });

    render(<CombatDock />);

    expect(screen.getByRole('region', { name: 'Combat dock' })).toBeTruthy();
    expect(screen.getByText('Combat · Round 3')).toBeTruthy();
    expect(screen.getByText("Ada's turn")).toBeTruthy();
    expect(screen.getByText('20/24 HP')).toBeTruthy();
    expect(screen.getByText('AC 16')).toBeTruthy();
    expect(screen.getByText('Initiative order')).toBeTruthy();
    expect(screen.getByText('Player actions')).toBeTruthy();
    expect(screen.getByText('Planned actions')).toBeTruthy();
    expect(screen.getByText('Commit plan')).toBeTruthy();
    expect(screen.queryByText('DM controls')).toBeNull();
  });

  it('shows combat setup and DM controls to a DM before combat starts', () => {
    useGameStore.setState({ sessionRole: 'owner' });

    render(<CombatDock />);

    expect(screen.getByText('Combat setup')).toBeTruthy();
    expect(screen.getByText('DM controls')).toBeTruthy();
    expect(screen.getByText('Game mode')).toBeTruthy();
    expect(screen.getByText('DM work surface')).toBeTruthy();
  });

  it('collapses the combat body without unmounting the dock', () => {
    useCombatStore.setState({ combat });
    render(<CombatDock />);

    fireEvent.click(screen.getByRole('button', { expanded: true }));

    expect(screen.queryByText('Initiative order')).toBeNull();
    expect(screen.getByRole('button', { expanded: false })).toBeTruthy();
  });
});
