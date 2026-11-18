import { useGameStore } from '@/store';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useCombatStore, type CombatStateView } from '../../stores/combatStore';
import { CombatDock } from '../CombatDock';
import { TurnBanner } from '../TurnBanner';
import views from './fixtures/combatPublicViews.json';

afterEach(() => {
  cleanup();
  useCombatStore.getState().setCombat(null);
});

describe('server-filtered combat views', () => {
  for (const role of ['player', 'spectator'] as const) {
    for (const currentTurn of [0, 1]) {
      it(`renders ${role} controls on turn ${currentTurn} without private grants`, () => {
        useGameStore.setState({ userId: 7, sessionRole: role });
        const incoming = { ...views[role], current_turn_index: currentTurn } as CombatStateView;
        const original = JSON.stringify(incoming);
        useCombatStore.getState().setCombat(incoming);

        render(<><CombatDock /><TurnBanner /></>);

        expect(screen.getByRole('region', { name: 'Combat dock' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Plan turn' })).toBeNull();
        expect(screen.queryByText('Your Turn!')).toBeNull();
        const npc = useCombatStore.getState().combat!.combatants[0];
        expect(npc).toMatchObject({ controlled_by: [], hp: null, max_hp: null, temp_hp: 0 });
        expect(npc.armor_class).toBeUndefined();
        expect(npc.ai_enabled).toBeUndefined();
        expect(JSON.stringify(incoming)).toBe(original);
      });
    }
  }

  it('preserves explicit controller grants and visible health', () => {
    useGameStore.setState({ userId: 8, sessionRole: 'player' });
    const incoming = { ...views.controller, current_turn_index: 1 } as CombatStateView;
    useCombatStore.getState().setCombat(incoming);

    render(<><CombatDock /><TurnBanner /></>);

    expect(screen.getByRole('button', { name: 'Plan turn' })).toBeInTheDocument();
    expect(screen.getByText('Your Turn!')).toBeInTheDocument();
    expect(useCombatStore.getState().combat!.combatants[1]).toMatchObject({
      controlled_by: ['8'], hp: 20, max_hp: 20,
    });
  });
});
