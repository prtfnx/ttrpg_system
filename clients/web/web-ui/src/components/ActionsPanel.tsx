import React, { useCallback, useState } from 'react';
import { useActions, type ActionResult, type BatchAction, type TableInfo } from '../hooks/useActions';
import type { RenderEngine } from '../types/wasm';
import clsx from 'clsx';
import styles from './ActionsPanel.module.css';

interface ActionsPanelProps {
  renderEngine: RenderEngine | null;
  className?: string;
}

export const ActionsPanel: React.FC<ActionsPanelProps> = ({ renderEngine, className = '' }) => {
  const [activeTab, setActiveTab] = useState<'tables' | 'layers' | 'history'>('tables');
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);

  const actions = useActions(renderEngine, {
    onAction: (actionType, data) => {
      setLogs(prev => [...prev.slice(-19), `Action: ${actionType} - ${JSON.stringify(data)}`]);
    },
    onStateChange: (eventType, targetId) => {
      setLogs(prev => [...prev.slice(-19), `State Change: ${eventType} - ${targetId}`]);
    },
    onError: (error) => {
      setLogs(prev => [...prev.slice(-19), `Error: ${error}`]);
    },
  });

  // Form states
  const [tableForm, setTableForm] = useState({ name: '', width: 800, height: 600 });

  const logResult = useCallback((operation: string, result: ActionResult) => {
    const status = result.success ? '✅' : '❌';
    setLogs(prev => [...prev.slice(-19), `${status} ${operation}: ${result.message}`]);
  }, []);

  // Table Operations
  const handleCreateTable = useCallback(async () => {
    if (!tableForm.name.trim()) return;
    
    try {
      const result = await actions.createTable(tableForm.name, tableForm.width, tableForm.height);
      logResult('Create Table', result);
      if (result.success) {
        setTableForm({ name: '', width: 800, height: 600 });
      }
    } catch (error) {
      console.error('Failed to create table:', error);
    }
  }, [actions, tableForm, logResult]);

  const handleDeleteTable = useCallback(async (tableId: string) => {
    try {
      const result = await actions.deleteTable(tableId);
      logResult('Delete Table', result);
      if (result.success && selectedTable === tableId) {
        setSelectedTable('');
      }
    } catch (error) {
      console.error('Failed to delete table:', error);
    }
  }, [actions, selectedTable, logResult]);

  const handleUpdateTable = useCallback(async (tableId: string, updates: Partial<TableInfo>) => {
    try {
      const result = await actions.updateTable(tableId, updates);
      logResult('Update Table', result);
    } catch (error) {
      console.error('Failed to update table:', error);
    }
  }, [actions, logResult]);

  // Layer Operations
  const handleToggleLayerVisibility = useCallback(async (layer: string) => {
    const currentVisibility = actions.layerVisibility.get(layer) ?? true;
    try {
      const result = await actions.setLayerVisibility(layer, !currentVisibility);
      logResult(`Toggle Layer ${layer}`, result);
    } catch (error) {
      console.error('Failed to toggle layer visibility:', error);
    }
  }, [actions, logResult]);

  // Batch Operations
  const handleBatchTest = useCallback(async () => {
    const batchActions: BatchAction[] = [
      {
        type: 'create_table',
        params: { name: 'Batch Table 1', width: 400, height: 400 }
      },
      {
        type: 'create_table', 
        params: { name: 'Batch Table 2', width: 600, height: 600 }
      }
    ];
    
    try {
      const result = await actions.batchActions(batchActions);
      logResult('Batch Actions', result);
    } catch (error) {
      console.error('Failed to execute batch actions:', error);
    }
  }, [actions, logResult]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'tables':
        return (
          <div className={styles.actionsTabContent}>
            <div className={styles.actionsForm}>
              <h4>Create Table</h4>
              <div className={styles.formRow}>
                <input
                  type="text"
                  placeholder="Table name"
                  value={tableForm.name}
                  onChange={(e) => setTableForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className={styles.formRow}>
                <input
                  type="number"
                  placeholder="Width"
                  value={tableForm.width}
                  onChange={(e) => setTableForm(prev => ({ ...prev, width: parseInt(e.target.value) || 800 }))}
                />
                <input
                  type="number"
                  placeholder="Height"
                  value={tableForm.height}
                  onChange={(e) => setTableForm(prev => ({ ...prev, height: parseInt(e.target.value) || 600 }))}
                />
              </div>
              <button 
                onClick={handleCreateTable}
                disabled={!tableForm.name.trim() || actions.isLoading}
                className={clsx(styles.actionButton, styles.primary)}
              >
                Create Table
              </button>
            </div>

            <div className={styles.actionsList}>
              <h4>Tables ({actions.tables.size})</h4>
              {Array.from(actions.tables.values()).map(table => (
                <div key={table.table_id} className={clsx(styles.listItem, selectedTable === table.table_id && styles.selected)}>
                  <div className={styles.itemInfo} onClick={() => setSelectedTable(table.table_id)}>
                    <strong>{table.name}</strong>
                    <span>{table.width}x{table.height}</span>
                  </div>
                  <div className={styles.itemActions}>
                    <button 
                      onClick={() => handleUpdateTable(table.table_id, { scale_x: 1.5, scale_y: 1.5 })}
                      className={clsx(styles.actionButton, styles.small)}
                    >
                      Scale
                    </button>
                    <button 
                      onClick={() => handleDeleteTable(table.table_id)}
                      className={clsx(styles.actionButton, styles.small, styles.danger)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'layers':
        return (
          <div className={styles.actionsTabContent}>
            <h4>Layer Visibility</h4>
            <div className={styles.layerControls}>
              {Array.from(actions.layerVisibility.entries()).map(([layer, visible]) => (
                <div key={layer} className={styles.layerItem}>
                  <label className={styles.layerToggle}>
                    <input
                      type="checkbox"
                      checked={visible}
                      onChange={() => handleToggleLayerVisibility(layer)}
                    />
                    <span className={styles.layerName}>{layer.replace('_', ' ')}</span>
                  </label>
                  <span className={styles.spriteCount}>
                    ({Array.from(actions.sprites.values()).filter(s => s.layer === layer).length})
                  </span>
                </div>
              ))}
            </div>
          </div>
        );

      case 'history':
        return (
          <div className={styles.actionsTabContent}>
            <div className={styles.historyControls}>
              <button 
                onClick={actions.undo}
                disabled={!actions.canUndo || actions.isLoading}
                className={styles.actionButton}
              >
                ↶ Undo
              </button>
              <button 
                onClick={actions.redo}
                disabled={!actions.canRedo || actions.isLoading}
                className={styles.actionButton}
              >
                ↷ Redo
              </button>
              <button 
                onClick={handleBatchTest}
                disabled={actions.isLoading}
                className={styles.actionButton}
              >
                Batch Test
              </button>
              <button 
                onClick={actions.refreshState}
                className={styles.actionButton}
              >
                Refresh
              </button>
            </div>
            
            <h4>Action History ({actions.actionHistory.length})</h4>
            <div className="history-list">
              {actions.actionHistory.slice(-10).reverse().map((entry, index) => (
                <div key={index} className="history-item">
                  <div className="history-type">{entry.action_type}</div>
                  <div className="history-time">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </div>
                  {entry.reversible && <span className="history-reversible">↶</span>}
                </div>
              ))}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={clsx(styles.actionsPanel, className)}>
      <div className={styles.panelHeader}>
        <h3>Actions System</h3>
        {actions.isLoading && <div className={styles.loadingIndicator}>⏳</div>}
        {actions.error && (
          <div className={styles.errorMessage}>
            {actions.error}
            <button onClick={actions.clearError} className={styles.clearError}>×</button>
          </div>
        )}
      </div>

      <div className={styles.panelTabs}>
        {['tables', 'layers', 'history'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`tab-button ${activeTab === tab ? 'active' : ''}`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className={styles.panelContent}>
        {renderTabContent()}
      </div>

      <div className="panel-footer">
        <div className="action-logs">
          <h4>Recent Logs</h4>
          <div className="logs-container">
            {logs.slice(-5).map((log, index) => (
              <div key={index} className={styles.logEntry}>
                {log}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
