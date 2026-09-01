import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../hooks/useAssetManager', () => ({
  useAssetManager: () => ({
    stats: {
      total_assets: 0,
      total_size: 0,
      cache_hits: 0,
      cache_misses: 0,
    },
    isLoading: false,
    error: null,
    getAssetInfo: vi.fn(),
    removeAsset: vi.fn(),
    performCleanup: vi.fn(),
    clearCache: vi.fn(),
    getAssetList: () => [],
    formatFileSize: () => '0 B',
    getCacheUsagePercentage: () => 0,
    uploadAsset: vi.fn(),
    cancelUpload: vi.fn(),
  }),
}));

import { AssetManager } from '../AssetManager';

const renderAssetManager = (onClose = vi.fn()) => {
  render(
    <AssetManager
      isVisible
      onClose={onClose}
    />,
  );
};

describe('AssetManager', () => {
  it('exposes and focuses a named dialog', () => {
    renderAssetManager();

    expect(screen.getByRole('dialog', { name: 'Asset Manager' })).toHaveFocus();
  });

  it('closes when Escape is pressed', () => {
    const onClose = vi.fn();
    renderAssetManager(onClose);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('marks only the active section button as pressed', () => {
    renderAssetManager();

    expect(screen.getByRole('button', { name: /^cache/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^upload/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps same-named files as distinct upload queue entries', () => {
    render(
      <AssetManager isVisible onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^upload/i }));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const first = new File(['first'], 'map.png', { type: 'image/png' });
    const second = new File(['second'], 'map.png', { type: 'image/png' });

    fireEvent.change(input, { target: { files: [first, second] } });

    expect(screen.getByRole('button', { name: 'Upload (2)' })).toBeInTheDocument();
    expect(screen.getAllByText('map.png')).toHaveLength(2);
  });
});
