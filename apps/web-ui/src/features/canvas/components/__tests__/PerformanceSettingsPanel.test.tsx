import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PerformanceSettingsPanel } from '../PerformanceSettingsPanel';

const mockSettings = {
  level: 'medium',
  maxSprites: 250,
  textureQuality: 0.75,
  shadowQuality: 1,
  maxRenderDistance: 1000,
  enableVSync: true,
  enableSpritePooling: true,
  enableTextureCaching: true,
  enableFrustumCulling: true,
};

const mockMetrics = {
  fps: 60,
  averageFPS: 55,
  frameTime: 16,
  averageFrameTime: 17,
  currentFPS: 60,
  spriteCount: 120,
  renderTime: 10,
  textureCount: 5,
  renderCalls: 10,
  cacheHitRate: 0.9,
  networkLatency: 20,
  wasmMemoryUsage: 10,
  memoryUsage: { usedJSHeapSize: 50 * 1024 * 1024, totalJSHeapSize: 100 * 1024 * 1024, jsHeapSizeLimit: 200 * 1024 * 1024 },
};

vi.mock('@features/canvas', () => ({
  PerformanceLevel: {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    ULTRA: 'ultra',
  },
  performanceService: {
    getSettings: vi.fn(() => ({ ...mockSettings })),
    updateSettings: vi.fn(),
    getMetrics: vi.fn(() => ({ ...mockMetrics })),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PerformanceSettingsPanel', () => {
  it('renders nothing when isVisible is false', () => {
    const { container } = render(<PerformanceSettingsPanel isVisible={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders settings panel when visible', () => {
    render(<PerformanceSettingsPanel isVisible={true} onClose={vi.fn()} />);
    expect(screen.getByText('Performance Settings')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<PerformanceSettingsPanel isVisible={true} onClose={onClose} />);
    fireEvent.click(screen.getByText('×'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows max sprites value', () => {
    render(<PerformanceSettingsPanel isVisible={true} onClose={vi.fn()} />);
    expect(screen.getByText(/Max Sprites/)).toBeInTheDocument();
  });

  it('Apply Changes button is disabled initially (no changes)', () => {
    render(<PerformanceSettingsPanel isVisible={true} onClose={vi.fn()} />);
    expect(screen.getByText('Apply Changes')).toBeDisabled();
  });

  it('Reset button is disabled initially (no changes)', () => {
    render(<PerformanceSettingsPanel isVisible={true} onClose={vi.fn()} />);
    expect(screen.getByText('Reset')).toBeDisabled();
  });

  it('Apply Changes calls performanceService.updateSettings', async () => {
    const { performanceService } = await import('@features/canvas');
    render(<PerformanceSettingsPanel isVisible={true} onClose={vi.fn()} />);
    // Change level to trigger hasChanges
    const select = screen.getAllByRole('combobox')[0];
    fireEvent.change(select, { target: { value: 'low' } });
    fireEvent.click(screen.getByText('Apply Changes'));
    expect(performanceService.updateSettings).toHaveBeenCalled();
  });

  it('Reset button resets changes', () => {
    render(<PerformanceSettingsPanel isVisible={true} onClose={vi.fn()} />);
    const select = screen.getAllByRole('combobox')[0];
    fireEvent.change(select, { target: { value: 'low' } });
    expect(screen.getByText('Reset')).not.toBeDisabled();
    fireEvent.click(screen.getByText('Reset'));
    expect(screen.getByText('Reset')).toBeDisabled();
  });

  it('Auto Optimize button exists', () => {
    render(<PerformanceSettingsPanel isVisible={true} onClose={vi.fn()} />);
    expect(screen.getByText('Auto Optimize')).toBeInTheDocument();
  });
});
