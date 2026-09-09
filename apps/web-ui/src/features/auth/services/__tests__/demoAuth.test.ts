import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoQuery } from '@shared/utils/demoSession';
import { authService } from '../auth.service';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function demoWindow() {
  const page = {
    __INITIAL_DATA__: { isDemo: true, sessionCode: 'DEMO2026' },
    location: { href: '/game/session/DEMO2026?demo=1' },
  };
  vi.stubGlobal('window', page);
  return page;
}

describe('separate demo identity', () => {
  it('uses guest identity and sessions throughout authentication', async () => {
    demoWindow();
    const sessions = [{ session_code: 'DEMO2026', role: 'spectator' }];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ id: 42, username: 'guest', sessions }),
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await authService.initialize()).toBe(true);
    expect(authService.getUserInfo()?.id).toBe(42);
    expect(await authService.validateToken('authenticated-via-cookie')).toMatchObject({ id: 42 });
    expect(await authService.getUserSessions()).toEqual(sessions);
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['/demo/me', '/demo/me', '/demo/me']);
  });

  it('does not fall back to the account when the guest expires', async () => {
    demoWindow();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal('fetch', fetchMock);
    expect(await authService.initialize()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/demo/me', expect.any(Object));
  });

  it('leaves through guest logout without clearing the account cookie', () => {
    const page = demoWindow();
    const cookieSetter = vi.spyOn(document, 'cookie', 'set');
    authService.logout();
    expect(page.location.href).toBe('/demo/logout');
    cookieSetter.mock.calls.forEach(call => expect(call[0]).not.toMatch(/^token=/));
  });

  it('opts only the injected demo session into guest HTTP and WebSocket access', () => {
    const page = demoWindow();
    expect(demoQuery('DEMO2026')).toBe('?demo=1');
    expect(demoQuery('ANOTHER')).toBe('');
    page.__INITIAL_DATA__.isDemo = false;
    expect(demoQuery('DEMO2026')).toBe('');
  });
});
