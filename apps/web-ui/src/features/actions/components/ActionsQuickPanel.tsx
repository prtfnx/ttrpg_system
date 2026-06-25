import { useActionCommands } from '@features/actions/hooks';
import type { ActionsEngine } from '@shared/hooks';
import clsx from 'clsx';
import { Redo2, RotateCw, Trash2, Undo2 } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import styles from './ActionsQuickPanel.module.css';

interface ActionsQuickPanelProps {
  actionsEngine?: ActionsEngine | null;
}

export const ActionsQuickPanel: React.FC<ActionsQuickPanelProps> = ({ actionsEngine }) => {
  const [tableName, setTableName] = useState('');
  const [tableWidth, setTableWidth] = useState(800);
  const [tableHeight, setTableHeight] = useState(600);
  const [selectedTableId, setSelectedTableId] = useState('');
  const commands = useActionCommands(actionsEngine ?? null);
  const { actions, status } = commands;

  const tables = useMemo(() => Array.from(actions.tables.values()), [actions.tables]);
  const selectedTable = tables.find(table => table.table_id === selectedTableId) ?? tables[0];

  const handleCreateTable = useCallback(async () => {
    if (!tableName.trim()) return;

    const result = await commands.createTable(tableName.trim(), tableWidth, tableHeight);
    if (result.success) {
      setTableName('');
    }
  }, [commands, tableHeight, tableName, tableWidth]);

  const handleDeleteSelectedTable = useCallback(async () => {
    if (!selectedTable) return;
    await commands.deleteTable(selectedTable.table_id);
    setSelectedTableId('');
  }, [commands, selectedTable]);

  return (
    <div className={clsx('game-panel', styles.quickPanel)}>
      <div className="panel-header-compact">
        <h3 className="panel-title">Quick Actions</h3>
      </div>

      <div className={styles.content}>
        <div className={styles.group}>
          <h4>Create Table</h4>
          <div className={styles.form}>
            <input
              className={styles.input}
              type="text"
              placeholder="Table name"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
            />
            <div className={styles.row}>
              <input
                className={styles.input}
                type="number"
                placeholder="Width"
                value={tableWidth}
                onChange={(e) => setTableWidth(parseInt(e.target.value) || 800)}
              />
              <input
                className={styles.input}
                type="number"
                placeholder="Height"
                value={tableHeight}
                onChange={(e) => setTableHeight(parseInt(e.target.value) || 600)}
              />
            </div>
            <button
              className={clsx(styles.button, styles.primary)}
              onClick={handleCreateTable}
              disabled={!tableName.trim() || actions.isLoading}
            >
              Create Table
            </button>
          </div>
        </div>

        <div className={styles.group}>
          <h4>Table Actions</h4>
          <select
            className={styles.select}
            value={selectedTable?.table_id ?? ''}
            onChange={(event) => setSelectedTableId(event.target.value)}
            disabled={tables.length === 0 || actions.isLoading}
            aria-label="Table to delete"
          >
            {tables.length === 0 ? (
              <option value="">No tables</option>
            ) : tables.map(table => (
              <option key={table.table_id} value={table.table_id}>
                {table.name}
              </option>
            ))}
          </select>
          <div className={styles.buttonGrid}>
            <button
              className={clsx(styles.button, styles.danger)}
              onClick={handleDeleteSelectedTable}
              disabled={!selectedTable || actions.isLoading}
            >
              <Trash2 size={14} aria-hidden /> Delete
            </button>
            <button
              className={clsx(styles.button, styles.secondary)}
              onClick={commands.refreshState}
              disabled={actions.isLoading}
            >
              <RotateCw size={14} aria-hidden /> Refresh
            </button>
          </div>
        </div>

        <div className={styles.group}>
          <h4>History</h4>
          <div className={styles.buttonGrid}>
            <button
              className={clsx(styles.button, styles.history)}
              onClick={commands.undo}
              disabled={!actions.canUndo || actions.isLoading}
            >
              <Undo2 size={14} aria-hidden /> Undo
            </button>
            <button
              className={clsx(styles.button, styles.history)}
              onClick={commands.redo}
              disabled={!actions.canRedo || actions.isLoading}
            >
              <Redo2 size={14} aria-hidden /> Redo
            </button>
          </div>
        </div>

        <div className={styles.status}>
          Tables: {actions.tables.size} | History: {actions.actionHistory.length}
          {actions.isLoading && <span> | Loading...</span>}
        </div>
        {(status || actions.error) && (
          <div className={clsx(styles.feedback, status?.type === 'success' ? styles.success : styles.error)}>
            {status?.message ?? `Error: ${actions.error}`}
          </div>
        )}
      </div>
    </div>
  );
};
