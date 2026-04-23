import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../combat/stores/coverStore', () => {
  let _zones: unknown[] = [];
  return {
    useCoverStore: (sel: (s: { zones: unknown[] }) => unknown) => sel({ zones: _zones }),
    _setZones: (z: unknown[]) => { _zones = z; },
  };
});
vi.mock('./CoverOverlay.module.css', () => ({ default: {} }));

import { CoverOverlay } from './CoverOverlay';

describe('CoverOverlay', () => {
  it('renders nothing when no zones', () => {
    const { container } = render(<CoverOverlay canvasWidth={800} canvasHeight={600} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders rect zone when zones present', async () => {
    const { _setZones } = await import('../../combat/stores/coverStore') as never as { _setZones: (z: unknown[]) => void };
    _setZones([{ zone_id: 'z1', shape_type: 'rect', coords: [10, 20, 50, 40], cover_tier: 'half', label: '' }]);
    const { container } = render(<CoverOverlay canvasWidth={800} canvasHeight={600} />);
    const rect = container.querySelector('rect');
    expect(rect).toBeInTheDocument();
  });

  it('renders circle zone', async () => {
    const { _setZones } = await import('../../combat/stores/coverStore') as never as { _setZones: (z: unknown[]) => void };
    _setZones([{ zone_id: 'z2', shape_type: 'circle', coords: [100, 100, 30], cover_tier: 'three_quarters', label: '' }]);
    const { container } = render(<CoverOverlay canvasWidth={800} canvasHeight={600} />);
    const circle = container.querySelector('circle');
    expect(circle).toBeInTheDocument();
  });

  it('renders polygon zone', async () => {
    const { _setZones } = await import('../../combat/stores/coverStore') as never as { _setZones: (z: unknown[]) => void };
    _setZones([{ zone_id: 'z3', shape_type: 'polygon', coords: [[0,0],[50,0],[50,50]], cover_tier: 'full', label: '' }]);
    const { container } = render(<CoverOverlay canvasWidth={800} canvasHeight={600} />);
    const poly = container.querySelector('polygon');
    expect(poly).toBeInTheDocument();
  });
});
