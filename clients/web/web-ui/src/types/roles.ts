export type SessionRole = 'owner' | 'co_dm' | 'trusted_player' | 'player' | 'spectator';

export interface SessionPlayer {
  id: number;
  user_id: number;
  username: string;
  character_name?: string;
  role: SessionRole;
  is_connected: boolean;
  joined_at: string;
  permissions: string[];
}

export interface RoleChangeRequest {
  new_role: SessionRole;
}

export interface RoleChangeResponse {
  success: boolean;
  old_role: SessionRole;
  new_role: SessionRole;
  permissions_gained: string[];
  permissions_lost: string[];
}

export interface PlayerPermissions {
  role: SessionRole;
  role_permissions: string[];
  custom_permissions: string[];
  all_permissions: string[];
}
