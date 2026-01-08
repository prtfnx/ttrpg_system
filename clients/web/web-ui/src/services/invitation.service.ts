import type { AcceptInvitationResponse, CreateInvitationRequest, SessionInvitation } from '../types/invitations';

class InvitationService {
  private baseURL = '/game/invitations';

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

  async createInvitation(data: CreateInvitationRequest): Promise<SessionInvitation> {
    return this.fetchAPI<SessionInvitation>('/create', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async getInvitation(inviteCode: string): Promise<SessionInvitation> {
    return this.fetchAPI<SessionInvitation>(`/${inviteCode}`);
  }

  async acceptInvitation(inviteCode: string): Promise<AcceptInvitationResponse> {
    return this.fetchAPI<AcceptInvitationResponse>(`/${inviteCode}/accept`, {
      method: 'POST'
    });
  }

  async listSessionInvitations(sessionCode: string): Promise<SessionInvitation[]> {
    return this.fetchAPI<SessionInvitation[]>(`/session/${sessionCode}`);
  }

  async revokeInvitation(invitationId: number): Promise<{ success: boolean; message: string }> {
    return this.fetchAPI<{ success: boolean; message: string }>(`/${invitationId}`, {
      method: 'DELETE'
    });
  }
}

export const invitationService = new InvitationService();
