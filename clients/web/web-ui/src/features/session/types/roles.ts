/**
 * Role and Session Management Types
 * Used throughout the session feature
 */

export type SessionRole = 
  | 'owner'
  | 'co_dm' 
  | 'trusted_player'
  | 'player'
  | 'spectator';

export interface SessionPlayer {
  id: number;
  user_id: number;
  username: string;
  role: SessionRole;
  is_connected: boolean;
  permissions: string[];
}

export interface RoleChangeRequest {
  new_role: SessionRole;
}

export interface RoleChangeResponse {
  success: boolean;
  message: string;
  new_role?: SessionRole;
  player?: SessionPlayer;
}

export interface PlayerPermissions {
  can_change_roles: boolean;
  can_kick_players: boolean;
  can_manage_invitations: boolean;
  custom_permissions: string[];
}