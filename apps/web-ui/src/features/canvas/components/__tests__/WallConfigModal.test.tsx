import { useGameStore } from '@/store';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WallConfigModal } from '../WallConfigModal';

vi.mock('@/store', () => ({ useGameStore: vi.fn() }));

const mockAddWall = vi.fn();
const mockProtocol = { createWall: vi.fn() };

vi.mock('@lib/api', () => ({
  useProtocol: vi.fn(() => ({ protocol: mockProtocol })),
}));

function setupStore(tableId: string | null = 'table-1') {
  vi.mocked(useGameStore).mockImplementation(
    ((sel?: (s: unknown) => unknown) => {
      const state = { activeTableId: tableId, addWall: mockAddWall };
      return sel ? (sel as (s: typeof state) => unknown)(state) : state;
    }) as typeof useGameStore
  );
}

function dispatchWallDrawn(x1 = 0, y1 = 0, x2 = 100, y2 = 100) {
  act(() => {
    window.dispatchEvent(new CustomEvent('wallDrawn', { detail: { x1, y1, x2, y2 } }));
  });
}

describe('WallConfigModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupStore();
  });

  it('renders nothing before wallDrawn event', () => {
    const { container } = render(<WallConfigModal />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows modal after wallDrawn event', () => {
    render(<WallConfigModal />);
    dispatchWallDrawn();
    expect(screen.getByText('New Wall Segment')).toBeInTheDocument();
  });

  it('Cancel button closes the modal', () => {
    render(<WallConfigModal />);
    dispatchWallDrawn();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('New Wall Segment')).not.toBeInTheDocument();
  });

  it('Escape closes the modal', () => {
    render(<WallConfigModal />);
    dispatchWallDrawn();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('New Wall Segment')).not.toBeInTheDocument();
  });

  it('shows wall type selector with Normal default', () => {
    render(<WallConfigModal />);
    dispatchWallDrawn();
    const select = screen.getByDisplayValue('Normal');
    expect(select).toBeInTheDocument();
  });

  it('changes wall type', () => {
    render(<WallConfigModal />);
    dispatchWallDrawn();
    const typeSelect = screen.getByDisplayValue('Normal');
    fireEvent.change(typeSelect, { target: { value: 'window' } });
    expect(screen.getByDisplayValue('Window')).toBeInTheDocument();
  });

  it('shows Blocks checkboxes', () => {
    render(<WallConfigModal />);
    dispatchWallDrawn();
    expect(screen.getByText(/movement/)).toBeInTheDocument();
    expect(screen.getByText(/light/)).toBeInTheDocument();
    expect(screen.getByText(/sight/)).toBeInTheDocument();
    expect(screen.getByText(/sound/)).toBeInTheDocument();
  });

  it('toggles Is door checkbox', () => {
    render(<WallConfigModal />);
    dispatchWallDrawn();
    const doorCheckbox = screen.getByRole('checkbox', { name: /Is door/ });
    expect(doorCheckbox).not.toBeChecked();
    fireEvent.click(doorCheckbox);
    expect(doorCheckbox).toBeChecked();
    // Door state select should appear
    expect(screen.getByText(/Door state/)).toBeInTheDocument();
  });

  it('Place Wall calls addWall and protocol.createWall', () => {
    render(<WallConfigModal />);
    dispatchWallDrawn(10, 20, 30, 40);
    fireEvent.click(screen.getByText('Place Wall'));
    expect(mockAddWall).toHaveBeenCalledWith(
      expect.objectContaining({ x1: 10, y1: 20, x2: 30, y2: 40 })
    );
    const wall = mockAddWall.mock.calls[0][0] as { wall_id: string };
    expect(wall.wall_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(mockProtocol.createWall).toHaveBeenCalled();
  });

  it('Place Wall does nothing when no tableId', () => {
    setupStore(null);
    render(<WallConfigModal />);
    dispatchWallDrawn();
    fireEvent.click(screen.getByText('Place Wall'));
    expect(mockAddWall).not.toHaveBeenCalled();
  });
});
