import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sessionManagementService } from '../sessionManagement.service';

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
});

function ok(data: unknown) {
  return { ok: true, json: () => Promise.resolve(data) } as never;
}

function fail(_status = 400, statusText = 'Bad Request') {
  return { ok: false, statusText } as never;
}

describe('sessionManagementService', () => {
  describe('getPlayers', () => {
    it('returns players on success', async () => {
      const players = [{ id: 1, username: 'alice', role: 'player' }];
      mockFetch.mockResolvedValue(ok(players));
      const result = await sessionManagementService.getPlayers('ABC123');
      expect(result).toEqual(players);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/sessions/ABC123/players'),
        expect.objectContaining({ credentials: 'include' })
      );
    });

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValue(fail(404, 'Not Found'));
      await expect(sessionManagementService.getPlayers('X')).rejects.toThrow('Failed to fetch players');
    });
  });

  describe('changePlayerRole', () => {
    it('sends POST and returns response on success', async () => {
      mockFetch.mockResolvedValue(ok({ success: true }));
      const result = await sessionManagementService.changePlayerRole('ABC', 42, { new_role: 'player' });
      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/players/42/role'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('throws on failure', async () => {
      mockFetch.mockResolvedValue(fail(403, 'Forbidden'));
      await expect(sessionManagementService.changePlayerRole('X', 1, { new_role: 'player' })).rejects.toThrow('Failed to change role');
    });
  });

  describe('kickPlayer', () => {
    it('sends DELETE on success', async () => {
      mockFetch.mockResolvedValue({ ok: true } as never);
      await sessionManagementService.kickPlayer('ABC', 5);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/players/5'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('throws on failure', async () => {
      mockFetch.mockResolvedValue(fail(403, 'Forbidden'));
      await expect(sessionManagementService.kickPlayer('X', 1)).rejects.toThrow('Failed to kick player');
    });
  });
});
