/**
 * Authentication service for JWT token management and user info
 * Integrates with FastAPI server authentication system
 */

export interface UserInfo {
  id: number;
  username: string;
  role: 'dm' | 'player';
  permissions: string[];
}

export interface SessionInfo {
  session_code: string;
  session_name: string;
  role: 'dm' | 'player';
  created_at: string;
}

class AuthService {
  private token: string | null = null;
  private userInfo: UserInfo | null = null;

  /**
   * Extract JWT token from HTTP-only cookie set by FastAPI
   * Note: HTTP-only cookies cannot be read by JavaScript for security
   * Instead, we rely on server-side validation of the cookie
   */
  async extractToken(): Promise<string | null> {
    // For HTTP-only cookies, we can't read them directly
    // Instead, we validate authentication by making a request to /users/me
    console.log('🔍 Attempting to extract token via /users/me...');
    
    try {
      console.log('📡 Making request to /users/me with credentials...');
      const response = await fetch('/users/me', {
        credentials: 'include', // Include HTTP-only cookies
        headers: {
          'Accept': 'application/json',
        }
      });

      console.log(`📈 Response status: ${response.status} ${response.statusText}`);
      console.log('📋 Response headers:', Object.fromEntries(response.headers.entries()));

      if (response.ok) {
        console.log('✅ Response OK, parsing user data...');
        const userData = await response.json();
        console.log('👤 User data received:', userData);
        
        this.userInfo = {
          id: userData.id,
          username: userData.username,
          role: userData.role || 'player', // Use role from server response
          permissions: userData.permissions || []
        };
        // We don't have the actual token, but we know authentication works
        this.token = 'authenticated-via-cookie';
        console.log('✅ Token extracted successfully via cookie');
        return this.token;
      } else if (response.status === 401) {
        // User is not authenticated - this is expected, not an error
        console.log('🔐 User not authenticated (401), this is expected for unauthenticated users');
        return null;
      } else {
        console.error('❌ Unexpected response from /users/me:', response.status, response.statusText);
        return null;
      }
    } catch (error) {
      console.error('💥 Failed to validate authentication:', error);
      return null;
    }

    // Try URL parameter as fallback (for direct session links with token)
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
    try {
      const response = await fetch('/users/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (response.ok) {
        const userData = await response.json();
        this.userInfo = {
          id: userData.id,
          username: userData.username,
          role: userData.role || 'player',
          permissions: userData.permissions || []
        };
        return this.userInfo;
      }
    } catch (error) {
      console.error('Token validation failed:', error);
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
}

export const authService = new AuthService();
