import React, { createContext, useContext, useEffect, useState } from 'react';
import { authService, type UserInfo } from '../services/auth.service';

type Permission = string;

interface AuthContextType {
  user: UserInfo | null;
  isAuthenticated: boolean;
  permissions: Permission[];
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  loading: boolean;
  error: string;
  hasPermission: (permission: string) => boolean;
  requireAuth: <T>(operation: () => T) => T;
  updateUser: (userData: Partial<UserInfo>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Derive permissions from user data
  const permissions: Permission[] = user?.permissions || [];

  // Check if user has a specific permission
  const hasPermission = (permission: string): boolean => {
    if (!isAuthenticated || !user) return false;
    return permissions.includes(permission);
  };

  // Require authentication for an operation
  const requireAuth = <T,>(operation: () => T): T => {
    if (!isAuthenticated) {
      throw new Error('Authentication required for this operation');
    }
    return operation();
  };

  // Update user data
  const updateUser = (userData: Partial<UserInfo>) => {
    if (user) {
      const updatedUser = { ...user, ...userData };
      setUser(updatedUser);
      // Note: authService.updateUserInfo would need to be implemented if needed
    }
  };

  useEffect(() => {
    authService.initialize().then(() => {
      setUser(authService.getUserInfo());
      setIsAuthenticated(authService.isAuthenticated());
      setLoading(false);
    });
  }, []);

  const login = async (username: string, password: string) => {
    setLoading(true);
    setError('');
    try {
      const result = await authService.login(username, password);
      if (result.success) {
        setUser(authService.getUserInfo());
        setIsAuthenticated(authService.isAuthenticated());
        setLoading(false);
        return true;
      } else {
        setError(result.message || 'Login failed');
        setLoading(false);
        return false;
      }
    } catch (e: any) {
      setError(e.message || 'Login failed');
      setLoading(false);
      setIsAuthenticated(false);
      return false;
    }
  };

  const logout = () => {
    authService.logout();
    setUser(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      permissions,
      login, 
      logout, 
      loading, 
      error,
      hasPermission,
      requireAuth,
      updateUser
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
