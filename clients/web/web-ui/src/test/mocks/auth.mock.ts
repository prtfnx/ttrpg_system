import { vi } from 'vitest';

export const createAuthMock = () => ({
  authService: {
    initialize: vi.fn(() => Promise.resolve()),
    getUserInfo: vi.fn(() => ({
      id: 'test-user-1',
      username: 'testuser',
      email: 'test@example.com',
      permissions: ['compendium:read', 'compendium:write', 'table:admin', 'character:write']
    })),
    isAuthenticated: vi.fn(() => true),
    updateUserInfo: vi.fn(),
    extractToken: vi.fn(() => Promise.resolve('test-token')),
    getUserSessions: vi.fn(() => Promise.resolve([])),
    logout: vi.fn(() => Promise.resolve())
  },
  AuthProvider: ({ children }: any) => <div>{children}</div>,
  useAuth: () => ({
    user: {
      id: 'test-user-1',
      username: 'testuser',
      email: 'test@example.com',
      permissions: ['compendium:read', 'compendium:write', 'table:admin', 'character:write']
    },
    isAuthenticated: true,
    permissions: ['compendium:read', 'compendium:write', 'table:admin', 'character:write'],
    login: vi.fn(() => Promise.resolve(true)),
    logout: vi.fn(),
    loading: false,
    error: '',
    hasPermission: vi.fn(() => true),
    requireAuth: vi.fn((operation: any) => operation()),
    updateUser: vi.fn()
  })
});
