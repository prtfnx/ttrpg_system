import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useSessionPlayers } from '../useSessionPlayers';

vi.mock('../../services/sessionManagement.service', () => ({
  sessionManagementService: {
    getPlayers: vi.fn(),
  },
}));

import { sessionManagementService } from '../../services/sessionManagement.service';

const mockPlayers = [
  { userId: 1, username: 'Alice', role: 'dm' },
  { userId: 2, username: 'Bob', role: 'player' },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useSessionPlayers', () => {
  it('returns empty players and loading=false initially when sessionCode is null', async () => {
    const { result } = renderHook(() => useSessionPlayers(null));
    expect(result.current.players).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('does not call getPlayers when sessionCode is null', () => {
    renderHook(() => useSessionPlayers(null));
    expect(sessionManagementService.getPlayers).not.toHaveBeenCalled();
  });

  it('fetches players on mount when sessionCode provided', async () => {
    (sessionManagementService.getPlayers as ReturnType<typeof vi.fn>).mockResolvedValue(mockPlayers);
    const { result } = renderHook(() => useSessionPlayers('SESS123'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(sessionManagementService.getPlayers).toHaveBeenCalledWith('SESS123');
    expect(result.current.players).toEqual(mockPlayers);
    expect(result.current.error).toBeNull();
  });

  it('sets loading=true while fetching', async () => {
    let resolve: (v: typeof mockPlayers) => void;
    const promise = new Promise<typeof mockPlayers>((res) => { resolve = res; });
    (sessionManagementService.getPlayers as ReturnType<typeof vi.fn>).mockReturnValue(promise);

    const { result } = renderHook(() => useSessionPlayers('SESS456'));

    expect(result.current.loading).toBe(true);
    act(() => resolve(mockPlayers));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('sets error on fetch failure', async () => {
    (sessionManagementService.getPlayers as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Server error')
    );
    const { result } = renderHook(() => useSessionPlayers('SESS789'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Server error');
    expect(result.current.players).toEqual([]);
  });

  it('sets generic error message for non-Error rejections', async () => {
    (sessionManagementService.getPlayers as ReturnType<typeof vi.fn>).mockRejectedValue('oops');
    const { result } = renderHook(() => useSessionPlayers('CODE1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Failed to fetch players');
  });

  it('refetch re-requests players', async () => {
    (sessionManagementService.getPlayers as ReturnType<typeof vi.fn>).mockResolvedValue(mockPlayers);
    const { result } = renderHook(() => useSessionPlayers('CODE2'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(sessionManagementService.getPlayers).toHaveBeenCalledTimes(1);

    await act(async () => { await result.current.refetch(); });
    expect(sessionManagementService.getPlayers).toHaveBeenCalledTimes(2);
  });

  it('refetches when sessionCode changes', async () => {
    (sessionManagementService.getPlayers as ReturnType<typeof vi.fn>).mockResolvedValue(mockPlayers);
    const { result, rerender } = renderHook(
      ({ code }: { code: string | null }) => useSessionPlayers(code),
      { initialProps: { code: 'AABB' } }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(sessionManagementService.getPlayers).toHaveBeenCalledWith('AABB');

    rerender({ code: 'CCDD' });
    await waitFor(() => expect(sessionManagementService.getPlayers).toHaveBeenCalledWith('CCDD'));
  });
});
