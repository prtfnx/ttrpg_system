export interface SessionSettings {
  name: string;
  description: string | null;
  max_players: number;
  visibility: 'public' | 'private' | 'unlisted';
  join_policy: 'open' | 'invite_only' | 'closed';
  created_at: string;
  owner_username: string;
}

export interface SessionSettingsUpdate {
  name?: string;
  description?: string;
  max_players?: number;
  visibility?: 'public' | 'private' | 'unlisted';
  join_policy?: 'open' | 'invite_only' | 'closed';
}

export interface AuditLogEntry {
  id: number;
  event_type: string;
  user_id: number | null;
  username: string | null;
  target_user_id: number | null;
  target_username: string | null;
  details: Record<string, any> | null;
  ip_address: string | null;
  created_at: string;
}

export interface SessionStats {
  total_players: number;
  online_players: number;
  roles_distribution: Record<string, number>;
  total_sessions_duration: number | null;
  last_activity: string | null;
}

export interface BulkRoleChange {
  user_ids: number[];
  new_role: string;
}
