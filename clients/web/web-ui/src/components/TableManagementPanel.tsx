import clsx from 'clsx';
import React, { useEffect, useState } from 'react';
import type { TableInfo } from '../store';
import { useGameStore } from '../store';
import styles from './TableManagementPanel.module.css';
import { TablePreview } from './TablePreview';

export const TableManagementPanel: React.FC = () => {
  const {
    tables,
    activeTableId,
    tablesLoading,
    setTables,
    setTablesLoading,
    requestTableList,
    createNewTable,
    deleteTable,
    switchToTable,
    syncTableToServer
  } = useGameStore();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [newTableWidth, setNewTableWidth] = useState(2000);
  const [newTableHeight, setNewTableHeight] = useState(2000);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  // Settings modal state
  const [settingsTableId, setSettingsTableId] = useState<string | null>(null);
  const [settingsName, setSettingsName] = useState('');
  const [settingsWidth, setSettingsWidth] = useState(2000);
  const [settingsHeight, setSettingsHeight] = useState(2000);
  const [settingsGridSize, setSettingsGridSize] = useState(50);
  const [settingsGridEnabled, setSettingsGridEnabled] = useState(true);

  // Filter and search state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // Auto-sync settings
  const [autoSync, setAutoSync] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  // NEW: Bulk selection
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);

  // NEW: Table templates
  const TABLE_TEMPLATES = {
    small: { width: 1000, height: 1000, label: 'Small (1000×1000)' },
    medium: { width: 2000, height: 2000, label: 'Medium (2000×2000)' },
    large: { width: 4000, height: 4000, label: 'Large (4000×4000)' },
    huge: { width: 8000, height: 8000, label: 'Huge (8000×8000)' },
  };

  // Listen for protocol events
  useEffect(() => {
    const handleTableListUpdate = (event: Event) => {
      const customEvent = event as CustomEvent;
      const data = customEvent.detail;
      
      if (data.tables) {
        // Convert object format to array format
        const serverTables = Object.entries(data.tables).map(([id, tableData]: [string, any]) => ({
          table_id: id,  // Use table_id instead of id to match TableInfo interface
          ...tableData,
          syncStatus: 'synced' as const, // Server tables are synced
          lastSyncTime: Date.now()
        }));
        
        console.log('Server tables received:', serverTables);
        
        // BEST PRACTICE: Merge with local WASM tables instead of replacing
        // This implements optimistic UI updates - local tables persist until explicitly synced
        
        // CRITICAL: Get fresh state from store to avoid stale closure
        const currentTables = useGameStore.getState().tables;
        console.log('Current tables in store:', currentTables.length);
        
        // Filter local-only tables (not in server response and marked as local)
        const localTables = currentTables.filter((t: TableInfo) => {
          const isInServerList = serverTables.some(st => st.table_id === t.table_id);
          const isLocal = t.syncStatus === 'local' || t.syncStatus === 'syncing';
          const shouldKeep = !isInServerList && isLocal;
          console.log(`Table ${t.table_id} (${t.table_name}): inServer=${isInServerList}, isLocal=${isLocal}, keep=${shouldKeep}`);
          return shouldKeep;
        });
        
        console.log('Merging: local tables =', localTables.length, 'server tables =', serverTables.length);
        
        // Merge: server tables first (authoritative), then local-only tables
        const mergedTables = [...serverTables, ...localTables];
        console.log('Merged table list:', mergedTables.length, 'tables');
        
        setTables(mergedTables);
      }
      setTablesLoading(false);
    };

    const handleTableCreated = (event: Event) => {
      const customEvent = event as CustomEvent;
      const responseData = customEvent.detail;
      console.log('Table created (server response):', responseData);
      
      // BEST PRACTICE: Handle sync completion
      // Check if this is a response to a local table sync
      const localTableId = responseData.local_table_id;
      const serverTableData = responseData.table_data;
      
      if (localTableId && serverTableData) {
        // This is a sync response - update local table with server data
        console.log('Sync completed: local ID', localTableId, '→ server ID', serverTableData.id || serverTableData.table_id);
        
        // CRITICAL: Get fresh tables from store to avoid stale closure
        const currentTables = useGameStore.getState().tables;
        console.log('Updating tables - current count:', currentTables.length);
        
        const updated: TableInfo[] = currentTables.map((t: TableInfo): TableInfo => {
          if (t.table_id === localTableId) {
            console.log('Found local table to update:', t.table_id);
            // Replace local table with server version
            return {
              ...t,
              table_id: serverTableData.id || serverTableData.table_id || t.table_id,
              table_name: serverTableData.table_name || t.table_name,
              width: serverTableData.width || t.width,
              height: serverTableData.height || t.height,
              syncStatus: 'synced' as const,
              lastSyncTime: Date.now(),
              syncError: undefined
            } as TableInfo;
          }
          return t;
        });
        
        console.log('Updated tables count:', updated.length);
        setTables(updated);
      } else {
        // Normal table creation - refresh list from server
        requestTableList();
      }
      
      setShowCreateForm(false);
      setNewTableName('');
    };

    const handleTableDeleted = (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log('Table deleted:', customEvent.detail);
      // Refresh table list after deletion
      requestTableList();
      setDeleteConfirmId(null);
    };

    const handleProtocolConnected = () => {
      // Automatically load tables when protocol connects
      requestTableList();
    };

    window.addEventListener('table-list-updated', handleTableListUpdate);
    window.addEventListener('new-table-response', handleTableCreated);
    window.addEventListener('table-deleted', handleTableDeleted);
    window.addEventListener('protocol-connected', handleProtocolConnected);

    return () => {
      window.removeEventListener('table-list-updated', handleTableListUpdate);
      window.removeEventListener('new-table-response', handleTableCreated);
      window.removeEventListener('table-deleted', handleTableDeleted);
      window.removeEventListener('protocol-connected', handleProtocolConnected);
    };
  }, [setTables, setTablesLoading, requestTableList]);

  const handleCreateTable = () => {
    if (!newTableName.trim()) {
      alert('Table name is required');
      return;
    }
    
    createNewTable(newTableName.trim(), newTableWidth, newTableHeight);
  };

  const handleDeleteTable = (tableId: string) => {
    setDeleteConfirmId(tableId);
  };

  const confirmDeleteTable = () => {
    if (deleteConfirmId) {
      deleteTable(deleteConfirmId);
    }
  };

  const handleTableSelect = (tableId: string) => {
    console.log('Switching to table:', tableId);
    switchToTable(tableId);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return 'Unknown';
    }
  };

  const formatRelativeTime = (timestamp?: number) => {
    if (!timestamp) return '';
    const now = Date.now();
    const diff = now - timestamp;
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const handleOpenSettings = (tableId: string) => {
    const table = tables.find(t => t.table_id === tableId);
    if (table) {
      setSettingsTableId(tableId);
      setSettingsName(table.table_name);
      setSettingsWidth(table.width);
      setSettingsHeight(table.height);
      setSettingsGridSize(50); // Default, would need to be stored in TableInfo
      setSettingsGridEnabled(true); // Default, would need to be stored in TableInfo
    }
  };

  const handleCloseSettings = () => {
    setSettingsTableId(null);
  };

  const handleSaveSettings = () => {
    if (!settingsTableId) return;
    
    // Send update message to server with proper structure
    window.dispatchEvent(new CustomEvent('protocol-send-message', {
      detail: {
        type: 'table_update',
        data: {
          category: 'table',
          type: 'table_update',
          data: {
            table_id: settingsTableId,
            table_name: settingsName,
            width: settingsWidth,
            height: settingsHeight,
            grid_size: settingsGridSize,
            grid_enabled: settingsGridEnabled
          }
        }
      }
    }));

    // Update local state optimistically
    setTables(tables.map(t => 
      t.table_id === settingsTableId 
        ? { ...t, table_name: settingsName, width: settingsWidth, height: settingsHeight }
        : t
    ));

    // If this is the active table, immediately update WASM rendering with new dimensions
    if (activeTableId === settingsTableId) {
      console.log('Updating WASM table data with new settings:', {
        width: settingsWidth,
        height: settingsHeight,
        grid_size: settingsGridSize,
        grid_enabled: settingsGridEnabled
      });
      
      // Create updated table data structure for WASM rendering
      const updatedTableDataForWasm = {
        table_data: {
          table_id: settingsTableId,
          table_name: settingsName,
          width: settingsWidth,
          height: settingsHeight,
          grid_size: settingsGridSize,
          grid_enabled: settingsGridEnabled,
          grid_snapping: false,
          layers: {
            map: [],
            tokens: [],
            dungeon_master: [],
            light: [],
            height: [],
            obstacles: [],
            fog_of_war: []
          }
        }
      };
      
      // Immediately dispatch to WASM for rendering update
      window.dispatchEvent(new CustomEvent('table-data-received', {
        detail: updatedTableDataForWasm
      }));
      
      // Also request fresh table data from server (will include entities)
      console.log('Requesting full table data from server for:', settingsTableId);
      window.dispatchEvent(new CustomEvent('protocol-send-message', {
        detail: {
          type: 'table_request',
          data: {
            table_id: settingsTableId
          }
        }
      }));
    }

    // Refresh table list after a short delay to get updated data from server
    setTimeout(() => {
      requestTableList();
    }, 500);

    setSettingsTableId(null);
  };

  // Filter and sort tables
  const filteredAndSortedTables = React.useMemo(() => {
    let filtered = tables;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(t => 
        (t.table_name || '').toLowerCase().includes(query) ||
        (t.table_id || '').toLowerCase().includes(query)
      );
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          const nameA = a.table_name || '';
          const nameB = b.table_name || '';
          comparison = nameA.localeCompare(nameB);
          break;
        case 'date':
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          comparison = dateB - dateA; // Newest first by default
          break;
        case 'size':
          const sizeA = (a.width || 0) * (a.height || 0);
          const sizeB = (b.width || 0) * (b.height || 0);
          comparison = sizeA - sizeB;
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [tables, searchQuery, sortBy, sortOrder]);

  // Handle duplicate table
  const handleDuplicateTable = (tableId: string) => {
    const table = tables.find(t => t.table_id === tableId);
    if (table) {
      const newName = `${table.table_name} (Copy)`;
      createNewTable(newName, table.width, table.height);
    }
  };

  // NEW: Bulk operations
  const toggleTableSelection = (tableId: string) => {
    const newSelection = new Set(selectedTables);
    if (newSelection.has(tableId)) {
      newSelection.delete(tableId);
    } else {
      newSelection.add(tableId);
    }
    setSelectedTables(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedTables.size === filteredAndSortedTables.length) {
      setSelectedTables(new Set());
    } else {
      setSelectedTables(new Set(filteredAndSortedTables.map(t => t.table_id)));
    }
  };

  const handleBulkDelete = () => {
    if (selectedTables.size === 0) return;
    if (!confirm(`Delete ${selectedTables.size} table(s)?`)) return;
    
    selectedTables.forEach(tableId => {
      deleteTable(tableId);
    });
    setSelectedTables(new Set());
    setBulkMode(false);
  };

  const handleBulkDuplicate = () => {
    if (selectedTables.size === 0) return;
    
    selectedTables.forEach(tableId => {
      handleDuplicateTable(tableId);
    });
    setSelectedTables(new Set());
  };

  // NEW: Export/Import
  const handleExportTable = (tableId: string) => {
    const table = tables.find(t => t.table_id === tableId);
    if (!table) return;

    const exportData = {
      table_name: table.table_name,
      width: table.width,
      height: table.height,
      exported_at: new Date().toISOString(),
      version: '1.0'
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${table.table_name || 'table'}_export.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportTable = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (!data.table_name || !data.width || !data.height) {
          alert('Invalid table export file');
          return;
        }

        createNewTable(
          `${data.table_name} (Imported)`,
          data.width,
          data.height
        );
      } catch (err) {
        alert('Failed to import table: ' + err);
      }
    };
    input.click();
  };

  // NEW: Apply template
  const applyTemplate = (templateKey: keyof typeof TABLE_TEMPLATES) => {
    const template = TABLE_TEMPLATES[templateKey];
    setNewTableWidth(template.width);
    setNewTableHeight(template.height);
  };

  return (
    <div className={styles.tableManagementPanel}>
      <div className={styles.panelHeader}>
        <h3>Table Management</h3>
        <div className={styles.headerActions}>
          <button 
            onClick={() => setBulkMode(!bulkMode)}
            className={clsx(styles.bulkModeButton, bulkMode && styles.active)}
            title="Bulk select mode"
          >
            {bulkMode ? '☑' : '☐'}
          </button>
          <button 
            onClick={handleImportTable}
            className={styles.importButton}
            title="Import table"
          >
            📥
          </button>
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={clsx(styles.settingsToggleButton, showSettings && styles.active)}
            title="Panel settings"
          >
            ⚙️
          </button>
          <button 
            onClick={requestTableList}
            disabled={tablesLoading}
            className={styles.refreshButton}
            title="Refresh table list"
          >
            {tablesLoading ? '⟳' : '↻'}
          </button>
          <button 
            onClick={() => setShowCreateForm(!showCreateForm)}
            className={styles.createButton}
            title="Create new table"
          >
            +
          </button>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {bulkMode && selectedTables.size > 0 && (
        <div className={styles.bulkActionsBar}>
          <span className={styles.bulkCount}>{selectedTables.size} selected</span>
          <div className={styles.bulkButtons}>
            <button 
              onClick={handleBulkDuplicate}
              className={styles.bulkDuplicateButton}
              title="Duplicate selected"
            >
              📋 Duplicate
            </button>
            <button 
              onClick={handleBulkDelete}
              className={styles.bulkDeleteButton}
              title="Delete selected"
            >
              🗑️ Delete
            </button>
          </div>
        </div>
      )}

      {/* Panel Settings */}
      {showSettings && (
        <div className={styles.panelSettings}>
          <div className={styles.settingsRow}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={autoSync}
                onChange={(e) => setAutoSync(e.target.checked)}
              />
              <span>Auto-sync local tables</span>
            </label>
            <span className={styles.helpText}>Automatically sync new tables to server</span>
          </div>
        </div>
      )}

      {/* Search and Filter Bar */}
      <div className={styles.searchFilterBar}>
        {bulkMode && (
          <label className={styles.selectAllCheckbox}>
            <input
              type="checkbox"
              checked={selectedTables.size === filteredAndSortedTables.length && filteredAndSortedTables.length > 0}
              onChange={toggleSelectAll}
              title="Select all"
            />
            <span>All</span>
          </label>
        )}
        <div className={styles.searchBox}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tables..."
            className={styles.searchInput}
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="clear-search"
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>
        <div className="sort-controls">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'name' | 'date' | 'size')}
            className="sort-select"
          >
            <option value="name">Name</option>
            <option value="date">Date</option>
            <option value="size">Size</option>
          </select>
          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="sort-order-button"
            title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
        <div className="table-count">
          {filteredAndSortedTables.length} / {tables.length}
        </div>
      </div>

      {showCreateForm && (
        <div className="create-table-form">
          <h4>Create New Table</h4>
          
          {/* Template buttons */}
          <div className="template-buttons">
            <span className="template-label">Quick Templates:</span>
            <button onClick={() => applyTemplate('small')} className="template-button">
              Small (1000×1000)
            </button>
            <button onClick={() => applyTemplate('medium')} className="template-button">
              Medium (2000×2000)
            </button>
            <button onClick={() => applyTemplate('large')} className="template-button">
              Large (4000×4000)
            </button>
            <button onClick={() => applyTemplate('huge')} className="template-button">
              Huge (8000×8000)
            </button>
          </div>

          <div className="form-row">
            <label>
              Name:
              <input
                type="text"
                value={newTableName}
                onChange={(e) => setNewTableName(e.target.value)}
                placeholder="Enter table name"
                maxLength={50}
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Width:
              <input
                type="number"
                value={newTableWidth}
                onChange={(e) => setNewTableWidth(parseInt(e.target.value) || 2000)}
                min="500"
                max="10000"
                step="100"
              />
            </label>
            <label>
              Height:
              <input
                type="number"
                value={newTableHeight}
                onChange={(e) => setNewTableHeight(parseInt(e.target.value) || 2000)}
                min="500"
                max="10000"
                step="100"
              />
            </label>
          </div>
          <div className="form-actions">
            <button onClick={handleCreateTable} className="confirm-button">
              Create Table
            </button>
            <button 
              onClick={() => setShowCreateForm(false)} 
              className="cancel-button"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="tables-list">
        {tablesLoading && <div className="loading-indicator">Loading tables...</div>}
        
        {!tablesLoading && filteredAndSortedTables.length === 0 && tables.length === 0 && (
          <div className={styles.emptyState}>
            <p>No tables available</p>
            <p>Create a new table to get started</p>
          </div>
        )}

        {!tablesLoading && filteredAndSortedTables.length === 0 && tables.length > 0 && (
          <div className={styles.emptyState}>
            <p>No tables match your search</p>
            <p>Try a different search term</p>
          </div>
        )}

        {!tablesLoading && filteredAndSortedTables.map((table) => (
          <div 
            key={table.table_id} 
            className={`table-card ${activeTableId === table.table_id ? 'active' : ''} ${bulkMode ? 'bulk-mode' : ''} ${selectedTables.has(table.table_id) ? 'selected' : ''}`}
          >
            {/* Bulk Selection Checkbox */}
            {bulkMode && (
              <div className="bulk-checkbox-wrapper">
                <input
                  type="checkbox"
                  checked={selectedTables.has(table.table_id)}
                  onChange={() => toggleTableSelection(table.table_id)}
                  className="bulk-checkbox"
                />
              </div>
            )}

            {/* Sync Status Badge */}
            <div 
              className={`sync-badge sync-badge-${table.syncStatus || 'synced'}`}
              title={
                table.syncStatus === 'local' ? 'Local only - not synced to server' :
                table.syncStatus === 'syncing' ? 'Syncing with server...' :
                table.syncStatus === 'synced' ? `Synced ${formatRelativeTime(table.lastSyncTime)}` :
                table.syncStatus === 'error' ? `Sync error: ${table.syncError || 'Unknown error'}` :
                'Synced with server'
              }
            >
              {table.syncStatus === 'local' && '💾'}
              {table.syncStatus === 'syncing' && '🔄'}
              {table.syncStatus === 'synced' && '☁️'}
              {table.syncStatus === 'error' && '⚠️'}
              {!table.syncStatus && '☁️'}
            </div>

            {/* Table Preview */}
            <div 
              className="table-preview" 
              onClick={() => bulkMode ? toggleTableSelection(table.table_id) : handleTableSelect(table.table_id)}
            >
              <TablePreview table={table} width={160} height={120} />
            </div>

            {/* Table Info */}
            <div 
              className="table-card-info" 
              onClick={() => bulkMode ? toggleTableSelection(table.table_id) : handleTableSelect(table.table_id)}
            >
              <div className="table-card-name" title={table.table_name}>
                {table.table_name}
              </div>
              <div className="table-card-meta">
                <span className="meta-item">
                  <span className="meta-icon">📐</span>
                  {table.width} × {table.height}
                </span>
                {table.entity_count !== undefined && (
                  <span className="meta-item">
                    <span className="meta-icon">🎭</span>
                    {table.entity_count}
                  </span>
                )}
              </div>
              <div className="table-card-date">
                {formatDate(table.created_at)}
              </div>
            </div>

            {/* Action Bar */}
            <div className="table-card-actions">
              {!bulkMode && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTableSelect(table.table_id);
                    }}
                    className="action-btn action-btn-open"
                    title="Open table"
                  >
                    <span className="action-icon">↗</span>
                    Open
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenSettings(table.table_id);
                    }}
                    className="action-btn action-btn-settings"
                    title="Table settings"
                  >
                    <span className="action-icon">⚙️</span>
                    Settings
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExportTable(table.table_id);
                    }}
                    className="action-btn action-btn-export"
                    title="Export table"
                  >
                    <span className="action-icon">📤</span>
                    Export
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDuplicateTable(table.table_id);
                    }}
                    className="action-btn action-btn-duplicate"
                    title="Duplicate table"
                  >
                    <span className="action-icon">📋</span>
                    Copy
                  </button>
                  {table.syncStatus === 'local' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        syncTableToServer(table.table_id);
                      }}
                      className="action-btn action-btn-sync"
                      title="Sync to server"
                    >
                      <span className="action-icon">↑</span>
                      Sync
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteTable(table.table_id);
                    }}
                    className="action-btn action-btn-delete"
                    title="Delete table"
                  >
                    <span className="action-icon">🗑️</span>
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {deleteConfirmId && (
        <div className="delete-confirmation-modal">
          <div className="modal-content">
            <h4>Confirm Delete</h4>
            <p>Are you sure you want to delete this table?</p>
            <p className="table-name">
              {tables.find(t => t.table_id === deleteConfirmId)?.table_name}
            </p>
            <div className="modal-actions">
              <button onClick={confirmDeleteTable} className="confirm-delete-button">
                Delete
              </button>
              <button 
                onClick={() => setDeleteConfirmId(null)} 
                className="cancel-button"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {settingsTableId && (
        <div className="settings-modal">
          <div 
            className="modal-content settings-modal-content"
            style={{ background: '#2a2a2a', color: '#e0e0e0' }}
          >
            <h4 style={{ color: '#fff' }}>Table Settings</h4>
            
            <div className="settings-section" style={{ background: 'transparent' }}>
              <label style={{ color: '#e0e0e0' }}>
                Table Name:
                <input
                  type="text"
                  value={settingsName}
                  onChange={(e) => setSettingsName(e.target.value)}
                  placeholder="Enter table name"
                  maxLength={50}
                />
              </label>
            </div>

            <div className="settings-section" style={{ background: 'transparent' }}>
              <h5 style={{ color: '#fff' }}>Resolution</h5>
              <div className="form-row">
                <label style={{ color: '#e0e0e0' }}>
                  Width (px):
                  <input
                    type="number"
                    value={settingsWidth}
                    onChange={(e) => setSettingsWidth(parseInt(e.target.value) || 2000)}
                    min="500"
                    max="10000"
                    step="100"
                  />
                </label>
                <label style={{ color: '#e0e0e0' }}>
                  Height (px):
                  <input
                    type="number"
                    value={settingsHeight}
                    onChange={(e) => setSettingsHeight(parseInt(e.target.value) || 2000)}
                    min="500"
                    max="10000"
                    step="100"
                  />
                </label>
              </div>
            </div>

            <div className="settings-section" style={{ background: 'transparent' }}>
              <h5 style={{ color: '#fff' }}>Grid Settings</h5>
              <div className="checkbox-row">
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={settingsGridEnabled}
                    onChange={(e) => setSettingsGridEnabled(e.target.checked)}
                  />
                  <span>Show Grid</span>
                </label>
              </div>
              <label>
                Grid Size (px):
                <input
                  type="number"
                  value={settingsGridSize}
                  onChange={(e) => setSettingsGridSize(parseInt(e.target.value) || 50)}
                  min="10"
                  max="200"
                  step="5"
                  disabled={!settingsGridEnabled}
                />
              </label>
            </div>

            <div className="modal-actions">
              <button onClick={handleSaveSettings} className="confirm-button">
                Save Changes
              </button>
              <button 
                onClick={handleCloseSettings} 
                className="cancel-button"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
