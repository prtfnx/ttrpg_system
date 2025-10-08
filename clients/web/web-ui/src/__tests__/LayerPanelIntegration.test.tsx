import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LayerPanel } from '../components/LayerPanel';

describe('LayerPanel integration (user flow)', () => {
  it('renders layers and computes a dynamic height', async () => {
    const { container } = render(<LayerPanel />);

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

    // There should be at least one opacity slider per layer
    const sliders = container.querySelectorAll('input[type="range"].opacity-slider');
    expect(sliders.length).toBeGreaterThan(0);
  });
});
