import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@features/table/hooks/useTableSync', () => ({
  useTableSync: vi.fn(),
}));
vi.mock('@shared/hooks/useNetworkClient', () => ({
  useNetworkClient: vi.fn(),
}));

import { TableSyncPanel } from '@features/table/components/TableSyncPanel';
import { useTableSync } from '@features/table/hooks/useTableSync';
import { useNetworkClient } from '@shared/hooks/useNetworkClient';

const mockRequestTable = vi.fn();

function buildMockTableSync() {
  return {
    request_table: vi.fn(),
    set_network_client: vi.fn(),
  };
}

function setup(options: {
  connected?: boolean;
  tableSync?: unknown | null;
  error?: string | null;
  tableId?: string | null;
  spriteCount?: number;
  tableLoaded?: boolean;
} = {}) {
  const {
    connected = true,
    tableSync = buildMockTableSync(),
    error = null,
    tableId = null,
    spriteCount = 0,
    tableLoaded = false,
  } = options;

  vi.mocked(useTableSync).mockReturnValue({
    tableSync,
    isLoading: false,
    error,
    tableData: tableLoaded ? { table_id: tableId ?? 'tbl-1' } : null,
    tableId,
    sprites: Array.from({ length: spriteCount }, (_, index) => ({ sprite_id: `s${index}` })),
    requestTable: mockRequestTable,
    moveSprite: vi.fn(),
    scaleSprite: vi.fn(),
    rotateSprite: vi.fn(),
    createSprite: vi.fn(),
    deleteSprite: vi.fn(),
    handleNetworkMessage: vi.fn(),
  } as unknown as ReturnType<typeof useTableSync>);

  vi.mocked(useNetworkClient).mockReturnValue({
    client: null,
    networkState: { isConnected: connected, connectionState: connected ? 'connected' : 'disconnected', clientId: '' },
  } as unknown as ReturnType<typeof useNetworkClient>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TableSyncPanel', () => {
  it('renders table sync status and runtime state', () => {
    setup({ tableId: 'tbl-42', spriteCount: 3, tableLoaded: true });

    render(<TableSyncPanel />);

    expect(screen.getByRole('heading', { name: 'Table Sync' })).toBeInTheDocument();
    expect(screen.getByText('tbl-42')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Loaded')).toBeInTheDocument();
  });

  it('logs connected message when connection is active', async () => {
    setup({ connected: true });

    render(<TableSyncPanel />);

    await waitFor(() => expect(screen.getByText(/Connected to table sync service/i)).toBeInTheDocument());
  });

  it('logs disconnected warning when not connected', async () => {
    setup({ connected: false });

    render(<TableSyncPanel />);

    await waitFor(() => expect(screen.getByText(/Disconnected from table sync service/i)).toBeInTheDocument());
  });

  it('logs error when error prop is set', async () => {
    setup({ error: 'Sync failed' });

    render(<TableSyncPanel />);

    await waitFor(() => expect(screen.getByText(/Error: Sync failed/)).toBeInTheDocument());
  });

  it('warns when requesting table without a table ID', async () => {
    setup({ connected: true });
    render(<TableSyncPanel />);

    fireEvent.click(screen.getByText('Request Table'));

    await waitFor(() => expect(screen.getByText(/Please enter a table ID/i)).toBeInTheDocument());
    expect(mockRequestTable).not.toHaveBeenCalled();
  });

  it('requests table through the hook with a valid ID', async () => {
    setup({ connected: true });
    render(<TableSyncPanel />);

    fireEvent.change(screen.getByPlaceholderText('Enter table ID'), { target: { value: 'tbl-42' } });
    fireEvent.click(screen.getByText('Request Table'));

    expect(mockRequestTable).toHaveBeenCalledWith('tbl-42');
    await waitFor(() => expect(screen.getByText(/Requested table: tbl-42/i)).toBeInTheDocument());
  });

  it('disables request button when table sync is unavailable', () => {
    setup({ tableSync: null, connected: true });

    render(<TableSyncPanel />);

    expect(screen.getByText('Request Table')).toBeDisabled();
  });

  it('clears activity log', async () => {
    setup({ connected: true });
    render(<TableSyncPanel />);
    await waitFor(() => expect(screen.getByText(/Connected to table sync service/)).toBeInTheDocument());

    fireEvent.click(screen.getByText('Clear'));

    expect(screen.getByText('No activity yet.')).toBeInTheDocument();
  });
});
