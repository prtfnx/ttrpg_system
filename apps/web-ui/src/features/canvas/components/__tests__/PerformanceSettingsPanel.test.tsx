import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PerformanceSettingsPanel } from '../PerformanceSettingsPanel';

const { getMetrics } = vi.hoisted(() => ({ getMetrics: vi.fn(() => ({
  averageFPS: 59,
  frameTimeP50: 2.25,
  frameTimeP95: 4.5,
  frameTimeMax: 8,
  spritesDrawn: 75,
  spritesConsidered: 100,
  spritesCulled: 25,
  drawCalls: 80,
  bufferUploads: 90,
  residentTextures: 12,
  activeLights: 4,
  shadowDrawCalls: 3,
  occlusionRevision: 2,
})) }));

vi.mock('@features/canvas', () => ({
  performanceService: { getMetrics },
}));

describe('PerformanceSettingsPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not render while hidden', () => {
    const { container } = render(<PerformanceSettingsPanel isVisible={false} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows renderer-owned diagnostics without fake quality controls', () => {
    render(<PerformanceSettingsPanel isVisible onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Renderer Performance' })).toBeInTheDocument();
    expect(screen.getByText('CPU p95:')).toBeInTheDocument();
    expect(screen.getByText('4.50ms')).toBeInTheDocument();
    expect(screen.getByText('Draw calls:')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /auto optimize/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/frustum culling/i)).not.toBeInTheDocument();
  });

  it('closes through the modal close control', () => {
    const onClose = vi.fn();
    render(<PerformanceSettingsPanel isVisible onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
