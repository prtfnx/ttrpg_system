/**
 * Tests for useSessionPermissions hook
 */
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as sessionManagementService from '../../services/sessionManagement.service';
import { useSessionPermissions } from '../useSessionPermissions';

vi.mock('../../services/sessionManagement.service');

describe('useSessionPermissions', () => {
  const mockPermissions = {
    role: 'player',
    role_permissions: ['modify_own_tokens', 'roll_dice_public'],
    custom_permissions: [],
    all_permissions: ['modify_own_tokens', 'roll_dice_public']
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches permissions on mount', async () => {
    (sessionManagementService.getPlayerPermissions as any)
      .mockResolvedValue(mockPermissions);

    const { result } = renderHook(() => 
      useSessionPermissions('TEST123', 1)
    );

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.permissions).toEqual(mockPermissions);
  });

  it('hasPermission returns true for granted permissions', async () => {
    (sessionManagementService.getPlayerPermissions as any)
      .mockResolvedValue(mockPermissions);

    const { result } = renderHook(() => 
      useSessionPermissions('TEST123', 1)
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.hasPermission('modify_own_tokens')).toBe(true);
    expect(result.current.hasPermission('delete_tokens')).toBe(false);
  });

  it('handles fetch errors gracefully', async () => {
    (sessionManagementService.getPlayerPermissions as any)
      .mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => 
      useSessionPermissions('TEST123', 1)
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.permissions).toBeNull();
    expect(result.current.hasPermission('any_permission')).toBe(false);
  });
});
