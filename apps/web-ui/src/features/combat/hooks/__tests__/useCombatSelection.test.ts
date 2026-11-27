import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useCombatStore } from '../../stores/combatStore';
import { useCombatSelection } from '../useCombatSelection';

const ada = {
  combatant_id: 'ada',
  name: 'Ada',
  is_hidden: false,
  is_defeated: false,
} as never;
const borin = {
  combatant_id: 'borin',
  name: 'Borin',
  is_hidden: false,
  is_defeated: false,
} as never;

beforeEach(() => {
  useCombatStore.setState({ combat: null });
});

describe('useCombatSelection', () => {
  it('defaults selection to the current visible combatant', () => {
    useCombatStore.setState({
      combat: {
        combatants: [ada, borin],
        current_turn_index: 1,
      } as never,
    });

    const { result } = renderHook(() => useCombatSelection());

    expect(result.current.selectedCombatant?.name).toBe('Borin');
    expect(result.current.selectedCombatantId).toBe('borin');
  });

  it('selects another visible combatant for inspection', () => {
    useCombatStore.setState({
      combat: {
        combatants: [ada, borin],
        current_turn_index: 0,
      } as never,
    });
    const { result } = renderHook(() => useCombatSelection());

    act(() => result.current.selectCombatant('borin'));

    expect(result.current.selectedCombatant?.name).toBe('Borin');
  });

  it('does not select a combatant absent from the role-filtered state', () => {
    useCombatStore.setState({
      combat: {
        combatants: [ada],
        current_turn_index: 0,
      } as never,
    });
    const { result } = renderHook(() => useCombatSelection());

    act(() => result.current.selectCombatant('hidden-npc'));

    expect(result.current.selectedCombatantId).toBe('ada');
  });

  it('keeps the authoritative index when a DM view includes a hidden actor', () => {
    useCombatStore.setState({ combat: { combatants: [
      { combatant_id: 'hidden', name: 'Hidden', is_hidden: true, is_defeated: false }, ada, borin,
    ], current_turn_index: 2 } as never });
    const { result } = renderHook(() => useCombatSelection());
    expect(result.current.selectedCombatantId).toBe('borin');
    act(() => result.current.selectCombatant('hidden'));
    expect(result.current.selectedCombatantId).toBe('hidden');
  });

  it('counts defeated actors when the encounter keeps them in initiative', () => {
    useCombatStore.setState({ combat: { combatants: [
      { combatant_id: 'defeated', name: 'Defeated', is_hidden: false, is_defeated: true }, ada, borin,
    ], current_turn_index: 2, settings: { skip_defeated: false } } as never });
    const { result } = renderHook(() => useCombatSelection());
    expect(result.current.selectedCombatantId).toBe('borin');
  });
});
