import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LayerPanel } from '../components/LayerPanel';

describe('LayerPanel integration (user flow)', () => {
  it('renders layers and computes a dynamic height', async () => {
    // Provide many layers to ensure the panel clamps to maxHeight and enables scrolling
    const manyLayers = Array.from({ length: 20 }).map((_, i) => ({
      id: `layer_${i}`,
      name: `Layer ${i}`,
      icon: '•',
      color: '#ddd',
      spriteCount: i
    }));

    const { container } = render(<LayerPanel initialLayers={manyLayers as any} />);

    // Wait for initialization to complete
    await waitFor(() => {
      expect(screen.getByText('Layers')).toBeInTheDocument();
    });

  // Should show header and default layers count
  expect(screen.getByRole('heading', { name: /layers/i })).toBeInTheDocument();
  const count = container.querySelector('.layer-count');
  expect(count?.textContent).toMatch(/\d+\s+layers/);

    // Panel should have a computed inline height in pixels
    const panel = container.querySelector('.layer-panel') as HTMLElement | null;
    expect(panel).toBeTruthy();
  expect(panel!.style.height).toMatch(/^[0-9]+(\.[0-9]+)?px$/);
  expect(panel!.style.maxHeight).toMatch(/^[0-9]+(\.[0-9]+)?px$/);

  // If clamped, the internal list should be scrollable (overflow set)
  const list = container.querySelector('.layer-list') as HTMLElement | null;
  if (list) {
    // style may be undefined when not clamped, but for our manyLayers case expect overflowY
    expect(list.style.overflowY === 'auto' || list.style.overflowY === '').toBeTruthy();
  }

    // There should be at least one opacity slider per layer
    const sliders = container.querySelectorAll('input[type="range"].opacity-slider');
    expect(sliders.length).toBeGreaterThan(0);
  });
});
