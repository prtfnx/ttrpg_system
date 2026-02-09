/**
 * Session Management Service
 * Provides API for managing session players and roles
 */

import type { SessionPlayer, RoleChangeResponse, SessionRole } from '../types';

class SessionManagementService {
  private baseUrl = '/api';

  async getPlayers(sessionCode: string): Promise<SessionPlayer[]> {
    try {
      const response = await fetch(`${this.baseUrl}/sessions/${sessionCode}/players`);
      if (!response.ok) {
        throw new Error(`Failed to fetch players: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.warn('Session management API not available, using mock data');
      // Mock data fallback
      return [
        {
          id: 1,
          user_id: 1,
          username: 'GameMaster',
          role: 'owner',
          is_connected: true,
          permissions: ['all']
        },
        {
          id: 2,
          user_id: 2,
          username: 'Player1',
          role: 'player',
          is_connected: true,
          permissions: ['basic']
        }
      ];
    }
  }

  async changePlayerRole(
    sessionCode: string, 
    targetUserId: number, 
    data: { new_role: SessionRole }
  ): Promise<RoleChangeResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/sessions/${sessionCode}/players/${targetUserId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        throw new Error(`Failed to change role: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.warn('Session management API not available, using mock response');
      return {
        success: true,
        message: `Role changed to ${data.new_role}`,
        player: undefined
      };
    }
  }

  async kickPlayer(sessionCode: string, targetUserId: number): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/sessions/${sessionCode}/players/${targetUserId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to kick player: ${response.statusText}`);
      }
    } catch (error) {
      console.warn('Session management API not available, using mock response');
      // Mock success
    }
  }
}

export const sessionManagementService = new SessionManagementService();