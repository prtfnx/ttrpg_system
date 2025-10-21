import React, { useEffect, useState } from 'react';
import type { TableInfo } from '../store';
import { useGameStore } from '../store';
import './TableManagementPanel.css';
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

    // If this is the active table, request fresh table data to re-render
    if (activeTableId === settingsTableId) {
      console.log('Requesting updated table data for active table:', settingsTableId);
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

  return (
    <div className="table-management-panel">
      <div className="panel-header">
        <h3>Table Management</h3>
        <div className="header-actions">
          <button 
            onClick={requestTableList}
            disabled={tablesLoading}
            className="refresh-button"
            title="Refresh table list"
          >
            {tablesLoading ? '⟳' : '↻'}
          </button>
          <button 
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="create-button"
            title="Create new table"
          >
            +
          </button>
        </div>
      </div>

      {showCreateForm && (
        <div className="create-table-form">
          <h4>Create New Table</h4>
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
        
        {!tablesLoading && tables.length === 0 && (
          <div className="empty-state">
            <p>No tables available</p>
            <p>Create a new table to get started</p>
          </div>
        )}

        {!tablesLoading && tables.map((table) => (
          <div 
            key={table.table_id} 
            className={`table-card ${activeTableId === table.table_id ? 'active' : ''}`}
          >
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
            <div className="table-preview" onClick={() => handleTableSelect(table.table_id)}>
              <TablePreview table={table} width={160} height={120} />
            </div>

            {/* Table Info */}
            <div className="table-card-info" onClick={() => handleTableSelect(table.table_id)}>
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
                <label className="checkbox-label">
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
