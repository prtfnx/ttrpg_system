import type { PlayerPermissions, RoleChangeRequest, RoleChangeResponse, SessionPlayer } from '../types/roles';

class SessionManagementService {
  private baseURL = '/game/session';

  private async fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options?.headers
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || response.statusText);
    }

    return response.json();
  }

  async getPlayers(sessionCode: string): Promise<SessionPlayer[]> {
    return this.fetchAPI<SessionPlayer[]>(`/${sessionCode}/players`);
  }

  async changePlayerRole(
    sessionCode: string,
    targetUserId: number,
    roleRequest: RoleChangeRequest
  ): Promise<RoleChangeResponse> {
    return this.fetchAPI<RoleChangeResponse>(
      `/${sessionCode}/players/${targetUserId}/role`,
      {
        method: 'POST',
        body: JSON.stringify(roleRequest)
      }
    );
  }

  async kickPlayer(sessionCode: string, targetUserId: number): Promise<{ success: boolean; message: string }> {
    return this.fetchAPI<{ success: boolean; message: string }>(
      `/${sessionCode}/players/${targetUserId}`,
      { method: 'DELETE' }
    );
  }

  async getPlayerPermissions(sessionCode: string, userId: number): Promise<PlayerPermissions> {
    return this.fetchAPI<PlayerPermissions>(`/${sessionCode}/players/${userId}/permissions`);
  }

  async grantCustomPermission(
    sessionCode: string,
    targetUserId: number,
    permission: string
  ): Promise<{ success: boolean; message: string }> {
    return this.fetchAPI<{ success: boolean; message: string }>(
      `/${sessionCode}/players/${targetUserId}/permissions`,
      {
        method: 'POST',
        body: JSON.stringify({ permission })
      }
    );
  }
}

export const sessionManagementService = new SessionManagementService();
