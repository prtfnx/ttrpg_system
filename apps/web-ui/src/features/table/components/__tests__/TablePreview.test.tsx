import { useGameStore } from '@/store';
import { createMockWasmRuntime, renderWithWasmRuntime } from '@test/utils/wasmRuntimeTestUtils';
import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const thumbnailMocks = vi.hoisted(() => ({
  configure: vi.fn(),
  setScope: vi.fn(),
  setActiveTable: vi.fn(),
  subscribe: vi.fn(() => vi.fn()),
  getSnapshot: vi.fn(() => ({ source: null, isGenerating: false, error: null, dirty: false })),
  persistedSource: vi.fn((id: string) => `/preview/${id}`),
  ensurePreview: vi.fn(),
}));

vi.mock('../../services/tableThumbnail.service', () => ({
  tableThumbnailService: thumbnailMocks,
}));

import { TablePreview } from '../TablePreview';

const TABLE_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('TablePreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGameStore.setState({
      sessionId: 'SESSION1',
      userId: 12,
      sessionRole: 'owner',
      visibleLayers: ['map', 'tokens'],
      activeTableId: TABLE_ID,
    });
  });

  it('loads the persisted preview lazily when no memory preview exists', () => {
    const { container } = renderWithWasmRuntime(
      <TablePreview table={{ table_id: TABLE_ID, table_name: 'Cave', width: 1000, height: 800 }} priority />,
      createMockWasmRuntime(),
    );

    expect(container.querySelector('img')).toHaveAttribute('src', `/preview/${TABLE_ID}`);
  });

  it('requests capture only after the active table has a committed frame', async () => {
    const runtime = createMockWasmRuntime();
    runtime.store.setSnapshot({ hydratedTableId: TABLE_ID, frameTableId: TABLE_ID });
    renderWithWasmRuntime(
      <TablePreview table={{ table_id: TABLE_ID, table_name: 'Cave', width: 1000, height: 800 }} priority />,
      runtime,
    );

    await waitFor(() => expect(thumbnailMocks.ensurePreview).toHaveBeenCalledWith(TABLE_ID));
  });

  it('does not request capture before the first active frame', async () => {
    const runtime = createMockWasmRuntime();
    runtime.store.setSnapshot({ hydratedTableId: TABLE_ID, frameTableId: null });
    renderWithWasmRuntime(
      <TablePreview table={{ table_id: TABLE_ID, table_name: 'Cave', width: 1000, height: 800 }} priority />,
      runtime,
    );

    await waitFor(() => expect(thumbnailMocks.configure).toHaveBeenCalled());
    expect(thumbnailMocks.ensurePreview).not.toHaveBeenCalled();
  });
});
