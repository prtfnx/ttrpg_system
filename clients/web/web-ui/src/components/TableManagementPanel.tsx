import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store';
import type { TableInfo } from '../store';
import './TableManagementPanel.css';

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
    switchToTable
  } = useGameStore();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [newTableWidth, setNewTableWidth] = useState(2000);
  const [newTableHeight, setNewTableHeight] = useState(2000);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

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
        
        // Get current tables from store
        const currentTables = tables;
        
        // Filter local-only tables (not in server response and marked as local)
        const localTables = currentTables.filter((t: TableInfo) => 
          // Keep tables that are local-only (not in server response)
          !serverTables.some(st => st.table_id === t.table_id) && 
          t.syncStatus === 'local'
        );
        
        console.log('Merging: local tables =', localTables, 'server tables =', serverTables);
        
        // Merge: server tables first (authoritative), then local-only tables
        const mergedTables = [...serverTables, ...localTables];
        console.log('Merged table list:', mergedTables);
        
        setTables(mergedTables);
      }
      setTablesLoading(false);
    };

    const handleTableCreated = (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log('Table created:', customEvent.detail);
      // Refresh table list after creation
      requestTableList();
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
            className={`table-item ${activeTableId === table.table_id ? 'active' : ''}`}
          >
            <div className="table-info" onClick={() => handleTableSelect(table.table_id)}>
              <div className="table-header-row">
                <div className="table-name">{table.table_name}</div>
                {/* BEST PRACTICE: Visual sync status indicators */}
                <span 
                  className={`sync-status sync-status-${table.syncStatus || 'synced'}`}
                  title={
                    table.syncStatus === 'local' ? 'Local only - not synced to server' :
                    table.syncStatus === 'syncing' ? 'Syncing with server...' :
                    table.syncStatus === 'synced' ? `Synced ${table.lastSyncTime ? new Date(table.lastSyncTime).toLocaleString() : ''}` :
                    table.syncStatus === 'error' ? `Sync error: ${table.syncError || 'Unknown error'}` :
                    'Synced with server'
                  }
                >
                  {table.syncStatus === 'local' && '💾'}
                  {table.syncStatus === 'syncing' && '🔄'}
                  {table.syncStatus === 'synced' && '☁️'}
                  {table.syncStatus === 'error' && '⚠️'}
                  {!table.syncStatus && '☁️'}
                </span>
              </div>
              <div className="table-details">
                <span className="table-size">{table.width} × {table.height}</span>
                <span className="table-date">Created: {formatDate(table.created_at)}</span>
              </div>
            </div>
            
            <div className="table-actions">
              {/* BEST PRACTICE: Manual sync button for local tables */}
              {table.syncStatus === 'local' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // TODO: Implement sync to server
                    console.log('Sync table to server:', table.table_id);
                  }}
                  className="sync-button"
                  title="Sync to server"
                >
                  ↑
                </button>
              )}
              <button 
                onClick={() => handleDeleteTable(table.table_id)}
                className="delete-button"
                title="Delete table"
              >
                🗑️
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
    </div>
  );
};
