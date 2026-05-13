import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// AuthService uses `fetch` — stub it globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import after stubbing
import { authService } from '../auth.service';

function okResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
}

function errorResponse(status: number, body = '') {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.reject(new Error('not json')),
    text: () => Promise.resolve(body),
    statusText: `Error ${status}`,
  } as Response);
}

beforeEach(() => {
  mockFetch.mockReset();
  // Reset internal state between tests via initialize + clear
  (authService as unknown as { token: null; userInfo: null }).token = null;
  (authService as unknown as { token: null; userInfo: null }).userInfo = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('authService.login', () => {
  it('returns success on 200 response', async () => {
    // login fetches /users/login then calls initialize -> extractToken -> /users/me
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response) // POST /users/login
      .mockResolvedValueOnce(okResponse({ id: 1, username: 'alice', role: 'dm', permissions: [] })); // GET /users/me

    const result = await authService.login('alice', 'pass');
    expect(result.success).toBe(true);
  });

  it('returns failure with message on non-200', async () => {
    mockFetch.mockResolvedValueOnce(
      errorResponse(401, '{"error": "Invalid credentials"}')
    );
    const result = await authService.login('alice', 'wrong');
    expect(result.success).toBe(false);
    expect(result.message).toBe('Invalid credentials');
  });

  it('returns failure on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network down'));
    const result = await authService.login('alice', 'pass');
    expect(result.success).toBe(false);
    expect(result.message).toBe('Network error occurred');
  });

  it('falls back to generic message when error text has no match', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(400, 'Something went wrong'));
    const result = await authService.login('alice', 'pass');
    expect(result.success).toBe(false);
    expect(result.message).toBe('Login failed');
  });
});

describe('authService.register', () => {
  it('returns success on 200', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 } as Response);
    const result = await authService.register('bob', 'pass');
    expect(result.success).toBe(true);
  });

  it('returns failure on non-200', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(409, '{"error": "Username taken"}'));
    const result = await authService.register('bob', 'pass');
    expect(result.success).toBe(false);
    expect(result.message).toBe('Username taken');
  });

  it('returns failure on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('offline'));
    const result = await authService.register('bob', 'pass');
    expect(result.success).toBe(false);
    expect(result.message).toBe('Network error occurred');
  });
});

describe('authService.extractToken', () => {
  it('returns token and sets userInfo on /users/me 200', async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse({ id: 2, username: 'carol', role: 'player', permissions: ['read'] })
    );
    const token = await authService.extractToken();
    expect(token).toBe('authenticated-via-cookie');
    expect(authService.getUserInfo()?.username).toBe('carol');
  });

  it('returns null on 401 from /users/me', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(401));
    const token = await authService.extractToken();
    expect(token).toBeNull();
  });

  it('returns null on fetch error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('connection refused'));
    const token = await authService.extractToken();
    expect(token).toBeNull();
  });
});

describe('authService.validateToken', () => {
  it('returns userInfo on valid token', async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse({ id: 3, username: 'dave', role: 'dm', permissions: [] })
    );
    const info = await authService.validateToken('tok-abc');
    expect(info?.username).toBe('dave');
    expect(info?.role).toBe('dm');
  });

  it('attempts token refresh on 401', async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse(401))                            // /users/me -> 401
      .mockResolvedValueOnce(okResponse({ token: 'new-tok' }))              // /users/refresh -> ok
      .mockResolvedValueOnce(okResponse({ id: 4, username: 'eve', role: 'player', permissions: [] })); // /users/me retry

    const info = await authService.validateToken('old-tok');
    expect(info?.username).toBe('eve');
  });

  it('returns null on fetch error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fail'));
    const info = await authService.validateToken('bad-tok');
    expect(info).toBeNull();
  });
});

describe('authService getters / isAuthenticated', () => {
  it('isAuthenticated returns false initially', () => {
    expect(authService.isAuthenticated()).toBe(false);
  });

  it('getToken returns null initially', () => {
    expect(authService.getToken()).toBeNull();
  });

  it('getUserInfo returns null initially', () => {
    expect(authService.getUserInfo()).toBeNull();
  });
});

describe('authService.initialize', () => {
  it('returns false when no token found', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(401));
    const result = await authService.initialize();
    expect(result).toBe(false);
  });

  it('returns true when token extracted', async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse({ id: 5, username: 'frank', role: 'player', permissions: [] })
    );
    const result = await authService.initialize();
    expect(result).toBe(true);
  });
});

describe('authService.getUserSessions', () => {
  it('returns sessions array on success', async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse({ sessions: [{ session_code: 's1', session_name: 'Game Night', role: 'dm', created_at: '' }] })
    );
    const sessions = await authService.getUserSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].session_code).toBe('s1');
  });

  it('throws on non-200', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(500));
    await expect(authService.getUserSessions()).rejects.toThrow();
  });
});
