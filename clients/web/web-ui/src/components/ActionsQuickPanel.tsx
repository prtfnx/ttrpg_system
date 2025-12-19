import React, { useCallback, useState } from 'react';
import { useActions } from '../hooks/useActions';
import type { RenderEngine } from '../types/wasm';
import styles from './ActionsQuickPanel.module.css';

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
    <div className={styles.gamePanel}>
      <div className={styles.panelHeaderCompact}>
        <h3 className={styles.panelTitle}>⚡ Quick Actions</h3>
      </div>

      <div className={styles.actionsQuickContent}>
        {/* Table Creation */}
        <div className={styles.actionGroup}>
          <h4>Create Table</h4>
          <div className={styles.formCompact}>
            <input
              type="text"
              placeholder="Table name"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
            />
            <div className={styles.inputRow}>
              <input
                type="number"
                placeholder="Width"
                value={tableWidth}
                onChange={(e) => setTableWidth(parseInt(e.target.value) || 800)}
              />
              <input
                type="number"
                placeholder="Height"
                value={tableHeight}
                onChange={(e) => setTableHeight(parseInt(e.target.value) || 600)}
              />
            </div>
            <button 
              onClick={handleCreateTable}
              disabled={!tableName.trim() || actions.isLoading}
              className={styles.createButton}
            >
              Create Table
            </button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className={styles.actionGroup}>
          <h4>Table Actions</h4>
          <div className={styles.buttonGrid}>
            <button 
              onClick={handleDeleteSelectedTable}
              disabled={actions.tables.size === 0 || actions.isLoading}
              className={styles.deleteButton}
            >
              Delete Table
            </button>
            <button 
              onClick={handleRefreshState}
              disabled={actions.isLoading}
              className={styles.refreshButton}
            >
              Refresh
            </button>
          </div>
        </div>

        {/* History Actions */}
        <div className={styles.actionGroup}>
          <h4>History</h4>
          <div className={styles.buttonGrid}>
            <button 
              onClick={handleUndo}
              disabled={!actions.canUndo || actions.isLoading}
              className={styles.historyButton}
            >
              ↶ Undo
            </button>
            <button 
              onClick={handleRedo}
              disabled={!actions.canRedo || actions.isLoading}
              className={styles.historyButton}
            >
              ↷ Redo
            </button>
          </div>
        </div>

        {/* Status */}
        <div className={styles.actionStatus}>
          <div className={styles.statusText}>
            Tables: {actions.tables.size} | History: {actions.actionHistory.length}
            {actions.isLoading && <span> | Loading...</span>}
          </div>
          {actions.error && (
            <div className={styles.errorText}>
              Error: {actions.error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
