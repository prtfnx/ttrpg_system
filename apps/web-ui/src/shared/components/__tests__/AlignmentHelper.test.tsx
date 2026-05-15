import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AlignmentHelper } from '../AlignmentHelper';

vi.mock('@/store', () => ({
  useGameStore: vi.fn(),
}));

vi.mock('@shared/utils/spriteHelpers', () => ({
  getSpriteCenter: vi.fn((s: { x: number; y: number; width?: number; height?: number }) => ({
    x: s.x + (s.width ?? 64) / 2,
    y: s.y + (s.height ?? 64) / 2,
  })),
  getSpriteWidth: vi.fn((s: { width?: number }) => s.width ?? 64),
  getSpriteHeight: vi.fn((s: { height?: number }) => s.height ?? 64),
}));

import { useGameStore } from '@/store';

const mockSprites = [
  { id: 'a', x: 100, y: 50, width: 64, height: 64 },
  { id: 'b', x: 200, y: 50, width: 64, height: 64 },
  { id: 'c', x: 300, y: 150, width: 64, height: 64 },
];

function setupStore(selectedSprites: string[] = ['a', 'b']) {
  (useGameStore as ReturnType<typeof vi.fn>).mockReturnValue({
    sprites: mockSprites,
    selectedSprites,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (window as typeof window & { gameAPI?: unknown }).gameAPI = { sendMessage: vi.fn() };
});

describe('AlignmentHelper', () => {
  it('returns null when isActive is false', () => {
    setupStore();
    const { container } = render(<AlignmentHelper isActive={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders alignment controls when isActive is true', () => {
    setupStore();
    render(<AlignmentHelper isActive={true} />);
    expect(screen.getByText('Align Selected Sprites')).toBeTruthy();
    expect(screen.getByText('Horizontal:')).toBeTruthy();
    expect(screen.getByText('Vertical:')).toBeTruthy();
    expect(screen.getByText('Distribute:')).toBeTruthy();
  });

  it('renders all 8 alignment buttons', () => {
    setupStore();
    render(<AlignmentHelper isActive={true} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(8); // left, center, right, top, middle, bottom, H, V
  });

  it('align left: calls sendMessage for each selected sprite', () => {
    setupStore(['a', 'b']);
    render(<AlignmentHelper isActive={true} />);
    fireEvent.click(screen.getByTitle('Align Left'));
    const sendMsg = (window as typeof window & { gameAPI: { sendMessage: ReturnType<typeof vi.fn> } }).gameAPI.sendMessage;
    expect(sendMsg).toHaveBeenCalledTimes(2);
    // Both sprites moved to leftmost x (100)
    expect(sendMsg).toHaveBeenCalledWith('sprite_update', { id: 'a', x: 100 });
    expect(sendMsg).toHaveBeenCalledWith('sprite_update', { id: 'b', x: 100 });
  });

  it('align right: calls sendMessage for each selected sprite', () => {
    setupStore(['a', 'b']);
    render(<AlignmentHelper isActive={true} />);
    fireEvent.click(screen.getByTitle('Align Right'));
    const sendMsg = (window as typeof window & { gameAPI: { sendMessage: ReturnType<typeof vi.fn> } }).gameAPI.sendMessage;
    expect(sendMsg).toHaveBeenCalledTimes(2);
  });

  it('align top: calls sendMessage with y = topmost', () => {
    setupStore(['a', 'b']);
    render(<AlignmentHelper isActive={true} />);
    fireEvent.click(screen.getByTitle('Align Top'));
    const sendMsg = (window as typeof window & { gameAPI: { sendMessage: ReturnType<typeof vi.fn> } }).gameAPI.sendMessage;
    expect(sendMsg).toHaveBeenCalledWith('sprite_update', { id: 'a', y: 50 });
    expect(sendMsg).toHaveBeenCalledWith('sprite_update', { id: 'b', y: 50 });
  });

  it('align bottom: calls sendMessage for each selected sprite', () => {
    setupStore(['a', 'b']);
    render(<AlignmentHelper isActive={true} />);
    fireEvent.click(screen.getByTitle('Align Bottom'));
    const sendMsg = (window as typeof window & { gameAPI: { sendMessage: ReturnType<typeof vi.fn> } }).gameAPI.sendMessage;
    expect(sendMsg).toHaveBeenCalledTimes(2);
  });

  it('align center: calls sendMessage for each selected sprite', () => {
    setupStore(['a', 'b']);
    render(<AlignmentHelper isActive={true} />);
    fireEvent.click(screen.getByTitle('Align Center'));
    const sendMsg = (window as typeof window & { gameAPI: { sendMessage: ReturnType<typeof vi.fn> } }).gameAPI.sendMessage;
    expect(sendMsg).toHaveBeenCalledTimes(2);
  });

  it('align middle: calls sendMessage for each selected sprite', () => {
    setupStore(['a', 'b']);
    render(<AlignmentHelper isActive={true} />);
    fireEvent.click(screen.getByTitle('Align Middle'));
    const sendMsg = (window as typeof window & { gameAPI: { sendMessage: ReturnType<typeof vi.fn> } }).gameAPI.sendMessage;
    expect(sendMsg).toHaveBeenCalledTimes(2);
  });

  it('distribute-h: requires 3+ sprites, skips when fewer', () => {
    setupStore(['a', 'b']); // only 2 sprites
    render(<AlignmentHelper isActive={true} />);
    fireEvent.click(screen.getByTitle('Distribute Horizontally'));
    const sendMsg = (window as typeof window & { gameAPI: { sendMessage: ReturnType<typeof vi.fn> } }).gameAPI.sendMessage;
    expect(sendMsg).not.toHaveBeenCalled();
  });

  it('distribute-h: distributes 3+ sprites evenly', () => {
    setupStore(['a', 'b', 'c']);
    render(<AlignmentHelper isActive={true} />);
    act(() => {
      fireEvent.click(screen.getByTitle('Distribute Horizontally'));
    });
    const sendMsg = (window as typeof window & { gameAPI: { sendMessage: ReturnType<typeof vi.fn> } }).gameAPI.sendMessage;
    expect(sendMsg).toHaveBeenCalledTimes(3);
  });

  it('distribute-v: requires 3+ sprites, skips when fewer', () => {
    setupStore(['a', 'b']); // only 2 sprites
    render(<AlignmentHelper isActive={true} />);
    fireEvent.click(screen.getByTitle('Distribute Vertically'));
    const sendMsg = (window as typeof window & { gameAPI: { sendMessage: ReturnType<typeof vi.fn> } }).gameAPI.sendMessage;
    expect(sendMsg).not.toHaveBeenCalled();
  });

  it('does nothing when fewer than 2 sprites selected', () => {
    setupStore(['a']); // only 1 sprite
    render(<AlignmentHelper isActive={true} />);
    fireEvent.click(screen.getByTitle('Align Left'));
    const sendMsg = (window as typeof window & { gameAPI: { sendMessage: ReturnType<typeof vi.fn> } }).gameAPI.sendMessage;
    expect(sendMsg).not.toHaveBeenCalled();
  });
});
