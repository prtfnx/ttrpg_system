/**
 * Session Management Service
 * Provides API for managing session players and roles
 */

import type { RoleChangeResponse, SessionPlayer, SessionRole } from '../types';

class SessionManagementService {
  private baseUrl = '/game/api';

  async getPlayers(sessionCode: string): Promise<SessionPlayer[]> {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionCode}/players`, {
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch players: ${response.statusText}`);
    }
    
    return await response.json();
  }

  async changePlayerRole(
    sessionCode: string, 
    targetUserId: number, 
    data: { new_role: SessionRole }
  ): Promise<RoleChangeResponse> {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionCode}/players/${targetUserId}/role`, {
      method: 'POST',
      credentials: 'include',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      throw new Error(`Failed to change role: ${response.statusText}`);
    }
    
    return await response.json();
  }

  async kickPlayer(sessionCode: string, targetUserId: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionCode}/players/${targetUserId}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`Failed to kick player: ${response.statusText}`);
    }
  }
}

export const sessionManagementService = new SessionManagementService();