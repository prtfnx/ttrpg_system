import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerManagerPanel } from '../PlayerManagerPanel';

const mocks = vi.hoisted(() => ({
  banPlayer: vi.fn(),
  kickPlayer: vi.fn(),
  requestPlayerList: vi.fn(),
}));

vi.mock('@features/auth', () => ({
  useAuthenticatedWebSocket: () => ({ protocol: mocks }),
}));

const userInfo = { id: 1, username: 'Owner' };
const players = [
  {
    client_id: 'owner-client',
    user_id: 1,
    username: 'Owner',
    role: 'owner',
    ready: true,
    connected_at: 1,
    last_ping: 2,
  },
  {
    client_id: 'dm-client',
    user_id: 2,
    username: 'Co-DM',
    role: 'co_dm',
    ready: false,
    connected_at: 1,
    last_ping: 2,
  },
  {
    client_id: 'player-client',
    user_id: 3,
    username: 'Ada',
    role: 'player',
    ready: false,
    connected_at: 1,
    last_ping: 2,
  },
];

function renderPanel(sessionRole: 'owner' | 'player' = 'owner') {
  return render(
    <PlayerManagerPanel
      sessionCode="ABC123"
      userInfo={userInfo}
      sessionRole={sessionRole}
    />,
  );
}

describe('PlayerManagerPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the wire roster and sends valid kick and ban commands', () => {
    renderPanel();

    act(() => {
      window.dispatchEvent(new CustomEvent('player-list-updated', {
        detail: { players, count: players.length, session_code: 'ABC123' },
      }));
    });

    expect(screen.getByText('Owner (ready)')).toBeInTheDocument();
    expect(screen.getByText('Co-DM (connected)')).toBeInTheDocument();
    expect(screen.getByText('Ada (connected)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kick Owner' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kick Co-DM' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Kick Ada' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ban Ada' }));

    expect(mocks.kickPlayer).toHaveBeenCalledWith('3');
    expect(mocks.banPlayer).toHaveBeenCalledWith('3');
  });

  it('refreshes the roster after player lifecycle changes', () => {
    renderPanel();
    expect(mocks.requestPlayerList).toHaveBeenCalledOnce();

    act(() => {
      window.dispatchEvent(new CustomEvent('player-left', {
        detail: { username: 'Ada', timestamp: '2026-08-07T12:05:00+00:00' },
      }));
    });

    expect(mocks.requestPlayerList).toHaveBeenCalledTimes(2);
  });

  it('does not request or expose management controls to non-DMs', () => {
    renderPanel('player');

    expect(screen.getByText('Only DMs can manage players.')).toBeInTheDocument();
    expect(mocks.requestPlayerList).not.toHaveBeenCalled();
  });

  it('shows protocol errors through an alert', () => {
    renderPanel();

    act(() => {
      window.dispatchEvent(new CustomEvent('protocol-error', {
        detail: { error: 'Player not found' },
      }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Player not found');
  });
});
