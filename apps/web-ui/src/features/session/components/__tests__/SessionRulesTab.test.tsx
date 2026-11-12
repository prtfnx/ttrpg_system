import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGameStore } from '@/store';
import {
  DEFAULT_RULES,
  useSessionRulesStore,
} from '@features/combat/stores/sessionRulesStore';
import { SessionRulesTab } from '../SessionRulesTab';
import { ProtocolService } from '@lib/api';
import type { Message } from '@lib/websocket';
import { showToast } from '@shared/utils';

describe('SessionRulesTab', () => {
  afterEach(() => vi.restoreAllMocks());
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

  it.each([false, true])('sends complete rules and retains the draft before confirmation (sent=%s)', sent => {
    const send = vi.fn((_message: Message) => sent);
    vi.spyOn(ProtocolService, 'getProtocol').mockReturnValue({ sendMessage: send } as never);
    const success = vi.spyOn(showToast, 'success').mockImplementation(() => undefined);
    vi.spyOn(showToast, 'warning').mockImplementation(() => undefined);
    vi.spyOn(showToast, 'error').mockImplementation(() => undefined);
    useSessionRulesStore.setState({
      rules: { session_id: 'test', ...DEFAULT_RULES, default_movement_speed: 60 },
      draft: { out_of_bounds_movement: 'none' }, isDirty: true,
    });
    render(<SessionRulesTab />);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(send.mock.calls[0][0].data?.rules).toMatchObject({
      out_of_bounds_movement: 'none', default_movement_speed: 60,
    });
    expect(useSessionRulesStore.getState().draft).toEqual({ out_of_bounds_movement: 'none' });
    expect(useSessionRulesStore.getState().isDirty).toBe(true);
    expect(success).not.toHaveBeenCalled();
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
