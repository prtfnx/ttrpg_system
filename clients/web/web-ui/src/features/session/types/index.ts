export * from './invitations';
export * from './roles';

/**
 * Legacy exports from original types
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