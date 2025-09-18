import React, { createContext, useContext, useEffect, useState } from 'react';
import { authService, type UserInfo } from '../services/auth.service';

interface AuthContextType {
  user: UserInfo | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  loading: boolean;
  error: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      // Call FastAPI login endpoint
      const response = await fetch('/users/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          username,
          password
        }),
        credentials: 'include'
      });

      if (response.ok) {
        // Re-initialize auth service to get user info from cookie
        await authService.initialize();
        setUser(authService.getUserInfo());
        setIsAuthenticated(authService.isAuthenticated());
        setLoading(false);
        return true;
      } else {
        const errorText = await response.text();
        // Parse HTML error or use generic message
        const errorMatch = errorText.match(/error["']: ["']([^"']+)["']/i);
        const errorMessage = errorMatch ? errorMatch[1] : 'Login failed';
        setError(errorMessage);
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
    <AuthContext.Provider value={{ user, isAuthenticated, login, logout, loading, error }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
