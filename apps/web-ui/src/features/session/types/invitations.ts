export interface SessionInvitation {
  id: number;
  invite_code: string;
  session_code: string;
  pre_assigned_role: string;
  created_at: string;
  expires_at?: string;
  max_uses: number;
  uses_count: number;
  is_active: boolean;
  is_valid: boolean;
  invite_url: string;
}

export interface CreateInvitationRequest {
  session_code: string;
  pre_assigned_role: string;
  expires_hours?: number;
  max_uses: number;
}

export interface AcceptInvitationResponse {
  success: boolean;
  session_code: string;
  role: string;
}