import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FogPanel } from '../FogPanel';

// ── mocks ────────────────────────────────────────────────────────────────────
const mockRenderer = {
  clear_fog: vi.fn(),
  add_fog_rectangle: vi.fn(),
  remove_fog_rectangle: vi.fn(),
  screen_to_world: vi.fn(() => [0, 0]),
  world_to_screen: vi.fn(() => [0, 0]),
  get_active_table_world_bounds: vi.fn(() => new Float64Array([0, 0, 800, 600])),
};

const mockUpdateFog = vi.fn();
const mockProtocol = { updateFog: mockUpdateFog, isConnected: vi.fn(() => true) };

vi.mock('@features/canvas', () => ({
  useRenderEngine: vi.fn(() => mockRenderer),
}));

vi.mock('@lib/api', () => ({
  useProtocol: vi.fn(() => ({ protocol: mockProtocol })),
}));

vi.mock('@/store', () => ({
  useGameStore: Object.assign(
    vi.fn(() => ({})),
    { getState: vi.fn(() => ({ activeTableId: 'table-1' })) },
  ),
}));

import { useRenderEngine } from '@features/canvas';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRenderEngine).mockReturnValue(mockRenderer as unknown as ReturnType<typeof useRenderEngine>);
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('FogPanel — render', () => {
  it('renders heading and all control buttons', () => {
    render(<FogPanel />);
    expect(screen.getByText('Fog of War')).toBeInTheDocument();
    expect(screen.getByTitle(/draw fog hide rectangles/)).toBeInTheDocument();
    expect(screen.getByTitle(/draw fog reveal rectangles/)).toBeInTheDocument();
    expect(screen.getByTitle('Cover entire table with fog')).toBeInTheDocument();
    expect(screen.getByTitle('Remove all fog rectangles')).toBeInTheDocument();
  });

  it('shows empty state message when no fog rectangles', () => {
    render(<FogPanel />);
    expect(screen.getByText(/No fog rectangles yet/)).toBeInTheDocument();
  });

  it('shows statistics section', () => {
    render(<FogPanel />);
    expect(screen.getByText('[H] Hidden Areas')).toBeInTheDocument();
    expect(screen.getByText('[R] Revealed Areas')).toBeInTheDocument();
  });

  it('buttons are disabled when renderer is null', () => {
    vi.mocked(useRenderEngine).mockReturnValue(null);
    render(<FogPanel />);
    expect(screen.getByTitle(/draw fog hide rectangles/)).toBeDisabled();
    expect(screen.getByTitle(/draw fog reveal rectangles/)).toBeDisabled();
  });
});

describe('FogPanel — mode toggle', () => {
  it('clicking Hide Mode shows Hide Mode Active banner', () => {
    render(<FogPanel />);
    fireEvent.click(screen.getByTitle(/draw fog hide rectangles/));
    expect(screen.getByText(/Hide Mode Active/)).toBeInTheDocument();
  });

  it('clicking Reveal Mode shows Reveal Mode Active banner', () => {
    render(<FogPanel />);
    fireEvent.click(screen.getByTitle(/draw fog reveal rectangles/));
    expect(screen.getByText(/Reveal Mode Active/)).toBeInTheDocument();
  });

  it('clicking active mode again deactivates it', () => {
    render(<FogPanel />);
    fireEvent.click(screen.getByTitle(/draw fog hide rectangles/));
    expect(screen.getByText(/Hide Mode Active/)).toBeInTheDocument();
    fireEvent.click(screen.getByTitle(/draw fog hide rectangles/));
    expect(screen.queryByText(/Hide Mode Active/)).not.toBeInTheDocument();
  });
});

describe('FogPanel — table-data-received event', () => {
  it('loads fog rectangles from table-data-received event', () => {
    render(<FogPanel />);

    act(() => {
      window.dispatchEvent(new CustomEvent('table-data-received', {
        detail: {
          fog_rectangles: {
            hide: [[[0, 0], [100, 100]]],
            reveal: [[[50, 50], [150, 150]]],
          },
        },
      }));
    });

    expect(screen.getByText('[H] HIDE')).toBeInTheDocument();
    expect(screen.getByText('[R] REVEAL')).toBeInTheDocument();
    expect(mockRenderer.clear_fog).toHaveBeenCalled();
    expect(mockRenderer.add_fog_rectangle).toHaveBeenCalled();
  });

  it('ignores event when renderer is null', () => {
    vi.mocked(useRenderEngine).mockReturnValue(null);
    render(<FogPanel />);

    act(() => {
      window.dispatchEvent(new CustomEvent('table-data-received', {
        detail: { fog_rectangles: { hide: [[[0, 0], [100, 100]]], reveal: [] } },
      }));
    });

    expect(screen.queryByText('[H] HIDE')).not.toBeInTheDocument();
  });
});

describe('FogPanel — remove rectangle', () => {
  it('removes a fog rectangle when x button is clicked', () => {
    render(<FogPanel />);

    // Load a rectangle first
    act(() => {
      window.dispatchEvent(new CustomEvent('table-data-received', {
        detail: { fog_rectangles: { hide: [[[0, 0], [100, 100]]], reveal: [] } },
      }));
    });

    expect(screen.getByText('[H] HIDE')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Remove this fog rectangle'));
    expect(screen.queryByText('[H] HIDE')).not.toBeInTheDocument();
    expect(mockRenderer.remove_fog_rectangle).toHaveBeenCalled();
  });
});

describe('FogPanel — Hide All / Clear All', () => {
  it('Hide All calls renderer methods and updates state', () => {
    render(<FogPanel />);
    fireEvent.click(screen.getByTitle('Cover entire table with fog'));
    expect(mockRenderer.clear_fog).toHaveBeenCalled();
    expect(mockRenderer.add_fog_rectangle).toHaveBeenCalledWith(
      'full_table_fog', 0, 0, 800, 600, 'hide',
    );
    expect(mockUpdateFog).toHaveBeenCalled();
  });

  it('Clear All calls clear_fog and empties list', () => {
    render(<FogPanel />);

    // Load a rectangle first
    act(() => {
      window.dispatchEvent(new CustomEvent('table-data-received', {
        detail: { fog_rectangles: { hide: [[[0, 0], [100, 100]]], reveal: [] } },
      }));
    });

    expect(screen.getByText('[H] HIDE')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Remove all fog rectangles'));
    expect(mockRenderer.clear_fog).toHaveBeenCalled();
    expect(screen.queryByText('[H] HIDE')).not.toBeInTheDocument();
  });
});
