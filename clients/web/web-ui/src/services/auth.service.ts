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
   * Fallback to URL parameter for direct session links
   */
  async extractToken(): Promise<string | null> {
    // Try cookie first (set by /users/login)
    const cookieToken = this.extractTokenFromCookie();
    if (cookieToken) {
      this.token = cookieToken;
      return cookieToken;
    }

    // Try URL parameter (for direct session links)
    const urlToken = this.extractTokenFromURL();
    if (urlToken) {
      this.token = urlToken;
      return urlToken;
    }

    return null;
  }

  private extractTokenFromCookie(): string | null {
    // Read from document.cookie since it's HTTP-only
    const cookies = document.cookie.split(';');
    const tokenCookie = cookies.find(c => c.trim().startsWith('token='));
    return tokenCookie ? tokenCookie.split('=')[1] : null;
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
      const response = await fetch('http://127.0.0.1:12345/users/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
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
   * Get user's available sessions
   */
  async getUserSessions(): Promise<SessionInfo[]> {
    if (!this.token) throw new Error('Not authenticated');

    try {
      const response = await fetch('http://127.0.0.1:12345/users/dashboard', {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
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
    window.location.href = 'http://127.0.0.1:12345/users/logout';
  }

  /**
   * Initialize authentication from existing token
   */
  async initialize(): Promise<boolean> {
    const token = await this.extractToken();
    if (!token) {
      return false;
    }

    const userInfo = await this.validateToken(token);
    return userInfo !== null;
  }
}

export const authService = new AuthService();
