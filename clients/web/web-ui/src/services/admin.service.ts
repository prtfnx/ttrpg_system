import type {
    AuditLogEntry,
    BulkRoleChange,
    SessionSettings,
    SessionSettingsUpdate,
    SessionStats
} from '../types/admin';

class AdminService {
  private baseURL = '/game/session';

  private async fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(endpoint, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Request failed' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async getSettings(sessionCode: string): Promise<SessionSettings> {
    return this.fetchAPI(`${this.baseURL}/${sessionCode}/admin/settings`);
  }

  async updateSettings(
    sessionCode: string, 
    settings: SessionSettingsUpdate
  ): Promise<{ success: boolean; message: string }> {
    return this.fetchAPI(`${this.baseURL}/${sessionCode}/admin/settings`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  async bulkChangeRoles(
    sessionCode: string,
    change: BulkRoleChange
  ): Promise<{ success: boolean; updated: number; failed: number[]; message: string }> {
    return this.fetchAPI(`${this.baseURL}/${sessionCode}/admin/players/bulk-role`, {
      method: 'POST',
      body: JSON.stringify(change),
    });
  }

  async getAuditLog(
    sessionCode: string,
    eventType?: string,
    limit = 100,
    offset = 0
  ): Promise<AuditLogEntry[]> {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (eventType) params.append('event_type', eventType);
    
    return this.fetchAPI(`${this.baseURL}/${sessionCode}/admin/audit-log?${params}`);
  }

  async getStats(sessionCode: string): Promise<SessionStats> {
    return this.fetchAPI(`${this.baseURL}/${sessionCode}/admin/stats`);
  }

  async deleteSession(
    sessionCode: string,
    confirmationName: string
  ): Promise<{ success: boolean; message: string }> {
    return this.fetchAPI(`${this.baseURL}/${sessionCode}/admin/delete-session?confirmation_name=${encodeURIComponent(confirmationName)}`, {
      method: 'DELETE',
    });
  }
}

export const adminService = new AdminService();
