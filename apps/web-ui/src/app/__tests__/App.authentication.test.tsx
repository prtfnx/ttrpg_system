import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ initialize: vi.fn(), getUserInfo: vi.fn(), getUserSessions: vi.fn(), logout: vi.fn() }));
vi.mock('@features/auth', () => ({ authService: auth }));
vi.mock('@app/providers', () => ({ ProtocolProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock('@lib/wasm/runtime', () => ({ WasmRuntimeProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock('@shared/components/FloatingWindow', () => ({ WindowManagerProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock('@shared/components/ErrorBoundary', () => ({ ErrorBoundary: ({ children }: { children: ReactNode }) => children }));
vi.mock('@features/painting', () => ({ PaintControllerProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock('@features/session/components/SessionSelector', () => ({ SessionSelector: () => <p>Select a session</p> }));
vi.mock('@features/canvas/components/GameClient', () => ({
  GameClient: ({ onAuthError, userInfo, userRole }: { onAuthError: () => void; userInfo: { username: string }; userRole: string }) => (
    <><p>{userInfo.username}: {userRole}</p><button onClick={onAuthError}>Expire account</button></>
  ),
}));

import App from '../../App';

beforeEach(() => {
  vi.clearAllMocks();
  auth.initialize.mockResolvedValue(true);
  auth.getUserInfo.mockReturnValue({ id: 1, username: 'owner' });
  auth.getUserSessions.mockResolvedValue([{ session_code: 'ROOM12', session_name: 'Room', role: 'owner' }]);
  Reflect.set(window, '__INITIAL_DATA__', { sessionCode: 'ROOM12', userRole: 'owner' });
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(window, '__INITIAL_DATA__');
  sessionStorage.clear();
});

it('offers deliberate sign-in back to the selected session and retains saved requests', async () => {
  sessionStorage.setItem('original-operation', 'original-request-with-original-id');
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Expire account' }));
  expect(screen.getByRole('heading', { name: 'Sign-in expired' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Expire account' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sign in again' })).toHaveAttribute('href',
    '/users/login?next=%2Fgame%2Fsession%2FROOM12');
  vi.useFakeTimers();
  act(() => vi.advanceTimersByTime(30_000));
  expect(auth.logout).not.toHaveBeenCalled();
  expect(sessionStorage.getItem('original-operation')).toBe('original-request-with-original-id');
});

it.each(['//other.example', 'ROOM\n', 'X'.repeat(129)])('never builds an arbitrary return URL from %j', async code => {
  Reflect.set(window, '__INITIAL_DATA__', { sessionCode: code, userRole: 'owner' });
  auth.getUserSessions.mockResolvedValue([]);
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Expire account' }));
  expect(screen.getByRole('link', { name: 'Sign in again' })).toHaveAttribute('href', '/users/login');
});

it('uses fresh identity and server-injected role when the session page returns after sign-in', async () => {
  const oldPage = render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Expire account' }));
  oldPage.unmount();
  auth.getUserInfo.mockReturnValue({ id: 2, username: 'player' });
  Reflect.set(window, '__INITIAL_DATA__', { sessionCode: 'ROOM12', userRole: 'player' });
  render(<App />);
  await waitFor(() => expect(screen.getByText('player: player')).toBeInTheDocument());
  expect(screen.queryByText('owner: owner')).not.toBeInTheDocument();
});
