import type { RenderEngine } from '@lib/wasm/runtime';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { performanceOptimizedBackgroundSystem } from '../../services/performanceOptimizedBackground.service';
import BackgroundManagementPanel from '../BackgroundManagementPanel';

describe('BackgroundManagementPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the default configuration after initialization', async () => {
    vi.spyOn(performanceOptimizedBackgroundSystem, 'initialize').mockResolvedValue();
    vi.spyOn(performanceOptimizedBackgroundSystem, 'loadBackgroundConfiguration').mockResolvedValue();
    vi.spyOn(performanceOptimizedBackgroundSystem, 'setActiveConfiguration').mockResolvedValue();

    render(
      <BackgroundManagementPanel
        isOpen
        onClose={vi.fn()}
        renderEngine={{} as RenderEngine}
      />
    );

    expect(await screen.findByText('Stone Base')).toBeInTheDocument();
    expect(performanceOptimizedBackgroundSystem.loadBackgroundConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'default' })
    );
  });
});
