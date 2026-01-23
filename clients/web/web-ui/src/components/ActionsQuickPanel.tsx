import React, { useCallback, useState } from 'react';
import { useActions } from '../hooks/useActions';
import type { RenderEngine } from '../types/wasm';

interface ActionsQuickPanelProps {
  renderEngine?: RenderEngine | null;
}

export const ActionsQuickPanel: React.FC<ActionsQuickPanelProps> = ({ renderEngine }) => {
  const [tableName, setTableName] = useState('');
  const [tableWidth, setTableWidth] = useState(800);
  const [tableHeight, setTableHeight] = useState(600);

  const actions = useActions(renderEngine || (window as any).rustRenderManager, {
    onAction: (actionType, data) => {
      console.log(`Action: ${actionType}`, data);
    },
    onStateChange: (eventType, targetId) => {
      console.log(`State Change: ${eventType}`, targetId);
    },
    onError: (error) => {
      console.error('Actions Error:', error);
    },
  });

  const handleCreateTable = useCallback(async () => {
    if (!tableName.trim()) {
      alert('Please enter a table name');
      return;
    }
    
    try {
      const result = await actions.createTable(tableName, tableWidth, tableHeight);
      if (result.success) {
        setTableName('');
        alert(`Table "${tableName}" created successfully!`);
      } else {
        alert(`Failed to create table: ${result.message}`);
      }
    } catch (error) {
      console.error('Failed to create table:', error);
      alert('Failed to create table');
    }
  }, [actions, tableName, tableWidth, tableHeight]);

  const handleDeleteSelectedTable = useCallback(async () => {
    const tables = Array.from(actions.tables.values());
    if (tables.length === 0) {
      alert('No tables to delete');
      return;
    }

    // For simplicity, delete the first table
    const table = tables[0];
    if (confirm(`Delete table "${table.name}"?`)) {
      try {
        const result = await actions.deleteTable(table.table_id);
        if (result.success) {
          alert(`Table "${table.name}" deleted successfully!`);
        } else {
          alert(`Failed to delete table: ${result.message}`);
        }
      } catch (error) {
        console.error('Failed to delete table:', error);
        alert('Failed to delete table');
      }
    }
  }, [actions]);

  const handleUndo = useCallback(() => {
    actions.undo();
  }, [actions]);

  const handleRedo = useCallback(() => {
    actions.redo();
  }, [actions]);

  const handleRefreshState = useCallback(() => {
    actions.refreshState();
  }, [actions]);

  return (
    <div className="game-panel">
      <div className="panel-header-compact">
        <h3 className="panel-title">⚡ Quick Actions</h3>
      </div>

      <div className="actions-quick-content">
        {/* Table Creation */}
        <div className="action-group">
          <h4>Create Table</h4>
          <div className="form-compact">
            <input
              type="text"
              placeholder="Table name"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              style={{ width: '100%', marginBottom: '4px', padding: '4px', fontSize: '12px' }}
            />
            <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
              <input
                type="number"
                placeholder="Width"
                value={tableWidth}
                onChange={(e) => setTableWidth(parseInt(e.target.value) || 800)}
                style={{ flex: 1, padding: '4px', fontSize: '12px' }}
              />
              <input
                type="number"
                placeholder="Height"
                value={tableHeight}
                onChange={(e) => setTableHeight(parseInt(e.target.value) || 600)}
                style={{ flex: 1, padding: '4px', fontSize: '12px' }}
              />
            </div>
            <button 
              onClick={handleCreateTable}
              disabled={!tableName.trim() || actions.isLoading}
              style={{ 
                width: '100%', 
                padding: '6px', 
                fontSize: '12px',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Create Table
            </button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="action-group">
          <h4>Table Actions</h4>
          <div className="button-grid">
            <button 
              onClick={handleDeleteSelectedTable}
              disabled={actions.tables.size === 0 || actions.isLoading}
              style={{ 
                padding: '6px 8px', 
                fontSize: '11px',
                background: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer'
              }}
            >
              Delete Table
            </button>
            <button 
              onClick={handleRefreshState}
              disabled={actions.isLoading}
              style={{ 
                padding: '6px 8px', 
                fontSize: '11px',
                background: '#6366f1',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer'
              }}
            >
              Refresh
            </button>
          </div>
        </div>

        {/* History Actions */}
        <div className="action-group">
          <h4>History</h4>
          <div className="button-grid">
            <button 
              onClick={handleUndo}
              disabled={!actions.canUndo || actions.isLoading}
              style={{ 
                padding: '6px 8px', 
                fontSize: '11px',
                background: '#f59e0b',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer'
              }}
            >
              ↶ Undo
            </button>
            <button 
              onClick={handleRedo}
              disabled={!actions.canRedo || actions.isLoading}
              style={{ 
                padding: '6px 8px', 
                fontSize: '11px',
                background: '#f59e0b',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer'
              }}
            >
              ↷ Redo
            </button>
          </div>
        </div>

        {/* Status */}
        <div className="action-status">
          <div style={{ fontSize: '11px', color: '#9ca3af' }}>
            Tables: {actions.tables.size} | History: {actions.actionHistory.length}
            {actions.isLoading && <span> | Loading...</span>}
          </div>
          {actions.error && (
            <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px' }}>
              Error: {actions.error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
