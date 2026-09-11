import { useGameStore } from '@/store';
import { emitWasmEvent } from '@lib/wasm/wasmEvents';
import { createMockWasmRuntime, renderWithWasmRuntime } from '@test/utils/wasmRuntimeTestUtils';
import { act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const thumbnailMocks = vi.hoisted(() => ({
  setScope: vi.fn(),
  getRenderEngine: vi.fn(),
  initialize: vi.fn(),
  getCachedThumbnail: vi.fn(),
  generateThumbnail: vi.fn(),
  invalidateThumbnail: vi.fn(),
}));

vi.mock('../../services/tableThumbnail.service', () => ({
  tableThumbnailService: thumbnailMocks,
}));

import { TablePreview } from '../TablePreview';

const TABLE_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_TABLE_ID = '550e8400-e29b-41d4-a716-446655440001';

describe('TablePreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    thumbnailMocks.getCachedThumbnail.mockReturnValue(null);
    thumbnailMocks.generateThumbnail.mockResolvedValue(null);
    useGameStore.setState({
      sessionId: 'session-1',
      userId: 12,
      sessionRole: 'player',
      visibleLayers: ['map', 'tokens'],
    });
  });

  it('uses the typed hydration event fields and refreshes only the matching table', async () => {
    const engine = { get_active_table_id: vi.fn(() => TABLE_ID), render: vi.fn() };
    const runtime = createMockWasmRuntime({ getRenderEngine: vi.fn(() => engine as never) });
    runtime.store.setSnapshot({ hydratedTableId: TABLE_ID, frameTableId: TABLE_ID });
    renderWithWasmRuntime(
      <TablePreview table={{ table_id: TABLE_ID, table_name: 'Cave', width: 1000, height: 800 }} />,
      runtime,
    );

    act(() => emitWasmEvent('table-sprites-loaded', { table_id: OTHER_TABLE_ID, count: 3 }));
    expect(thumbnailMocks.invalidateThumbnail).not.toHaveBeenCalled();

    act(() => emitWasmEvent('table-sprites-loaded', { table_id: TABLE_ID, count: 4 }));
    await waitFor(() => {
      expect(thumbnailMocks.invalidateThumbnail).toHaveBeenCalledWith(TABLE_ID, 160, 120);
      expect(thumbnailMocks.generateThumbnail).toHaveBeenCalled();
    });
  });

  it('does not capture an active table before its first rendered frame', async () => {
    const engine = { get_active_table_id: vi.fn(() => TABLE_ID), render: vi.fn() };
    const runtime = createMockWasmRuntime({ getRenderEngine: vi.fn(() => engine as never) });
    runtime.store.setSnapshot({ hydratedTableId: TABLE_ID, frameTableId: null });
    renderWithWasmRuntime(
      <TablePreview table={{ table_id: TABLE_ID, table_name: 'Cave', width: 1000, height: 800 }} />,
      runtime,
    );

    await waitFor(() => expect(thumbnailMocks.getCachedThumbnail).toHaveBeenCalled());
    expect(thumbnailMocks.generateThumbnail).not.toHaveBeenCalled();
  });
});
