import { render, screen, within } from '@testing-library/react';
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
});
