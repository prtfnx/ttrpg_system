import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaintPanel } from '../PaintPanel';
// NOTE: test is in __tests__/ — relative imports are one level deeper than the component

// ── mocks ────────────────────────────────────────────────────────────────────
const mockPaintControls = {
  enterPaintMode: vi.fn(),
  exitPaintMode: vi.fn(),
  setBrushColor: vi.fn(),
  setBrushWidth: vi.fn(),
  setBlendMode: vi.fn(),
  clearAll: vi.fn(),
  undoStroke: vi.fn(),
  redoStroke: vi.fn(),
  getStrokes: vi.fn(() => []),
  getCurrentStroke: vi.fn(() => null),
  startStroke: vi.fn(),
  addPoint: vi.fn(),
  endStroke: vi.fn(),
  cancelStroke: vi.fn(),
  applyBrushPreset: vi.fn(),
};

const defaultPaintState = {
  isActive: false,
  isDrawing: false,
  strokeCount: 0,
  brushColor: [1, 1, 1, 1],
  brushWidth: 3.0,
  blendMode: 'alpha',
  canUndo: false,
  canRedo: false,
};

vi.mock('@features/canvas', () => ({
  useRenderEngine: vi.fn(() => null),
}));

vi.mock('../../hooks/usePaintSystem', () => ({
  usePaintSystem: vi.fn(() => [defaultPaintState, mockPaintControls]),
  useBrushPresets: vi.fn(() => []),
  usePaintInteraction: vi.fn(),
}));

vi.mock('../../services/paintTemplate.service', () => ({
  paintTemplateService: {
    getAllTemplateMetadata: vi.fn(() => []),
    saveTemplate: vi.fn(),
    getTemplate: vi.fn(() => null),
    deleteTemplate: vi.fn(),
  },
}));

vi.mock('@/store', () => ({
  useGameStore: vi.fn(() => ({ activeTableId: 'table-1' })),
}));

import { useRenderEngine } from '@features/canvas';
import { usePaintSystem } from '../../hooks/usePaintSystem';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRenderEngine).mockReturnValue(null);
  vi.mocked(usePaintSystem).mockReturnValue([defaultPaintState, mockPaintControls]);
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('PaintPanel — render', () => {
  it('renders the Paint System header', () => {
    render(<PaintPanel />);
    expect(screen.getByText('Paint System')).toBeInTheDocument();
  });

  it('returns null when isVisible is false', () => {
    const { container } = render(<PaintPanel isVisible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders toggle button when onToggle is provided', () => {
    const onToggle = vi.fn();
    render(<PaintPanel onToggle={onToggle} />);
    // toggle button has ↓ arrow
    const toggleBtn = screen.getByText('↓');
    expect(toggleBtn).toBeInTheDocument();
    fireEvent.click(toggleBtn);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('renders close button when onClose is provided', () => {
    const onClose = vi.fn();
    render(<PaintPanel onClose={onClose} />);
    const closeBtn = screen.getByText('×');
    expect(closeBtn).toBeInTheDocument();
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('PaintPanel — paint mode controls', () => {
  it('shows Enter Paint Mode button when not active', () => {
    render(<PaintPanel />);
    expect(screen.getByText('Enter Paint Mode')).toBeInTheDocument();
    expect(screen.queryByText('Exit Paint Mode')).not.toBeInTheDocument();
  });

  it('Enter Paint Mode is disabled when no engine', () => {
    render(<PaintPanel />);
    const enterBtn = screen.getByText('Enter Paint Mode');
    expect(enterBtn).toBeDisabled();
  });

  it('Enter Paint Mode is enabled when engine is available', () => {
    const fakeEngine = { paint_set_brush_color: vi.fn() } as unknown as ReturnType<typeof useRenderEngine>;
    vi.mocked(useRenderEngine).mockReturnValue(fakeEngine);
    render(<PaintPanel />);
    expect(screen.getByText('Enter Paint Mode')).not.toBeDisabled();
  });

  it('shows Exit Paint Mode button when paint is active', () => {
    vi.mocked(usePaintSystem).mockReturnValue([
      { ...defaultPaintState, isActive: true },
      mockPaintControls,
    ]);
    render(<PaintPanel />);
    expect(screen.getByText('Exit Paint Mode')).toBeInTheDocument();
    expect(screen.queryByText('Enter Paint Mode')).not.toBeInTheDocument();
  });

  it('clicking Exit Paint Mode calls paintControls.exitPaintMode', () => {
    vi.mocked(usePaintSystem).mockReturnValue([
      { ...defaultPaintState, isActive: true },
      mockPaintControls,
    ]);
    render(<PaintPanel />);
    fireEvent.click(screen.getByText('Exit Paint Mode'));
    expect(mockPaintControls.exitPaintMode).toHaveBeenCalledOnce();
  });
});

describe('PaintPanel — brush controls', () => {
  it('renders Brush, Marker, Eraser type buttons', () => {
    render(<PaintPanel />);
    expect(screen.getByText('Brush')).toBeInTheDocument();
    expect(screen.getByText('Marker')).toBeInTheDocument();
    expect(screen.getByText('Eraser')).toBeInTheDocument();
  });

  it('brush type buttons are disabled when paint is not active', () => {
    render(<PaintPanel />);
    expect(screen.getByText('Brush')).toBeDisabled();
    expect(screen.getByText('Marker')).toBeDisabled();
    expect(screen.getByText('Eraser')).toBeDisabled();
  });
});

describe('PaintPanel — paint target mode', () => {
  it('renders Canvas Mode and Table Mode buttons', () => {
    render(<PaintPanel />);
    expect(screen.getByText('Canvas Mode')).toBeInTheDocument();
    expect(screen.getByText(/Table Mode/)).toBeInTheDocument();
  });

  it('shows (Unavailable) when engine not available', () => {
    render(<PaintPanel />);
    expect(screen.getByText(/Unavailable/)).toBeInTheDocument();
  });

  it('shows paint-only warning for canvas mode status', () => {
    render(<PaintPanel />);
    // Default paintMode is 'table', but engine is unavailable so table mode shows error
    // The status section should show the "unavailable" message  
    expect(screen.getByText(/WASM table integration unavailable/)).toBeInTheDocument();
  });
});

describe('PaintPanel — template dialog', () => {
  it('Save Template button is disabled when no strokes', () => {
    render(<PaintPanel />);
    const saveTemplateBtn = screen.getByTitle('Save current strokes as template');
    expect(saveTemplateBtn).toBeDisabled();
  });

  it('shows template dialog when Save Template is clicked (active mode with strokes)', () => {
    vi.mocked(usePaintSystem).mockReturnValue([
      { ...defaultPaintState, isActive: true, strokeCount: 2 },
      mockPaintControls,
    ]);
    render(<PaintPanel />);
    fireEvent.click(screen.getByTitle('Save current strokes as template'));
    expect(screen.getByText('Save Paint Template')).toBeInTheDocument();
  });

  it('dismisses template dialog on Cancel', () => {
    vi.mocked(usePaintSystem).mockReturnValue([
      { ...defaultPaintState, isActive: true, strokeCount: 2 },
      mockPaintControls,
    ]);
    render(<PaintPanel />);
    fireEvent.click(screen.getByTitle('Save current strokes as template'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Save Paint Template')).not.toBeInTheDocument();
  });
});
