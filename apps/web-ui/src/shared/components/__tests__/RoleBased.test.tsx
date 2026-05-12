import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import RoleBased, { DMOnly, ElevatedOnly, InteractiveOnly, PlayerOnly } from '../RoleBased';

// Mock useGameStore to return a controlled sessionRole
let mockRole: string | null = null;

vi.mock('@/store', () => ({
  useGameStore: (selector: (s: { sessionRole: string | null }) => unknown) =>
    selector({ sessionRole: mockRole }),
}));

describe('RoleBased', () => {
  it('renders children when role is in allowedRoles', () => {
    mockRole = 'player';
    render(<RoleBased allowedRoles={['player', 'owner']}>secret</RoleBased>);
    expect(screen.getByText('secret')).toBeTruthy();
  });

  it('renders fallback when role is not allowed', () => {
    mockRole = 'spectator';
    render(<RoleBased allowedRoles={['owner']} fallback={<span>nope</span>}>secret</RoleBased>);
    expect(screen.queryByText('secret')).toBeNull();
    expect(screen.getByText('nope')).toBeTruthy();
  });

  it('renders nothing when role is null', () => {
    mockRole = null;
    render(<RoleBased allowedRoles={['player']}>hidden</RoleBased>);
    expect(screen.queryByText('hidden')).toBeNull();
  });
});

describe('DMOnly', () => {
  it('renders for owner role', () => {
    mockRole = 'owner';
    render(<DMOnly>dm content</DMOnly>);
    expect(screen.getByText('dm content')).toBeTruthy();
  });

  it('renders for co_dm role', () => {
    mockRole = 'co_dm';
    render(<DMOnly>dm content</DMOnly>);
    expect(screen.getByText('dm content')).toBeTruthy();
  });

  it('hides for player role', () => {
    mockRole = 'player';
    render(<DMOnly fallback={<span>denied</span>}>dm content</DMOnly>);
    expect(screen.queryByText('dm content')).toBeNull();
    expect(screen.getByText('denied')).toBeTruthy();
  });
});

describe('ElevatedOnly', () => {
  it('renders for trusted_player role', () => {
    mockRole = 'trusted_player';
    render(<ElevatedOnly>elevated</ElevatedOnly>);
    expect(screen.getByText('elevated')).toBeTruthy();
  });

  it('hides for spectator role', () => {
    mockRole = 'spectator';
    render(<ElevatedOnly>elevated</ElevatedOnly>);
    expect(screen.queryByText('elevated')).toBeNull();
  });
});

describe('InteractiveOnly', () => {
  it('renders for player role', () => {
    mockRole = 'player';
    render(<InteractiveOnly>interact</InteractiveOnly>);
    expect(screen.getByText('interact')).toBeTruthy();
  });

  it('hides for spectator role', () => {
    mockRole = 'spectator';
    render(<InteractiveOnly>interact</InteractiveOnly>);
    expect(screen.queryByText('interact')).toBeNull();
  });
});

describe('PlayerOnly', () => {
  it('renders for player (delegates to InteractiveOnly)', () => {
    mockRole = 'player';
    render(<PlayerOnly>player content</PlayerOnly>);
    expect(screen.getByText('player content')).toBeTruthy();
  });

  it('hides for spectator', () => {
    mockRole = 'spectator';
    render(<PlayerOnly>player content</PlayerOnly>);
    expect(screen.queryByText('player content')).toBeNull();
  });
});
