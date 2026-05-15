import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTableManagement } from '../useTableManagement';

vi.mock('@features/table/services/tableThumbnail.service', () => ({
  tableThumbnailService: {
    getRenderEngine: vi.fn().mockReturnValue(null),
    generateThumbnail: vi.fn().mockResolvedValue(null),
    getCacheStats: vi.fn().mockReturnValue({ size: 0, tables: [] }),
  },
}));

const mockTables = [
  { table_id: 't1', table_name: 'Alpha', width: 2000, height: 2000, syncStatus: 'synced' as const, created_at: '2024-01-01' },
  { table_id: 't2', table_name: 'Beta', width: 1000, height: 1000, syncStatus: 'synced' as const, created_at: '2024-02-01' },
  { table_id: 't3', table_name: 'Gamma', width: 3000, height: 3000, syncStatus: 'local' as const, created_at: '2024-03-01' },
];

const mockStore = {
  tables: mockTables,
  activeTableId: 't1',
  tablesLoading: false,
  setTables: vi.fn(),
  setTablesLoading: vi.fn(),
  requestTableList: vi.fn(),
  createNewTable: vi.fn(),
  deleteTable: vi.fn(),
  switchToTable: vi.fn(),
};

vi.mock('@/store', () => ({
  useGameStore: Object.assign(
    vi.fn(() => mockStore),
    { getState: vi.fn(() => ({ tables: mockTables })) }
  ),
}));

import { useGameStore } from '@/store';

beforeEach(() => {
  vi.clearAllMocks();
  (useGameStore as ReturnType<typeof vi.fn>).mockReturnValue(mockStore);
  (useGameStore as ReturnType<typeof vi.fn> & { getState: ReturnType<typeof vi.fn> }).getState.mockReturnValue({
    tables: mockTables,
  });
  vi.stubGlobal('alert', vi.fn());
  vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
});

describe('useTableManagement initial state', () => {
  it('exposes tables and activeTableId from store', () => {
    const { result } = renderHook(() => useTableManagement());
    expect(result.current.tables).toBe(mockTables);
    expect(result.current.activeTableId).toBe('t1');
  });

  it('starts with showCreateForm=false', () => {
    const { result } = renderHook(() => useTableManagement());
    expect(result.current.showCreateForm).toBe(false);
  });

  it('requests table list on mount when tables is empty', () => {
    (useGameStore as ReturnType<typeof vi.fn>).mockReturnValue({ ...mockStore, tables: [] });
    renderHook(() => useTableManagement());
    expect(mockStore.requestTableList).toHaveBeenCalled();
  });

  it('does not request table list if tables already loaded', () => {
    renderHook(() => useTableManagement());
    expect(mockStore.requestTableList).not.toHaveBeenCalled();
  });
});

describe('handleCreateTable', () => {
  it('alerts when name is empty', () => {
    const { result } = renderHook(() => useTableManagement());
    act(() => result.current.handleCreateTable());
    expect(alert).toHaveBeenCalledWith('Table name is required');
    expect(mockStore.createNewTable).not.toHaveBeenCalled();
  });

  it('calls createNewTable with trimmed name and dimensions', () => {
    const { result } = renderHook(() => useTableManagement());
    act(() => result.current.setNewTableName('  My Table  '));
    act(() => result.current.setNewTableWidth(3000));
    act(() => result.current.setNewTableHeight(1500));
    act(() => result.current.handleCreateTable());
    expect(mockStore.createNewTable).toHaveBeenCalledWith('My Table', 3000, 1500);
  });
});

describe('handleDeleteTable / confirmDeleteTable', () => {
  it('sets deleteConfirmId on handleDeleteTable', () => {
    const { result } = renderHook(() => useTableManagement());
    act(() => result.current.handleDeleteTable('t2'));
    expect(result.current.deleteConfirmId).toBe('t2');
  });

  it('calls deleteTable on confirmDeleteTable', () => {
    const { result } = renderHook(() => useTableManagement());
    act(() => result.current.handleDeleteTable('t2'));
    act(() => result.current.confirmDeleteTable());
    expect(mockStore.deleteTable).toHaveBeenCalledWith('t2');
  });

  it('does nothing on confirmDeleteTable when no deleteConfirmId', () => {
    const { result } = renderHook(() => useTableManagement());
    act(() => result.current.confirmDeleteTable());
    expect(mockStore.deleteTable).not.toHaveBeenCalled();
  });
});

describe('handleTableSelect', () => {
  it('calls switchToTable with given id', () => {
    const { result } = renderHook(() => useTableManagement());
    act(() => result.current.handleTableSelect('t3'));
    expect(mockStore.switchToTable).toHaveBeenCalledWith('t3');
  });
});

describe('settings management', () => {
  it('handleOpenSettings populates settings state', () => {
    const { result } = renderHook(() => useTableManagement());
    act(() => result.current.handleOpenSettings('t2'));
    expect(result.current.settingsTableId).toBe('t2');
    expect(result.current.settingsName).toBe('Beta');
    expect(result.current.settingsWidth).toBe(1000);
    expect(result.current.settingsHeight).toBe(1000);
  });

  it('handleOpenSettings does nothing for unknown tableId', () => {
    const { result } = renderHook(() => useTableManagement());
    act(() => result.current.handleOpenSettings('nonexistent'));
    expect(result.current.settingsTableId).toBeNull();
  });

  it('handleCloseSettings clears settingsTableId', () => {
    const { result } = renderHook(() => useTableManagement());
    act(() => result.current.handleOpenSettings('t1'));
    act(() => result.current.handleCloseSettings());
    expect(result.current.settingsTableId).toBeNull();
  });

  it('handleSaveSettings dispatches events and clears settingsTableId', () => {
    const eventSpy = vi.spyOn(window, 'dispatchEvent');
    const { result } = renderHook(() => useTableManagement());
    act(() => result.current.handleOpenSettings('t2'));
    act(() => result.current.handleSaveSettings());
    expect(eventSpy).toHaveBeenCalled();
    // After save, settingsTableId cleared
    expect(result.current.settingsTableId).toBeNull();
  });

  it('handleSaveSettings does nothing when no settingsTableId', () => {
    const eventSpy = vi.spyOn(window, 'dispatchEvent');
    const { result } = renderHook(() => useTableManagement());
    act(() => result.current.handleSaveSettings());
    expect(eventSpy).not.toHaveBeenCalled();
  });
});

describe('filteredAndSortedTables', () => {
  it('returns all tables when no search query', () => {
    const { result } = renderHook(() => useTableManagement());
    expect(result.current.filteredAndSortedTables).toHaveLength(3);
  });

  it('filters by name search', () => {
    const { result } = renderHook(() => useTableManagement());
    act(() => result.current.setSearchQuery('alpha'));
    expect(result.current.filteredAndSortedTables).toHaveLength(1);
    expect(result.current.filteredAndSortedTables[0].table_id).toBe('t1');
  });

  it('sorts by name ascending (default)', () => {
    const { result } = renderHook(() => useTableManagement());
    const names = result.current.filteredAndSortedTables.map(t => t.table_name);
    expect(names).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('sorts by name descending', () => {
    const { result } = renderHook(() => useTableManagement());
    act(() => result.current.setSortOrder('desc'));
    const names = result.current.filteredAndSortedTables.map(t => t.table_name);
    expect(names).toEqual(['Gamma', 'Beta', 'Alpha']);
  });

  it('sorts by size ascending', () => {
    const { result } = renderHook(() => useTableManagement());
    act(() => result.current.setSortBy('size'));
    const ids = result.current.filteredAndSortedTables.map(t => t.table_id);
    expect(ids[0]).toBe('t2'); // 1000*1000 is smallest
    expect(ids[2]).toBe('t3'); // 3000*3000 is largest
  });

  it('sorts by date descending (newest first when asc)', () => {
    const { result } = renderHook(() => useTableManagement());
    act(() => result.current.setSortBy('date'));
    const ids = result.current.filteredAndSortedTables.map(t => t.table_id);
    expect(ids[0]).toBe('t3'); // newest created_at
  });
});

describe('table selection', () => {
  it('toggleTableSelection adds and removes table from selection', () => {
    const { result } = renderHook(() => useTableManagement());
    act(() => result.current.toggleTableSelection('t1'));
    expect(result.current.selectedTables.has('t1')).toBe(true);
    act(() => result.current.toggleTableSelection('t1'));
    expect(result.current.selectedTables.has('t1')).toBe(false);
  });

  it('toggleSelectAll selects all when none selected', () => {
    const { result } = renderHook(() => useTableManagement());
    act(() => result.current.toggleSelectAll());
    expect(result.current.selectedTables.size).toBe(3);
  });

  it('toggleSelectAll deselects all when all selected', () => {
    const { result } = renderHook(() => useTableManagement());
    act(() => result.current.toggleSelectAll()); // select all
    act(() => result.current.toggleSelectAll()); // deselect all
    expect(result.current.selectedTables.size).toBe(0);
  });
});

describe('bulk operations', () => {
  it('handleBulkDelete does nothing when nothing selected', () => {
    const { result } = renderHook(() => useTableManagement());
    act(() => result.current.handleBulkDelete());
    expect(mockStore.deleteTable).not.toHaveBeenCalled();
  });

  it('handleBulkDelete calls deleteTable for each selected', () => {
    const { result } = renderHook(() => useTableManagement());
    act(() => result.current.toggleTableSelection('t1'));
    act(() => result.current.toggleTableSelection('t2'));
    act(() => result.current.handleBulkDelete());
    expect(mockStore.deleteTable).toHaveBeenCalledTimes(2);
    expect(result.current.selectedTables.size).toBe(0);
    expect(result.current.bulkMode).toBe(false);
  });

  it('handleBulkDuplicate duplicates all selected tables', () => {
    const { result } = renderHook(() => useTableManagement());
    act(() => result.current.toggleTableSelection('t1'));
    act(() => result.current.handleBulkDuplicate());
    expect(mockStore.createNewTable).toHaveBeenCalledWith('Alpha (Copy)', 2000, 2000);
    expect(result.current.selectedTables.size).toBe(0);
  });
});

describe('applyTemplate', () => {
  it('sets width and height from template', () => {
    const { result } = renderHook(() => useTableManagement());
    act(() => result.current.applyTemplate('large'));
    expect(result.current.newTableWidth).toBe(4000);
    expect(result.current.newTableHeight).toBe(4000);
  });

  it('applies small template', () => {
    const { result } = renderHook(() => useTableManagement());
    act(() => result.current.applyTemplate('small'));
    expect(result.current.newTableWidth).toBe(1000);
    expect(result.current.newTableHeight).toBe(1000);
  });
});

describe('window event listeners', () => {
  it('table-list-updated event updates tables via setTables', () => {
    renderHook(() => useTableManagement());
    act(() => {
      window.dispatchEvent(new CustomEvent('table-list-updated', {
        detail: {
          tables: {
            'srv-1': { table_name: 'Server Table', width: 2000, height: 2000 }
          }
        }
      }));
    });
    expect(mockStore.setTables).toHaveBeenCalled();
    expect(mockStore.setTablesLoading).toHaveBeenCalledWith(false);
  });

  it('table-deleted event requests table list refresh', () => {
    renderHook(() => useTableManagement());
    act(() => {
      window.dispatchEvent(new CustomEvent('table-deleted'));
    });
    expect(mockStore.requestTableList).toHaveBeenCalled();
  });

  it('protocol-connected event requests table list', () => {
    renderHook(() => useTableManagement());
    act(() => {
      window.dispatchEvent(new CustomEvent('protocol-connected'));
    });
    expect(mockStore.requestTableList).toHaveBeenCalled();
  });

  it('new-table-response with local_table_id merges and resets form', () => {
    (useGameStore as ReturnType<typeof vi.fn> & { getState: ReturnType<typeof vi.fn> }).getState.mockReturnValue({
      tables: [{ table_id: 'local-123', table_name: 'Draft', width: 2000, height: 2000, syncStatus: 'local' }],
    });
    renderHook(() => useTableManagement());
    act(() => {
      window.dispatchEvent(new CustomEvent('new-table-response', {
        detail: {
          local_table_id: 'local-123',
          table_data: { id: 'srv-99', table_name: 'Draft', width: 2000, height: 2000 }
        }
      }));
    });
    expect(mockStore.setTables).toHaveBeenCalled();
  });
});
