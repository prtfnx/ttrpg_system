/**
 * Role utility behaviour tests
 *
 * Tests what each role can and cannot do — not the internal implementation.
 * Mirrors server_host/utils/roles.py to ensure client and server agree.
 */
import { describe, expect, it } from 'vitest';
import {
    DM_ROLES,
    ELEVATED_ROLES,
    INTERACTIVE_ROLES,
    canInteract,
    isDM,
    isElevated,
    isSpectator,
    type SessionRole,
} from '../roles';

describe('Role system — who is a DM', () => {
  it('recognises owner as DM', () => {
    expect(isDM('owner')).toBe(true);
  });

  it('recognises co_dm as DM', () => {
    expect(isDM('co_dm')).toBe(true);
  });

  it('does not treat trusted_player as DM', () => {
    expect(isDM('trusted_player')).toBe(false);
  });

  it('does not treat player as DM', () => {
    expect(isDM('player')).toBe(false);
  });

  it('does not treat spectator as DM', () => {
    expect(isDM('spectator')).toBe(false);
  });

  it('handles null gracefully', () => {
    expect(isDM(null)).toBe(false);
  });
});

describe('Role system — elevated access (compendium, token layer)', () => {
  it('owner, co_dm and trusted_player are elevated', () => {
    const elevated: SessionRole[] = ['owner', 'co_dm', 'trusted_player'];
    for (const role of elevated) {
      expect(isElevated(role)).toBe(true);
    }
  });

  it('player and spectator are not elevated', () => {
    expect(isElevated('player')).toBe(false);
    expect(isElevated('spectator')).toBe(false);
  });
});

describe('Role system — interactive (can move tokens, chat)', () => {
  it('all roles except spectator can interact', () => {
    const interactive: SessionRole[] = ['owner', 'co_dm', 'trusted_player', 'player'];
    for (const role of interactive) {
      expect(canInteract(role)).toBe(true);
    }
  });

  it('spectator is read-only and cannot interact', () => {
    expect(canInteract('spectator')).toBe(false);
  });
});

describe('Role system — spectator detection', () => {
  it('identifies spectator correctly', () => {
    expect(isSpectator('spectator')).toBe(true);
  });

  it('does not flag other roles as spectator', () => {
    const others: SessionRole[] = ['owner', 'co_dm', 'trusted_player', 'player'];
    for (const role of others) {
      expect(isSpectator(role)).toBe(false);
    }
  });
});

describe('Role constants — consistent with permission matrix', () => {
  it('DM_ROLES contains exactly owner and co_dm', () => {
    expect(DM_ROLES).toHaveLength(2);
    expect(DM_ROLES).toContain('owner');
    expect(DM_ROLES).toContain('co_dm');
  });

  it('ELEVATED_ROLES is a superset of DM_ROLES', () => {
    for (const r of DM_ROLES) {
      expect(ELEVATED_ROLES).toContain(r);
    }
    expect(ELEVATED_ROLES).toContain('trusted_player');
  });

  it('INTERACTIVE_ROLES includes player but excludes spectator', () => {
    expect(INTERACTIVE_ROLES).toContain('player');
    expect(INTERACTIVE_ROLES).not.toContain('spectator');
  });
});
