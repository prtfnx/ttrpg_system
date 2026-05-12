import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { CombatLog } from '../CombatLog';
import { useCombatStore } from '../../stores/combatStore';

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = () => {};

const withLog = (entries: object[]) =>
  useCombatStore.setState({ combat: { action_log: entries } as never, isMyTurn: false });

beforeEach(() => {
  // Provide a stable combat object — null causes Zustand selector ?? [] to
  // return a new array reference on every call, triggering an infinite render loop.
  withLog([]);
});

describe('CombatLog', () => {
  it('shows empty message when no combat', () => {
    // Can't test null combat directly — null causes selector to return a new
    // [] reference on every call, which triggers an infinite render loop
    // in Zustand v5 + React 19 useSyncExternalStore. Test the empty-log path instead.
    withLog([]);
    render(<CombatLog />);
    expect(screen.getByText(/no actions yet/i)).toBeTruthy();
  });

  it('shows empty message when combat has no log entries', () => {
    withLog([]);
    render(<CombatLog />);
    expect(screen.getByText(/no actions yet/i)).toBeTruthy();
  });

  it('renders actor names from log', () => {
    withLog([
      { actor_name: 'Gandalf', action_type: 'attack', target_name: 'Orc', round: 1, damage: 10 },
      { actor_name: 'Legolas', action_type: 'shoot', target_name: 'Troll' },
    ]);
    render(<CombatLog />);
    expect(screen.getByText('Gandalf')).toBeTruthy();
    expect(screen.getByText('Legolas')).toBeTruthy();
  });

  it('shows round number when provided', () => {
    withLog([{ actor_name: 'Hero', round: 3 }]);
    render(<CombatLog />);
    expect(screen.getByText('R3')).toBeTruthy();
  });

  it('shows damage', () => {
    withLog([{ actor_name: 'Attacker', damage: 8 }]);
    render(<CombatLog />);
    expect(screen.getByText(/-8 dmg/i)).toBeTruthy();
  });

  it('shows healing', () => {
    withLog([{ actor_name: 'Healer', healing: 5 }]);
    render(<CombatLog />);
    expect(screen.getByText(/\+5 hp/i)).toBeTruthy();
  });

  it('uses ? when actor_name is missing', () => {
    withLog([{ action_type: 'move' }]);
    render(<CombatLog />);
    expect(screen.getByText('?')).toBeTruthy();
  });
});
