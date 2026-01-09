import type { ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { vi } from 'vitest';

// Mock user for tests
export const mockUser = {
  id: 1,
  username: 'testuser',
  email: 'test@example.com',
  is_admin: false,
};

// Mock AuthContext
vi.mock('../components/AuthContext', async () => {
  const actual = await vi.importActual('../components/AuthContext');
  return {
    ...actual,
    useAuth: vi.fn(() => ({
      user: mockUser,
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
      isAuthenticated: true,
      loading: false,
    })),
  };
});

// Custom render with providers
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  user?: typeof mockUser;
}

export function renderWithProviders(
  ui: ReactElement,
  options?: CustomRenderOptions
) {
  return render(ui, { ...options });
}

export * from '@testing-library/react';
export { renderWithProviders as render };
