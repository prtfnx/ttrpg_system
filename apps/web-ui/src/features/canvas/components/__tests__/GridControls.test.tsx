import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GridControls } from '../GridControls';
import { useGameStore } from '@/store';

vi.mock('@lib/api', () => ({
  ProtocolService: {
    hasProtocol: vi.fn(() => false),
    getProtocol: vi.fn(() => ({ sendTableSettingsUpdate: vi.fn() })),
  },
}));

const defaultState = {
  gridEnabled: true,
  gridSnapping: true,
  gridSize: 50,
  gridCellPx: 50,
  cellDistance: 5,
  distanceUnit: 'ft' as const,
  activeTableId: null,
  setGridEnabled: vi.fn(),
  setGridSnapping: vi.fn(),
  setGridSize: vi.fn(),
  setTableUnits: vi.fn(),
};

beforeEach(() => {
  useGameStore.setState(defaultState);
  // Stub optional WASM renderer
  (window as Record<string, unknown>)['rustRenderManager'] = {
    set_grid_enabled: vi.fn(),
    set_grid_snapping: vi.fn(),
    set_grid_size: vi.fn(),
  };
  vi.clearAllMocks();
});

describe('GridControls', () => {
  it('renders title and controls', () => {
    render(<GridControls />);
    expect(screen.getByText('Grid Controls')).toBeTruthy();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('show grid checkbox reflects gridEnabled state', () => {
    render(<GridControls />);
    const [showGrid] = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(showGrid.checked).toBe(true);
  });

  it('toggling Show Grid calls setGridEnabled', async () => {
    const setGridEnabled = vi.fn();
    useGameStore.setState({ ...defaultState, setGridEnabled });
    render(<GridControls />);
    const [showGrid] = screen.getAllByRole('checkbox');
    await userEvent.click(showGrid);
    expect(setGridEnabled).toHaveBeenCalledWith(false);
  });

  it('toggling Snap to Grid calls setGridSnapping', async () => {
    const setGridSnapping = vi.fn();
    useGameStore.setState({ ...defaultState, setGridSnapping });
    render(<GridControls />);
    const [, snapGrid] = screen.getAllByRole('checkbox');
    await userEvent.click(snapGrid);
    expect(setGridSnapping).toHaveBeenCalledWith(false);
  });

  it('clicking ft unit button calls setTableUnits with ft', async () => {
    const setTableUnits = vi.fn();
    useGameStore.setState({ ...defaultState, distanceUnit: 'm', setTableUnits });
    render(<GridControls />);
    await userEvent.click(screen.getByRole('button', { name: 'ft' }));
    expect(setTableUnits).toHaveBeenCalledWith(expect.objectContaining({ distanceUnit: 'ft' }));
  });

  it('clicking m unit button calls setTableUnits with m', async () => {
    const setTableUnits = vi.fn();
    useGameStore.setState({ ...defaultState, setTableUnits });
    render(<GridControls />);
    await userEvent.click(screen.getByRole('button', { name: 'm' }));
    expect(setTableUnits).toHaveBeenCalledWith(expect.objectContaining({ distanceUnit: 'm' }));
  });
});
