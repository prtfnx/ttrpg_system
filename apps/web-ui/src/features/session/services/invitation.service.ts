import type { AcceptInvitationResponse, CreateInvitationRequest, SessionInvitation } from '../types/invitations';
import { logger } from '@shared/utils/logger';

class InvitationService {
  private baseURL = '/api/invitations';

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
    logger.debug('Creating invitation', {
      request: data,
      url: `${this.baseURL}/create`,
    });

    const result = await this.fetchAPI<SessionInvitation>('/create', {
      method: 'POST',
      body: JSON.stringify(data)
    });

    logger.debug('Invitation created', result);
    return result;
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

  async getInvitations(sessionCode: string): Promise<SessionInvitation[]> {
    return this.listSessionInvitations(sessionCode);
  }

  async revokeInvitation(invitationId: number): Promise<{ success: boolean; message: string }> {
    return this.fetchAPI<{ success: boolean; message: string }>(`/${invitationId}`, {
      method: 'DELETE'
    });
  }
}

export const invitationService = new InvitationService();
