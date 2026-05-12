import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SyncBadge } from '../SyncBadge';

const fmtTime = (t?: number) => (t ? `${Math.floor((Date.now() - t) / 60000)}m ago` : '');

describe('SyncBadge', () => {
  it('renders synced status by default', () => {
    const { container } = render(<SyncBadge formatRelativeTime={fmtTime} />);
    expect(container.firstChild).toBeTruthy();
  });

  it('shows synced title with time when status is synced', () => {
    const ts = Date.now() - 60_000;
    const { container } = render(
      <SyncBadge syncStatus="synced" lastSyncTime={ts} formatRelativeTime={fmtTime} />
    );
    expect(container.firstChild).toHaveAttribute('title', expect.stringContaining('Synced'));
  });

  it('shows local title', () => {
    const { container } = render(<SyncBadge syncStatus="local" formatRelativeTime={fmtTime} />);
    expect(container.firstChild).toHaveAttribute('title', 'Local only — not synced');
  });

  it('shows syncing title', () => {
    const { container } = render(<SyncBadge syncStatus="syncing" formatRelativeTime={fmtTime} />);
    expect(container.firstChild).toHaveAttribute('title', 'Syncing...');
  });

  it('shows error title with message', () => {
    const { container } = render(
      <SyncBadge syncStatus="error" syncError="Connection refused" formatRelativeTime={fmtTime} />
    );
    expect(container.firstChild).toHaveAttribute('title', 'Sync error: Connection refused');
  });

  it('uses Unknown as fallback for error without message', () => {
    const { container } = render(<SyncBadge syncStatus="error" formatRelativeTime={fmtTime} />);
    expect(container.firstChild).toHaveAttribute('title', 'Sync error: Unknown');
  });
});
