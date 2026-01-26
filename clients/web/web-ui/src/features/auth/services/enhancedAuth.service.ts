/**
 * Enhanced Authentication Service
 * Production-ready authentication with JWT refresh tokens, role-based access control,
 * OAuth integration, session management, and comprehensive security features
 */

import React from 'react';

export interface User {
  id: number;
  username: string;
  email?: string;
  fullName?: string;
  role: UserRole;
  permissions: Permission[];
  isEmailVerified: boolean;
  lastLogin?: string;
  createdAt: string;
  updatedAt: string;
  avatar?: string;
  preferences: UserPreferences;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  timezone: string;
  notifications: NotificationSettings;
}

export interface NotificationSettings {
  email: boolean;
  push: boolean;
  gameInvites: boolean;
  systemUpdates: boolean;
}

export type UserRole = 'admin' | 'gm' | 'player' | 'guest';

export type Permission = 
  | 'user.read'
  | 'user.write'
  | 'user.delete'
  | 'game.create'
  | 'game.read'
  | 'game.write'
  | 'game.delete'
  | 'game.manage'
  | 'character.create'
  | 'character.read'
  | 'character.write'
  | 'character.delete'
  | 'system.admin'
  | 'system.moderate';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType: 'Bearer';
}

export interface LoginCredentials {
  username: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterCredentials {
  username: string;
  email: string;
  password: string;
  fullName?: string;
  acceptTerms: boolean;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirm {
  token: string;
  newPassword: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface SessionInfo {
  id: string;
  userId: number;
  deviceInfo: DeviceInfo;
  location?: LocationInfo;
  createdAt: string;
  lastActivity: string;
  isCurrentSession: boolean;
}

export interface DeviceInfo {
  userAgent: string;
  browser: string;
  os: string;
  device: string;
  isMobile: boolean;
}

export interface LocationInfo {
  country: string;
  region: string;
  city: string;
  ip: string;
}

export interface OAuthProvider {
  id: string;
  name: string;
  icon: string;
  isEnabled: boolean;
}

export interface AuthError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  tokens: AuthTokens | null;
  lastError: AuthError | null;
}

/**
 * Password validation configuration
 */
interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  maxLength: number;
  preventCommonPasswords: boolean;
  preventPersonalInfo: boolean;
}

class EnhancedAuthService {
  private static instance: EnhancedAuthService;
  private authState: AuthState = {
    isAuthenticated: false,
    isLoading: true,
    user: null,
    tokens: null,
    lastError: null
  };
  
  private listeners: ((state: AuthState) => void)[] = [];
  private refreshTimer: number | null = null;
  private sessionCheckInterval: number | null = null;
  private rateLimitMap = new Map<string, { count: number; resetTime: number }>();
  
  // Security configuration
  private readonly REFRESH_BUFFER_TIME = 5 * 60 * 1000; // 5 minutes before expiry
  private readonly SESSION_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private readonly RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
  private readonly RATE_LIMIT_ATTEMPTS = 5;
  
  // Password policy configuration
  private readonly PASSWORD_POLICY: PasswordPolicy = {
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    preventCommonPasswords: true,
    preventPersonalInfo: true
  };

  private constructor() {
    this.initializeAuth();
    this.setupSecurityFeatures();
  }

  public static getInstance(): EnhancedAuthService {
    if (!EnhancedAuthService.instance) {
      EnhancedAuthService.instance = new EnhancedAuthService();
    }
    return EnhancedAuthService.instance;
  }

  /**
   * Initialize authentication on service startup
   */
  private async initializeAuth(): Promise<void> {
    try {
      this.updateAuthState({ isLoading: true });
      
      // Try to restore session from stored refresh token
      const refreshToken = this.getStoredRefreshToken();
      if (refreshToken) {
        await this.refreshAuthTokens();
      } else {
        // Check for authentication via HTTP-only cookies
        await this.validateCookieAuth();
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      this.updateAuthState({ 
        isLoading: false, 
        lastError: this.formatError(error) 
      });
    }
  }

  /**
   * Setup security features like automatic token refresh and session monitoring
   */
  private setupSecurityFeatures(): void {
    // Setup automatic token refresh
    this.scheduleTokenRefresh();
    
    // Setup session monitoring
    this.sessionCheckInterval = window.setInterval(() => {
      this.checkSessionValidity();
    }, this.SESSION_CHECK_INTERVAL) as unknown as number;
    
    // Listen for browser visibility changes to refresh tokens when tab becomes active
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.authState.isAuthenticated) {
        this.refreshAuthTokens().catch(console.error);
      }
    });
    
    // Listen for network status changes
    window.addEventListener('online', () => {
      if (this.authState.isAuthenticated) {
        this.refreshAuthTokens().catch(console.error);
      }
    });
  }

  /**
   * Authenticate user with username and password
   */
  public async login(credentials: LoginCredentials): Promise<{ success: boolean; error?: AuthError }> {
    try {
      // Check rate limiting
      if (!this.checkRateLimit('login', credentials.username)) {
        throw new Error('Too many login attempts. Please try again later.');
      }

      this.updateAuthState({ isLoading: true, lastError: null });

      const response = await this.makeAuthRequest('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Login failed');
      }

      const authData = await response.json();
      
      // Store tokens and user data
      this.setAuthTokens(authData.tokens);
      this.updateAuthState({
        isAuthenticated: true,
        isLoading: false,
        user: authData.user,
        tokens: authData.tokens,
        lastError: null
      });

      // Store refresh token if rememberMe is enabled
      if (credentials.rememberMe) {
        this.storeRefreshToken(authData.tokens.refreshToken);
      }

      // Schedule token refresh
      this.scheduleTokenRefresh();

      // Reset rate limiting on successful login
      this.rateLimitMap.delete(`login:${credentials.username}`);

      return { success: true };
    } catch (error) {
      const authError = this.formatError(error);
      this.updateAuthState({ 
        isLoading: false, 
        lastError: authError 
      });
      return { success: false, error: authError };
    }
  }

  /**
   * Register new user account
   */
  public async register(credentials: RegisterCredentials): Promise<{ success: boolean; error?: AuthError }> {
    try {
      // Validate password policy
      const passwordValidation = this.validatePassword(credentials.password, credentials);
      if (!passwordValidation.isValid) {
        throw new Error(passwordValidation.errors.join(', '));
      }

      this.updateAuthState({ isLoading: true, lastError: null });

      const response = await this.makeAuthRequest('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Registration failed');
      }

      this.updateAuthState({ isLoading: false });
      return { success: true };
    } catch (error) {
      const authError = this.formatError(error);
      this.updateAuthState({ 
        isLoading: false, 
        lastError: authError 
      });
      return { success: false, error: authError };
    }
  }

  /**
   * OAuth login with external provider
   */
  public async oauthLogin(provider: string): Promise<void> {
    const oauthUrl = `/auth/oauth/${provider}`;
    
    // Open OAuth popup window
    const popup = window.open(
      oauthUrl,
      `oauth_${provider}`,
      'width=500,height=600,scrollbars=yes,resizable=yes'
    );

    return new Promise((resolve, reject) => {
      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed);
          // Check if authentication was successful
          this.validateCookieAuth().then(success => {
            if (success) {
              resolve();
            } else {
              reject(new Error('OAuth authentication failed'));
            }
          });
        }
      }, 1000);

      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(checkClosed);
        popup?.close();
        reject(new Error('OAuth authentication timed out'));
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Logout user and cleanup session
   */
  public async logout(): Promise<void> {
    try {
      // Call server logout endpoint
      if (this.authState.tokens?.refreshToken) {
        await this.makeAuthRequest('/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            refreshToken: this.authState.tokens.refreshToken 
          })
        });
      }
    } catch (error) {
      console.warn('Logout request failed:', error);
    }

    this.clearAuthState();
  }

  /**
   * Request password reset email
   */
  public async requestPasswordReset(request: PasswordResetRequest): Promise<{ success: boolean; error?: AuthError }> {
    try {
      const response = await this.makeAuthRequest('/auth/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Password reset request failed');
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: this.formatError(error) };
    }
  }

  /**
   * Confirm password reset with token
   */
  public async confirmPasswordReset(request: PasswordResetConfirm): Promise<{ success: boolean; error?: AuthError }> {
    try {
      // Validate new password
      const passwordValidation = this.validatePassword(request.newPassword);
      if (!passwordValidation.isValid) {
        throw new Error(passwordValidation.errors.join(', '));
      }

      const response = await this.makeAuthRequest('/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Password reset confirmation failed');
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: this.formatError(error) };
    }
  }

  /**
   * Change user password
   */
  public async changePassword(request: ChangePasswordRequest): Promise<{ success: boolean; error?: AuthError }> {
    try {
      // Validate new password
      const passwordValidation = this.validatePassword(request.newPassword);
      if (!passwordValidation.isValid) {
        throw new Error(passwordValidation.errors.join(', '));
      }

      const response = await this.makeAuthRequest('/auth/password/change', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Password change failed');
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: this.formatError(error) };
    }
  }

  /**
   * Get user's active sessions
   */
  public async getSessions(): Promise<SessionInfo[]> {
    try {
      const response = await this.makeAuthRequest('/auth/sessions', {
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to fetch sessions');
      }

      return await response.json();
    } catch (error) {
      console.error('Get sessions error:', error);
      return [];
    }
  }

  /**
   * Revoke a specific session
   */
  public async revokeSession(sessionId: string): Promise<{ success: boolean; error?: AuthError }> {
    try {
      const response = await this.makeAuthRequest(`/auth/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Session revocation failed');
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: this.formatError(error) };
    }
  }

  /**
   * Get available OAuth providers
   */
  public async getOAuthProviders(): Promise<OAuthProvider[]> {
    try {
      const response = await this.makeAuthRequest('/auth/oauth/providers');
      
      if (!response.ok) {
        throw new Error('Failed to fetch OAuth providers');
      }

      return await response.json();
    } catch (error) {
      console.error('Get OAuth providers error:', error);
      return [];
    }
  }

  // Utility methods for authentication state management
  private async refreshAuthTokens(): Promise<boolean> {
    try {
      const refreshToken = this.authState.tokens?.refreshToken || this.getStoredRefreshToken();
      if (!refreshToken) {
        return false;
      }

      const response = await this.makeAuthRequest('/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Refresh token is invalid, clear auth state
          this.clearAuthState();
          return false;
        }
        throw new Error('Token refresh failed');
      }

      const authData = await response.json();
      this.setAuthTokens(authData.tokens);
      this.updateAuthState({
        isAuthenticated: true,
        isLoading: false,
        user: authData.user,
        tokens: authData.tokens,
        lastError: null
      });

      this.scheduleTokenRefresh();
      return true;
    } catch (error) {
      console.error('Token refresh error:', error);
      this.clearAuthState();
      return false;
    }
  }

  private async validateCookieAuth(): Promise<boolean> {
    try {
      const response = await this.makeAuthRequest('/auth/me', {
        credentials: 'include'
      });

      if (!response.ok) {
        return false;
      }

      const userData = await response.json();
      this.updateAuthState({
        isAuthenticated: true,
        isLoading: false,
        user: userData,
        tokens: null, // Using cookie-based auth
        lastError: null
      });

      return true;
    } catch (error) {
      console.error('Cookie auth validation error:', error);
      return false;
    }
  }

  private scheduleTokenRefresh(): void {
    if (this.refreshTimer) {
      window.clearTimeout(this.refreshTimer);
    }

    if (!this.authState.tokens) {
      return;
    }

    const timeUntilRefresh = this.authState.tokens.expiresAt - Date.now() - this.REFRESH_BUFFER_TIME;
    
    if (timeUntilRefresh > 0) {
      this.refreshTimer = window.setTimeout(() => {
        this.refreshAuthTokens().catch(console.error);
      }, timeUntilRefresh) as unknown as number;
    } else {
      // Token expires soon, refresh immediately
      this.refreshAuthTokens().catch(console.error);
    }
  }

  private async checkSessionValidity(): Promise<void> {
    if (!this.authState.isAuthenticated) {
      return;
    }

    try {
      const response = await this.makeAuthRequest('/auth/session/validate', {
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        // Session is invalid, logout user
        this.clearAuthState();
      }
    } catch (error) {
      console.error('Session validation error:', error);
    }
  }

  private checkRateLimit(action: string, identifier: string): boolean {
    const key = `${action}:${identifier}`;
    const now = Date.now();
    const limit = this.rateLimitMap.get(key);

    if (!limit) {
      this.rateLimitMap.set(key, { count: 1, resetTime: now + this.RATE_LIMIT_WINDOW });
      return true;
    }

    if (now > limit.resetTime) {
      // Reset the limit
      this.rateLimitMap.set(key, { count: 1, resetTime: now + this.RATE_LIMIT_WINDOW });
      return true;
    }

    if (limit.count >= this.RATE_LIMIT_ATTEMPTS) {
      return false;
    }

    limit.count++;
    return true;
  }

  private validatePassword(password: string, userData?: Partial<RegisterCredentials>): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const policy = this.PASSWORD_POLICY;

    if (password.length < policy.minLength) {
      errors.push(`Password must be at least ${policy.minLength} characters long`);
    }

    if (password.length > policy.maxLength) {
      errors.push(`Password must be no more than ${policy.maxLength} characters long`);
    }

    if (policy.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (policy.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (policy.requireNumbers && !/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (policy.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    if (policy.preventCommonPasswords && this.isCommonPassword(password)) {
      errors.push('This password is too common. Please choose a more unique password');
    }

    if (policy.preventPersonalInfo && userData) {
      const personalInfo = [userData.username, userData.email, userData.fullName].filter(Boolean);
      for (const info of personalInfo) {
        if (info && password.toLowerCase().includes(info.toLowerCase())) {
          errors.push('Password should not contain personal information');
          break;
        }
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  private isCommonPassword(password: string): boolean {
    // List of common passwords - in production, this should be a more comprehensive list
    const commonPasswords = [
      'password', '123456', '123456789', 'qwerty', 'abc123', 'password123',
      'admin', 'letmein', 'welcome', 'monkey', '1234567890', 'password1'
    ];
    
    return commonPasswords.includes(password.toLowerCase());
  }

  private setAuthTokens(tokens: AuthTokens): void {
    // Set authorization header for future requests
    if (tokens.accessToken) {
      localStorage.setItem('auth_access_token', tokens.accessToken);
    }
  }

  private getStoredRefreshToken(): string | null {
    return localStorage.getItem('auth_refresh_token');
  }

  private storeRefreshToken(refreshToken: string): void {
    localStorage.setItem('auth_refresh_token', refreshToken);
  }

  private clearAuthState(): void {
    // Clear timers
    if (this.refreshTimer) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    // Clear stored tokens
    localStorage.removeItem('auth_access_token');
    localStorage.removeItem('auth_refresh_token');

    // Update auth state
    this.updateAuthState({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      tokens: null,
      lastError: null
    });

    // Clear cookies
    document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Strict; Secure';
  }

  private updateAuthState(updates: Partial<AuthState>): void {
    this.authState = { ...this.authState, ...updates };
    this.notifyListeners();
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.authState);
      } catch (error) {
        console.error('Auth state listener error:', error);
      }
    });
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.authState.tokens?.accessToken) {
      headers.Authorization = `Bearer ${this.authState.tokens.accessToken}`;
    }

    return headers;
  }

  private async makeAuthRequest(url: string, options: RequestInit = {}): Promise<Response> {
    const defaultOptions: RequestInit = {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest' // CSRF protection
      }
    };

    const mergedOptions = {
      ...defaultOptions,
      ...options,
      headers: {
        ...defaultOptions.headers,
        ...options.headers
      }
    };

    return fetch(url, mergedOptions);
  }

  private formatError(error: any): AuthError {
    if (error instanceof Error) {
      return {
        code: 'AUTH_ERROR',
        message: error.message
      };
    }

    if (typeof error === 'string') {
      return {
        code: 'AUTH_ERROR',
        message: error
      };
    }

    return {
      code: 'UNKNOWN_ERROR',
      message: 'An unexpected error occurred'
    };
  }

  // Public getters and utility methods
  public getAuthState(): AuthState {
    return { ...this.authState };
  }

  public getCurrentUser(): User | null {
    return this.authState.user;
  }

  public isAuthenticated(): boolean {
    return this.authState.isAuthenticated;
  }

  public hasPermission(permission: Permission): boolean {
    return this.authState.user?.permissions.includes(permission) || false;
  }

  public hasRole(role: UserRole): boolean {
    return this.authState.user?.role === role;
  }

  public hasAnyRole(roles: UserRole[]): boolean {
    return roles.includes(this.authState.user?.role as UserRole);
  }

  public subscribe(listener: (state: AuthState) => void): () => void {
    this.listeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  public cleanup(): void {
    if (this.refreshTimer) {
      window.clearTimeout(this.refreshTimer);
    }
    
    if (this.sessionCheckInterval) {
      window.clearInterval(this.sessionCheckInterval);
    }
    
    this.listeners.length = 0;
  }
}

// Export singleton instance
export const enhancedAuthService = EnhancedAuthService.getInstance();

// Export utility functions for role and permission checking
export const withAuth = <T extends {}>(
  component: React.ComponentType<T>
): React.ComponentType<T> => {
  return (props: T) => {
    const authState = enhancedAuthService.getAuthState();
    
    if (!authState.isAuthenticated) {
      // Redirect to login or show auth required message
      return null;
    }
    
    return React.createElement(component, props);
  };
};

export const withRole = <T extends {}>(
  component: React.ComponentType<T>,
  requiredRole: UserRole
): React.ComponentType<T> => {
  return (props: T) => {
    const authState = enhancedAuthService.getAuthState();
    
    if (!authState.isAuthenticated || authState.user?.role !== requiredRole) {
      return null; // Or show access denied message
    }
    
    return React.createElement(component, props);
  };
};

export const withPermission = <T extends {}>(
  component: React.ComponentType<T>,
  requiredPermission: Permission
): React.ComponentType<T> => {
  return (props: T) => {
    const authState = enhancedAuthService.getAuthState();
    
    if (!authState.isAuthenticated || !authState.user?.permissions.includes(requiredPermission)) {
      return null; // Or show access denied message
    }
    
    return React.createElement(component, props);
  };
};