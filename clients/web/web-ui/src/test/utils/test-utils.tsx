import { AuthContext, type UserInfo } from '@features/auth';
import { render, type RenderOptions } from '@testing-library/react';
import React from 'react';
import { vi } from 'vitest';

/**
 * Mock auth context value for tests
 */
const mockAuthContextValue = {
  user: {
    id: 1,
    username: 'testuser',
    isAuthenticated: true,
    role: 'dm' as const,
    permissions: ['view_session', 'edit_session', 'manage_characters'],
  } as UserInfo,
  token: 'mock-token-12345',
  isAuthenticated: true,
  isLoading: false,
  permissions: ['view_session', 'edit_session', 'manage_characters'],
  loading: false,
  error: '',
  login: vi.fn().mockResolvedValue(true),
  logout: vi.fn(),
  validateSession: vi.fn().mockResolvedValue(true),
  refreshToken: vi.fn().mockResolvedValue('new-mock-token'),
  hasPermission: vi.fn((permission: string) => ['view_session', 'edit_session', 'manage_characters'].includes(permission)),
  requireAuth: vi.fn((operation: () => any) => operation()),
  updateUser: vi.fn(),
};

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  /**
   * Optional auth context value override
   */
  authValue?: Partial<typeof mockAuthContextValue>;
}

/**
 * Custom render function that wraps components with necessary providers
 * @param ui - The component to render
 * @param options - Render options including optional auth value override
 * @returns Testing library render result
 * 
 * @example
 * ```tsx
 * renderWithProviders(<MyComponent />, {
 *   authValue: { isAuthenticated: false }
 * });
 * ```
 */
export function renderWithProviders(
  ui: React.ReactElement,
  options: CustomRenderOptions = {}
) {
  const { authValue, ...renderOptions } = options;

  const finalAuthValue = authValue
    ? { ...mockAuthContextValue, ...authValue }
    : mockAuthContextValue;

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <AuthContext.Provider value={finalAuthValue}>
        {children}
      </AuthContext.Provider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

/**
 * Re-export everything from testing library for convenience
 */
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';

