import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActivityTab } from '../ActivityTab';

const mockRequestCharacterLog = vi.fn();

vi.mock('@lib/api', () => ({
  ProtocolService: {
    hasProtocol: () => true,
    getProtocol: () => ({ requestCharacterLog: mockRequestCharacterLog }),
  },
}));

describe('ActivityTab', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests log on mount', () => {
    render(<ActivityTab characterId="char-1" />);
    expect(mockRequestCharacterLog).toHaveBeenCalledWith('char-1', 50);
  });

  it('renders log entries received via custom event', async () => {
    render(<ActivityTab characterId="char-1" />);

    window.dispatchEvent(
      new CustomEvent('character-log-response', {
        detail: {
          character_id: 'char-1',
          logs: [
            { id: 1, action_type: 'hp_change', description: 'Took 5 damage', created_at: new Date().toISOString() },
            { id: 2, action_type: 'spell_cast', description: 'Cast Fireball', created_at: new Date().toISOString() },
          ],
        },
      })
    );

    await waitFor(() => {
      expect(screen.getByText('Took 5 damage')).toBeInTheDocument();
      expect(screen.getByText('Cast Fireball')).toBeInTheDocument();
    });
  });

  it('ignores events for a different character', async () => {
    render(<ActivityTab characterId="char-1" />);

    window.dispatchEvent(
      new CustomEvent('character-log-response', {
        detail: {
          character_id: 'char-99',
          logs: [{ id: 9, action_type: 'hp_change', description: 'Wrong character', created_at: new Date().toISOString() }],
        },
      })
    );

    // Wait a tick then verify nothing appeared
    await new Promise(r => setTimeout(r, 30));
    expect(screen.queryByText('Wrong character')).not.toBeInTheDocument();
  });

  it('appends roll results from character-roll-result event', async () => {
    render(<ActivityTab characterId="char-1" />);

    window.dispatchEvent(
      new CustomEvent('character-roll-result', {
        detail: { character_id: 'char-1', description: 'Stealth check: 18', total: 18 },
      })
    );

    await waitFor(() => {
      expect(screen.getByText('Stealth check: 18')).toBeInTheDocument();
    });
  });

  it('Refresh button re-requests the log', async () => {
    render(<ActivityTab characterId="char-1" />);
    mockRequestCharacterLog.mockClear();

    // Dispatch response so loading clears and Refresh becomes enabled
    window.dispatchEvent(
      new CustomEvent('character-log-response', {
        detail: { character_id: 'char-1', logs: [] },
      })
    );

    await waitFor(() => screen.getByRole('button', { name: 'Refresh' }));
    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(mockRequestCharacterLog).toHaveBeenCalledWith('char-1', 50);
  });

  it('shows empty state when no logs loaded', async () => {
    render(<ActivityTab characterId="char-1" />);

    window.dispatchEvent(
      new CustomEvent('character-log-response', {
        detail: { character_id: 'char-1', logs: [] },
      })
    );

    await waitFor(() => {
      expect(screen.getByText('No activity yet.')).toBeInTheDocument();
    });
  });
});
