import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EntitiesPanel } from '../components/EntitiesPanel';

describe('EntitiesPanel sprite sync', () => {
  it('syncs sprites from the render manager and displays them', async () => {
    // The global rustRenderManager mock in setup.ts provides get_all_sprites_network_data
    (window as any).rustRenderManager.get_all_sprites_network_data = () => [
      { id: 's1', name: 'Goblin', x: 100, y: 150, layer: 'tokens', visible: true },
      { id: 's2', name: 'Orc', x: 200, y: 50, layer: 'tokens', visible: true }
    ];

    render(<EntitiesPanel />);

    // Wait for sync to complete and UI to update
    await waitFor(() => {
      // header includes Entities (N)
      expect(screen.getByRole('heading', { name: /entities \(2\)/i })).toBeInTheDocument();
      expect(screen.getByText('Goblin')).toBeInTheDocument();
      expect(screen.getByText('Orc')).toBeInTheDocument();
    });
  });
});
