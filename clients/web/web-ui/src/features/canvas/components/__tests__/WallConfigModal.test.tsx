/**
 * WallConfigModal - Behavioral Tests
 * Tests real user interactions: DM draws a wall, configures it, places it.
 */

import { useGameStore } from '@/store';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WallConfigModal } from '../WallConfigModal';

const mockSendMessage = vi.fn();
const mockAddWall = vi.fn();

vi.mock('@lib/api', () => ({
  useProtocol: () => ({ protocol: { sendMessage: mockSendMessage } }),
}));

vi.mock('@/store', () => ({
  useGameStore: vi.fn(),
}));

vi.mock('@lib/websocket', () => ({
  createMessage: vi.fn((type, data) => ({ type, data })),
  MessageType: { WALL_CREATE: 'wall_create' },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useGameStore).mockImplementation((selector: any) =>
    selector({ activeTableId: 'table-1', addWall: mockAddWall })
  );
  (window as any).rustRenderManager = { add_wall: vi.fn() };
});

function fireWallDrawn(detail = { x1: 10, y1: 20, x2: 100, y2: 200 }) {
  window.dispatchEvent(new CustomEvent('wallDrawn', { detail }));
}

describe('WallConfigModal — DM places a wall', () => {
  const user = userEvent.setup();

  it('modal is hidden until DM draws a wall segment', () => {
    render(<WallConfigModal />);
    expect(screen.queryByText('New Wall Segment')).not.toBeInTheDocument();
  });

  it('appears after wallDrawn event', async () => {
    render(<WallConfigModal />);
    fireWallDrawn();
    await waitFor(() => expect(screen.getByText('New Wall Segment')).toBeInTheDocument());
  });

  it('shows default wall settings on open', async () => {
    render(<WallConfigModal />);
    fireWallDrawn();
    await waitFor(() => screen.getByText('New Wall Segment'));

    // Type dropdown defaults to Normal
    expect(screen.getByDisplayValue('Normal')).toBeInTheDocument();
    // Direction dropdown
    expect(screen.getByDisplayValue('Both sides')).toBeInTheDocument();
    // blocks_movement, blocks_light, blocks_sight checkboxes checked by default
    const checkboxes = screen.getAllByRole('checkbox');
    const checked = checkboxes.filter(c => (c as HTMLInputElement).checked);
    expect(checked.length).toBeGreaterThanOrEqual(3);
  });

  it('DM can change wall type to Door', async () => {
    render(<WallConfigModal />);
    fireWallDrawn();
    await waitFor(() => screen.getByText('New Wall Segment'));

    await user.selectOptions(screen.getByDisplayValue('Normal'), 'window');
    expect(screen.getByDisplayValue('Window')).toBeInTheDocument();
  });

  it('door state field appears when Is door is checked', async () => {
    render(<WallConfigModal />);
    fireWallDrawn();
    await waitFor(() => screen.getByText('New Wall Segment'));

    // Is door checkbox
    const isDoorCheckbox = screen.getByRole('checkbox', { name: /is door/i });
    await user.click(isDoorCheckbox);

    expect(screen.getByDisplayValue('Closed')).toBeInTheDocument();
  });

  it('Cancel closes the modal without sending', async () => {
    render(<WallConfigModal />);
    fireWallDrawn();
    await waitFor(() => screen.getByText('New Wall Segment'));

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByText('New Wall Segment')).not.toBeInTheDocument());
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('Place Wall sends WALL_CREATE to server', async () => {
    render(<WallConfigModal />);
    fireWallDrawn({ x1: 10, y1: 20, x2: 100, y2: 200 });
    await waitFor(() => screen.getByText('New Wall Segment'));

    await user.click(screen.getByRole('button', { name: /place wall/i }));

    expect(mockSendMessage).toHaveBeenCalledOnce();
    const call = mockSendMessage.mock.calls[0][0];
    expect(call.type).toBe('wall_create');
    expect(call.data).toMatchObject({ table_id: 'table-1', x1: 10, y1: 20, x2: 100, y2: 200 });
  });

  it('Place Wall optimistically adds wall to local store', async () => {
    render(<WallConfigModal />);
    fireWallDrawn({ x1: 5, y1: 5, x2: 50, y2: 50 });
    await waitFor(() => screen.getByText('New Wall Segment'));

    await user.click(screen.getByRole('button', { name: /place wall/i }));

    expect(mockAddWall).toHaveBeenCalledOnce();
    expect(mockAddWall.mock.calls[0][0]).toMatchObject({ x1: 5, y1: 5, x2: 50, y2: 50 });
  });

  it('modal closes after placing wall', async () => {
    render(<WallConfigModal />);
    fireWallDrawn();
    await waitFor(() => screen.getByText('New Wall Segment'));

    await user.click(screen.getByRole('button', { name: /place wall/i }));

    await waitFor(() => expect(screen.queryByText('New Wall Segment')).not.toBeInTheDocument());
  });
});
