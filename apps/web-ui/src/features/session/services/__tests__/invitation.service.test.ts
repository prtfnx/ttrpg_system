import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invitationService } from '../invitation.service';

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
});

function ok(data: unknown = {}) {
  return { ok: true, json: () => Promise.resolve(data), text: () => Promise.resolve('') } as never;
}

function fail(statusText = 'Bad Request') {
  return { ok: false, statusText, text: () => Promise.resolve(statusText) } as never;
}

describe('invitationService', () => {
  it('createInvitation POSTs and returns invitation', async () => {
    const inv = { id: 1, invite_code: 'ABC', session_code: 'SESS' };
    mockFetch.mockResolvedValue(ok(inv));
    const result = await invitationService.createInvitation({ session_code: 'SESS' } as never);
    expect(result).toEqual(inv);
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/create'), expect.objectContaining({ method: 'POST' }));
  });

  it('createInvitation throws on failure', async () => {
    mockFetch.mockResolvedValue(fail('Server Error'));
    await expect(invitationService.createInvitation({ session_code: 'X' } as never)).rejects.toThrow();
  });

  it('getInvitation fetches by code', async () => {
    mockFetch.mockResolvedValue(ok({ invite_code: 'CODE' }));
    await invitationService.getInvitation('CODE');
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/CODE'), expect.any(Object));
  });

  it('acceptInvitation POSTs to accept endpoint', async () => {
    mockFetch.mockResolvedValue(ok({ session_code: 'SESS' }));
    await invitationService.acceptInvitation('CODE');
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/CODE/accept'), expect.objectContaining({ method: 'POST' }));
  });

  it('listSessionInvitations fetches session invitations', async () => {
    mockFetch.mockResolvedValue(ok([]));
    await invitationService.listSessionInvitations('SESS');
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/session/SESS'), expect.any(Object));
  });

  it('getInvitations delegates to listSessionInvitations', async () => {
    mockFetch.mockResolvedValue(ok([]));
    await invitationService.getInvitations('SESS');
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/session/SESS'), expect.any(Object));
  });

  it('revokeInvitation sends DELETE to the server soft-revoke endpoint', async () => {
    mockFetch.mockResolvedValue(ok({ success: true, message: 'ok' }));
    await invitationService.revokeInvitation(7);
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/7'), expect.objectContaining({ method: 'DELETE' }));
  });

  it('fetchAPI includes credentials and JSON headers', async () => {
    mockFetch.mockResolvedValue(ok({}));
    await invitationService.getInvitation('CODE');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      })
    );
  });
});
