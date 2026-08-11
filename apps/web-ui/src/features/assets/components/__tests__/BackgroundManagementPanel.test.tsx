import type { RenderEngine } from '@lib/wasm/runtime';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { performanceOptimizedBackgroundSystem } from '../../services/performanceOptimizedBackground.service';
import BackgroundManagementPanel from '../BackgroundManagementPanel';

describe('BackgroundManagementPanel', () => {
  beforeEach(() => {
    vi.spyOn(performanceOptimizedBackgroundSystem, 'initialize').mockResolvedValue();
    vi.spyOn(performanceOptimizedBackgroundSystem, 'loadBackgroundConfiguration').mockResolvedValue();
    vi.spyOn(performanceOptimizedBackgroundSystem, 'setActiveConfiguration').mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the default configuration after initialization', async () => {
    render(
      <BackgroundManagementPanel
        isOpen
        onClose={vi.fn()}
        renderEngine={{} as RenderEngine}
      />
    );

    expect(screen.getByRole('dialog', { name: 'Background Management' })).toBeInTheDocument();
    expect(await screen.findByText('Stone Base')).toBeInTheDocument();
    expect(performanceOptimizedBackgroundSystem.loadBackgroundConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'default' })
    );
  });

  it('closes with Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <BackgroundManagementPanel
        isOpen
        onClose={onClose}
        renderEngine={{} as RenderEngine}
      />
    );

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('selects a background layer from the keyboard', async () => {
    const user = userEvent.setup();
    render(
      <BackgroundManagementPanel
        isOpen
        onClose={vi.fn()}
        renderEngine={{} as RenderEngine}
      />
    );

    const layerButton = await screen.findByRole('button', { name: /select stone base layer/i });
    layerButton.focus();
    await user.keyboard('{Enter}');

    expect(layerButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('slider', { name: /opacity/i })).toBeInTheDocument();
  });
});
