/**
 * Authentication service for JWT token management and user info
 * Integrates with FastAPI server authentication system
 */

export interface UserInfo {
  id: number;
  username: string;
  tier: 'free' | 'premium';
  is_admin: boolean;
  permissions: string[];
}

export interface SessionInfo {
  session_code: string;
  session_name: string;
  role: 'owner' | 'co_dm' | 'trusted_player' | 'player' | 'spectator';  // Actual role from server
  created_at: string;
}

class AuthService {
  private token: string | null = null;
  private userInfo: UserInfo | null = null;
  private lastRequestTime: number = 0;
  private requestCount: number = 0;
  private static RATE_LIMIT = 10; // max 10 requests per 10 seconds
  private static RATE_LIMIT_WINDOW = 10000; // 10 seconds

  /**
   * Login user with username and password
   */
  async login(username: string, password: string): Promise<{ success: boolean; message?: string }> {
    try {
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
        // Re-initialize to get user info from cookie
        await this.initialize();
        return { success: true };
      } else {
        const errorText = await response.text();
        // Try to extract error message from HTML response
        const errorMatch = errorText.match(/error[\"']: [\"']([^\"']+)[\"']/i);
        const errorMessage = errorMatch ? errorMatch[1] : 'Login failed';
        return { success: false, message: errorMessage };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, message: 'Network error occurred' };
    }
  }

  /**
   * Register a new user
   */
  async register(username: string, password: string): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await fetch('/users/register', {
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
        return { success: true, message: 'Registration successful. Please log in.' };
      } else {
        const errorText = await response.text();
        const errorMatch = errorText.match(/error[\"']: [\"']([^\"']+)[\"']/i);
        const errorMessage = errorMatch ? errorMatch[1] : 'Registration failed';
        return { success: false, message: errorMessage };
      }
    } catch (error) {
      console.error('Registration error:', error);
      return { success: false, message: 'Network error occurred' };
    }
  }

  /**
   * Extract JWT token from HTTP-only cookie set by FastAPI
   * Note: HTTP-only cookies cannot be read by JavaScript for security
   * Instead, we rely on server-side validation of the cookie
   */
  async extractToken(): Promise<string | null> {
    // Rate limiting - skip in test environment
    if (!((globalThis as any).__VITEST__ || import.meta.env?.MODE === 'test')) {
      const now = Date.now();
      if (now - this.lastRequestTime > AuthService.RATE_LIMIT_WINDOW) {
        this.requestCount = 0;
        this.lastRequestTime = now;
      }
      this.requestCount++;
      if (this.requestCount > AuthService.RATE_LIMIT) {
        throw new Error('Rate limit exceeded. Please wait before retrying.');
      }
    }
    // For HTTP-only cookies, we can't read them directly
    // Instead, we validate authentication by making a request to /users/me
    try {
      const response = await fetch('/users/me', {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
      if (response.ok) {
        const userData = await response.json();
        this.userInfo = {
          id: userData.id,
          username: userData.username,
          tier: userData.tier || 'free',
          is_admin: userData.is_admin || false,
          permissions: userData.permissions || []
        };
        this.token = 'authenticated-via-cookie';
        return this.token;
      } else if (response.status === 401) {
        return null;
      } else {
        return null;
      }
    } catch (error) {
      return null;
    }
    const urlToken = this.extractTokenFromURL();
    if (urlToken) {
      this.token = urlToken;
      return urlToken;
    }
    return null;
  }

  private extractTokenFromURL(): string | null {
    const params = new URLSearchParams(window.location.search);
    return params.get('token');
  }

  /**
   * Validate token with server and extract user info
   */
  async validateToken(token: string): Promise<UserInfo | null> {
    // Token refresh logic
    try {
      let response = await fetch('/users/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });
      if (response.status === 401) {
        // Try to refresh token
        const refreshResponse = await fetch('/users/refresh', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' }
        });
        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json();
          this.token = refreshData.token;
          response = await fetch('/users/me', {
            headers: {
              'Authorization': `Bearer ${this.token}`,
              'Content-Type': 'application/json'
            },
            credentials: 'include'
          });
        }
      }
      if (response.ok) {
        const userData = await response.json();
        this.userInfo = {
          id: userData.id,
          username: userData.username,
          tier: userData.tier || 'free',
          is_admin: userData.is_admin || false,
          permissions: userData.permissions || []
        };
        return this.userInfo;
      }
    } catch (error) {
      return null;
    }
    return null;
  }

  /**
   * Get user's available sessions using cookie-based authentication
   */
  async getUserSessions(): Promise<SessionInfo[]> {
    try {
      const response = await fetch('/users/dashboard', {
        credentials: 'include', // Include HTTP-only cookies
        headers: {
          'Accept': 'application/json',
        }
      });

      if (response.ok) {
        const data = await response.json();
        return data.sessions || [];
      }
      throw new Error(`Failed to fetch sessions: ${response.statusText}`);
    } catch (error) {
      console.error('Failed to fetch user sessions:', error);
      throw error;
    }
  }

  getToken(): string | null { 
    return this.token; 
  }

  getUserInfo(): UserInfo | null { 
    return this.userInfo; 
  }

  isAuthenticated(): boolean { 
    return this.token !== null && this.userInfo !== null; 
  }

  /**
   * Clear authentication state and redirect to login
   */
  logout(): void {
    this.token = null;
    this.userInfo = null;
    // Clear cookie by setting it to expire
    document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    window.location.href = '/users/logout';
  }

  /**
   * Initialize authentication from existing token
   */
  async initialize(): Promise<boolean> {
    console.log('🔍 Starting authentication initialization...');
    const token = await this.extractToken();
    
    if (!token) {
      console.log('❌ No token found, authentication failed');
      return false;
    }

    console.log('✅ Token found and user info already extracted');
    console.log('👤 Current user info:', this.userInfo);
    return true;
  }

  // Legacy functions removed:
  // - getRole() - unused, role comes from getUserSessions()
  // - updateRole() - replaced by SessionManagementService.changePlayerRole()
  // New role management API: /game/session/{code}/players/{id}/role
}

export const authService = new AuthService();
