import { describe, expect, it } from 'vitest';
import type { RoleChangeData } from '../roleManagement.service';
import { roleManagementService } from '../roleManagement.service';

describe('roleManagementService', () => {
  it('updatePlayerRole resolves without error', async () => {
    const data: RoleChangeData = { playerId: 'p1', newRole: 'player', sessionId: 's1' };
    await expect(roleManagementService.updatePlayerRole(data)).resolves.toBeUndefined();
  });

  it('updatePlayerRole accepts all role types', async () => {
    const roles: RoleChangeData['newRole'][] = ['owner', 'co_dm', 'trusted_player', 'player', 'spectator'];
    for (const role of roles) {
      await expect(roleManagementService.updatePlayerRole({ playerId: 'p1', newRole: role, sessionId: 's1' })).resolves.toBeUndefined();
    }
  });

  it('removePlayer resolves without error', async () => {
    await expect(roleManagementService.removePlayer('s1', 'p1')).resolves.toBeUndefined();
  });

  it('getSessionPlayers returns empty array', async () => {
    const result = await roleManagementService.getSessionPlayers('s1');
    expect(result).toEqual([]);
  });
});
