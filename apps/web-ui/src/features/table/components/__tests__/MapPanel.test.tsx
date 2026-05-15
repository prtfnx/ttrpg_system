import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MapPanel } from '../MapPanel';

// ── mocks ────────────────────────────────────────────────────────────────────
const mockEngine = {
  set_grid_enabled: vi.fn(),
  set_grid_size: vi.fn(),
  set_snap_to_grid: vi.fn(),
  set_grid_color: vi.fn(),
  set_background_color: vi.fn(),
  reset_camera: vi.fn(),
  set_camera_position: vi.fn(),
  set_camera_scale: vi.fn(),
  clear_all_sprites: vi.fn(),
};

const mockSendTableSettingsUpdate = vi.fn();

vi.mock('@features/canvas', () => ({
  useRenderEngine: vi.fn(() => mockEngine),
}));

vi.mock('@lib/api', () => ({
  ProtocolService: {
    hasProtocol: vi.fn(() => false),
    getProtocol: vi.fn(() => ({ sendTableSettingsUpdate: mockSendTableSettingsUpdate })),
  },
}));

vi.mock('@/store', () => ({
  useGameStore: vi.fn(() => ({
    activeTableId: 'table-1',
    gridEnabled: true,
    gridCellPx: 50,
    gridSnapping: false,
    gridColorHex: '#ffffff',
    backgroundColorHex: '#2a3441',
  })),
}));

import { useRenderEngine } from '@features/canvas';
import { useGameStore } from '@/store';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRenderEngine).mockReturnValue(mockEngine as unknown as ReturnType<typeof useRenderEngine>);
  window.confirm = vi.fn(() => true);
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('MapPanel — render', () => {
  it('renders headers', () => {
    render(<MapPanel />);
    expect(screen.getByText('Map & Grid')).toBeInTheDocument();
    expect(screen.getByText('Grid Settings')).toBeInTheDocument();
    expect(screen.getByText('Grid Presets')).toBeInTheDocument();
    expect(screen.getByText('Camera')).toBeInTheDocument();
  });

  it('renders all grid preset buttons', () => {
    render(<MapPanel />);
    expect(screen.getByText('D&D 5ft')).toBeInTheDocument();
    expect(screen.getByText('D&D 10ft')).toBeInTheDocument();
    expect(screen.getByText('Pathfinder')).toBeInTheDocument();
    expect(screen.getByText('Hex Large')).toBeInTheDocument();
    expect(screen.getByText('Hex Small')).toBeInTheDocument();
  });

  it('renders camera action buttons', () => {
    render(<MapPanel />);
    expect(screen.getByText('Reset')).toBeInTheDocument();
    expect(screen.getByText('Center')).toBeInTheDocument();
    expect(screen.getByText('Fit Screen')).toBeInTheDocument();
  });
});

describe('MapPanel — grid toggle', () => {
  it('toggling Enable Grid checkbox calls engine.set_grid_enabled', async () => {
    const user = userEvent.setup();
    render(<MapPanel />);
    const checkboxes = screen.getAllByRole('checkbox');
    const enableGrid = checkboxes.find(c => c.closest('label')?.textContent?.includes('Enable Grid'))!;
    await user.click(enableGrid);
    expect(mockEngine.set_grid_enabled).toHaveBeenCalledWith(false);
  });

  it('checking Snap to Grid calls engine.set_snap_to_grid', async () => {
    // gridSnapping defaults to false in mock; clicking unchecked→checked calls set_snap_to_grid(true)
    const user = userEvent.setup();
    render(<MapPanel />);
    const checkboxes = screen.getAllByRole('checkbox');
    const snapGrid = checkboxes.find(c => c.closest('label')?.textContent?.includes('Snap to Grid'))!;
    await user.click(snapGrid);
    expect(mockEngine.set_snap_to_grid).toHaveBeenCalledWith(true);
  });
});

describe('MapPanel — grid size input', () => {
  it('changing grid size input calls engine.set_grid_size', () => {
    render(<MapPanel />);
    const inputs = screen.getAllByRole('spinbutton');
    // First is Width, Second is Height, Third is Grid Size
    const gridSizeInput = inputs.find(
      el => (el as HTMLInputElement).min === '10'
    );
    fireEvent.change(gridSizeInput!, { target: { value: '80' } });
    expect(mockEngine.set_grid_size).toHaveBeenCalledWith(80);
  });
});

describe('MapPanel — grid presets', () => {
  it('clicking D&D 5ft preset applies size 50 and square type', () => {
    render(<MapPanel />);
    fireEvent.click(screen.getByText('D&D 5ft'));
    expect(mockEngine.set_grid_size).toHaveBeenCalledWith(50);
  });

  it('clicking D&D 10ft preset applies size 100', () => {
    render(<MapPanel />);
    fireEvent.click(screen.getByText('D&D 10ft'));
    expect(mockEngine.set_grid_size).toHaveBeenCalledWith(100);
  });

  it('clicking Hex Large preset applies size 60', () => {
    render(<MapPanel />);
    fireEvent.click(screen.getByText('Hex Large'));
    expect(mockEngine.set_grid_size).toHaveBeenCalledWith(60);
  });
});

describe('MapPanel — camera controls', () => {
  it('Reset button calls engine.reset_camera', () => {
    render(<MapPanel />);
    fireEvent.click(screen.getByText('Reset'));
    expect(mockEngine.reset_camera).toHaveBeenCalled();
  });

  it('Center button calls engine.set_camera_position', () => {
    render(<MapPanel />);
    fireEvent.click(screen.getByText('Center'));
    expect(mockEngine.set_camera_position).toHaveBeenCalled();
  });

  it('Fit Screen button calls engine.set_camera_scale', () => {
    render(<MapPanel />);
    fireEvent.click(screen.getByText('Fit Screen'));
    expect(mockEngine.set_camera_scale).toHaveBeenCalled();
  });
});

describe('MapPanel — actions', () => {
  it('Clear Map with confirm calls engine.clear_all_sprites', () => {
    render(<MapPanel />);
    fireEvent.click(screen.getByText('Clear Map'));
    expect(mockEngine.clear_all_sprites).toHaveBeenCalled();
  });

  it('Clear Map with confirm=false does not call engine', () => {
    window.confirm = vi.fn(() => false);
    render(<MapPanel />);
    fireEvent.click(screen.getByText('Clear Map'));
    expect(mockEngine.clear_all_sprites).not.toHaveBeenCalled();
  });

  it('does nothing when engine is null', () => {
    vi.mocked(useRenderEngine).mockReturnValue(null);
    render(<MapPanel />);
    // Clicking Reset without engine is a no-op
    fireEvent.click(screen.getByText('Reset'));
    expect(mockEngine.reset_camera).not.toHaveBeenCalled();
  });
});
