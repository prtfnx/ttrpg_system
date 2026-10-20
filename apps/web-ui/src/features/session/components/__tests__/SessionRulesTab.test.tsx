import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useGameStore } from '@/store';
import {
  DEFAULT_RULES,
  useSessionRulesStore,
} from '@features/combat/stores/sessionRulesStore';
import { SessionRulesTab } from '../SessionRulesTab';

describe('SessionRulesTab', () => {
  beforeEach(() => {
    useGameStore.setState({ sessionRole: 'owner' });
    useSessionRulesStore.setState({
      rules: { session_id: 'test', ...DEFAULT_RULES },
      draft: {},
      isDirty: false,
    });
  });

  it('offers only server-validated movement tiers', () => {
    render(<SessionRulesTab />);

    const validationSelect = screen.getByLabelText('Server validation');
    const options = within(validationSelect).getAllByRole('option');

    expect(options.map((option) => option.textContent)).toEqual([
      'Lightweight (segment check, no A*)',
      'Full (server A* pathfinding)',
    ]);
  });

  it('defaults to DM-only outside movement and stages each policy', () => {
    render(<SessionRulesTab />);
    const select = screen.getByLabelText('Move sprites outside the table');
    expect(select).toHaveValue('dm_only');
    expect(within(select).getAllByRole('option')).toHaveLength(3);
    fireEvent.change(select, { target: { value: 'all' } });
    expect(useSessionRulesStore.getState().draft.out_of_bounds_movement).toBe('all');
    fireEvent.change(select, { target: { value: 'none' } });
    expect(useSessionRulesStore.getState().draft.out_of_bounds_movement).toBe('none');
  });
});
