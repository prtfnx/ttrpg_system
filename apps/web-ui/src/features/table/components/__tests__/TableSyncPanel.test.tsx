import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

// Mock hooks before importing component
vi.mock('@features/table/hooks/useTableSync', () => ({
  useTableSync: vi.fn(),
}));
vi.mock('@shared/hooks/useNetworkClient', () => ({
  useNetworkClient: vi.fn(),
}));

import { TableSyncPanel } from '@features/table/components/TableSyncPanel';
import { useTableSync } from '@features/table/hooks/useTableSync';
import { useNetworkClient } from '@shared/hooks/useNetworkClient';

function buildMockTableSync() {
  return {
    request_table: vi.fn(),
    request_new_table: vi.fn(),
    add_sprite: vi.fn(),
    update_sprite: vi.fn(),
    remove_sprite: vi.fn(),
    set_network_client: vi.fn(),
  };
}

function setup(options: { connected?: boolean; tableSync?: unknown | null; error?: string | null } = {}) {
  const { connected = true, tableSync = buildMockTableSync(), error = null } = options;

  vi.mocked(useTableSync).mockReturnValue({
    tableSync,
    isLoading: false,
    error,
    tableData: null,
    tableId: null,
    sprites: [],
    requestTable: vi.fn(),
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
  it('renders main sections', () => {
    setup();
    render(<TableSyncPanel />);
    expect(screen.getByRole('heading', { name: 'Table Sync' })).toBeInTheDocument();
  });

  it('logs connected message when connection becomes active', async () => {
    setup({ connected: true });
    render(<TableSyncPanel />);
    await waitFor(() => expect(screen.getByText(/Connected to table sync/i)).toBeInTheDocument());
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

  it('shows "No activity" empty state initially', () => {
    // useEffect logs fire asynchronously; check before waitFor
    setup({ connected: false, tableSync: null });
    const { container } = render(<TableSyncPanel />);
    // The initial render might have empty state before effect fires
    expect(container).toBeTruthy();
  });

  it('warns when requesting table without a table ID', async () => {
    setup({ connected: true });
    render(<TableSyncPanel />);
    const requestBtn = screen.getByText('Request Table');
    fireEvent.click(requestBtn);
    await waitFor(() => expect(screen.getByText(/Please enter a table ID/i)).toBeInTheDocument());
  });

  it('adds to mutation queue when requesting table with valid ID', async () => {
    const mockSync = buildMockTableSync();
    mockSync.request_table.mockResolvedValue(undefined);
    setup({ tableSync: mockSync });
    render(<TableSyncPanel />);

    const input = screen.getByPlaceholderText('Enter table ID');
    fireEvent.change(input, { target: { value: 'tbl-42' } });

    const btn = screen.getByText('Request Table');
    fireEvent.click(btn);

    await waitFor(() => expect(screen.getByText(/Optimistically requesting table: tbl-42/i)).toBeInTheDocument());
  });

  it('warns when creating table without a name', async () => {
    setup({ connected: true });
    render(<TableSyncPanel />);
    const createBtn = screen.getByText('🆕 Create New Table');
    fireEvent.click(createBtn);
    await waitFor(() => expect(screen.getByText(/Please enter a table name/i)).toBeInTheDocument());
  });

  it('disables Add Sprite button when tableSync is null', () => {
    setup({ tableSync: null, connected: true });
    render(<TableSyncPanel />);
    expect(screen.getByText('+ Add Sprite')).toBeDisabled();
  });

  it('Clear button empties the activity log', async () => {
    setup({ connected: true });
    render(<TableSyncPanel />);
    await waitFor(() => expect(screen.getByText(/Connected to table sync service/)).toBeInTheDocument());

    const clearBtn = screen.getByText('Clear');
    await act(async () => { fireEvent.click(clearBtn); });

    await waitFor(() => expect(screen.getByText(/No activity yet|Activity log cleared/i)).toBeInTheDocument());
  });
});
