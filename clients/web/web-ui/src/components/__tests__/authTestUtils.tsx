import React from 'react';
import { vi } from 'vitest';
import type { UserInfo } from '../../services/auth.service';

interface MockAuthContextValue {
  user: UserInfo | null;
  isAuthenticated: boolean;
  permissions: string[];
  login: any;
  logout: any;
  loading: boolean;
  error: string;
  hasPermission: any;
  requireAuth: any;
  updateUser: any;
}

interface CreateAuthTestWrapperOptions {
  user?: Partial<UserInfo> | null;
  isAuthenticated?: boolean;
  loading?: boolean;
  error?: string;
}

export const createAuthTestWrapper = (options: CreateAuthTestWrapperOptions = {}) => {
  const mockUser: UserInfo | null = options.user ? {
    id: 1,
    username: 'testuser',
    role: 'player',
    permissions: ['chat.send', 'chat.receive', 'compendium.read'],
    ...options.user
  } : null;

  const mockAuthValue: MockAuthContextValue = {
    user: mockUser,
    isAuthenticated: options.isAuthenticated ?? !!mockUser,
    permissions: mockUser?.permissions || [],
    login: vi.fn(),
    logout: vi.fn(),
    loading: options.loading ?? false,
    error: options.error ?? '',
    hasPermission: vi.fn((permission: string) => 
      mockUser?.permissions?.includes(permission) ?? false
    ),
    requireAuth: vi.fn((operation: () => any) => {
      if (!mockUser) {
        throw new Error('Authentication required for this operation');
      }
      return operation();
    }),
    updateUser: vi.fn()
  };

  // Create wrapper component
  const AuthTestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Mock the AuthContext.Provider value
    const AuthContextMock = React.createContext(mockAuthValue);
    
    return (
      <AuthContextMock.Provider value={mockAuthValue}>
        {children}
      </AuthContextMock.Provider>
    );
  };

  return {
    AuthWrapper: AuthTestWrapper,
    mockAuthValue
  };
};

// Predefined wrapper for authenticated user
export const createAuthenticatedWrapper = (userOverrides: Partial<UserInfo> = {}) => {
  return createAuthTestWrapper({
    user: {
      id: 1,
      username: 'authenticateduser',
      role: 'player',
      permissions: [
        'chat.send',
        'chat.receive',
        'compendium.read',
        'compendium.write',
        'layer.toggle',
        'paint.use',
        'fog.modify'
      ],
      ...userOverrides
    },
    isAuthenticated: true
  });
};

// Predefined wrapper for unauthenticated user
export const createUnauthenticatedWrapper = () => {
  return createAuthTestWrapper({
    user: null,
    isAuthenticated: false
  });
};

// Predefined wrapper for loading state
export const createLoadingAuthWrapper = () => {
  return createAuthTestWrapper({
    user: null,
    isAuthenticated: false,
    loading: true
  });
};

// Predefined wrapper for error state
export const createErrorAuthWrapper = (error: string = 'Authentication failed') => {
  return createAuthTestWrapper({
    user: null,
    isAuthenticated: false,
    error
  });
};

// Higher-order component for wrapping tests with auth
export const withAuthProvider = <P extends object>(
  Component: React.ComponentType<P>,
  authOptions: CreateAuthTestWrapperOptions = {}
) => {
  const { AuthWrapper } = createAuthTestWrapper(authOptions);
  
  return (props: P) => (
    <AuthWrapper>
      <Component {...props} />
    </AuthWrapper>
  );
};

// Permission-specific test wrappers
export const createUserWithPermissions = (permissions: string[]) => {
  return createAuthTestWrapper({
    user: {
      id: 2,
      username: 'permissionuser',
      role: 'player',
      permissions
    },
    isAuthenticated: true
  });
};

export const createAdminWrapper = () => {
  return createUserWithPermissions([
    'admin.all',
    'chat.send',
    'chat.receive',
    'chat.moderate',
    'compendium.read',
    'compendium.write',
    'compendium.admin',
    'layer.toggle',
    'layer.admin',
    'paint.use',
    'paint.admin',
    'fog.modify',
    'fog.admin',
    'lighting.modify',
    'lighting.admin'
  ]);
};

export const createDMWrapper = () => {
  return createUserWithPermissions([
    'dm.all',
    'chat.send',
    'chat.receive',
    'compendium.read',
    'layer.toggle',
    'paint.use',
    'fog.modify',
    'lighting.modify'
  ]);
};

export const createPlayerWrapper = () => {
  return createUserWithPermissions([
    'player.basic',
    'chat.send',
    'chat.receive',
    'compendium.read'
  ]);
};