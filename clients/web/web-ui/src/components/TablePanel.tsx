import React, { useState } from 'react';
import type { TableInfo } from '../hooks/useTableManager';
import { useTableManager } from '../hooks/useTableManager';
import './TablePanel.css';

const TablePanel: React.FC = () => {
  const {
    activeTableId,
    tables,
    createTable,
    setActiveTable,
    setTableGrid,
    removeTable,
    panViewport,
    zoomTable,
  } = useTableManager();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [newTableWidth, setNewTableWidth] = useState(2000);
  const [newTableHeight, setNewTableHeight] = useState(2000);

  const handleCreateTable = () => {
    if (!newTableName.trim()) return;
    
    const tableId = `table_${Date.now()}`;
    const success = createTable(tableId, newTableName, newTableWidth, newTableHeight);
    
    if (success) {
      setNewTableName('');
      setShowCreateForm(false);
      setActiveTable(tableId);
    }
  };

  const handleTableSelect = (tableId: string) => {
    setActiveTable(tableId);
  };

  const handleToggleGrid = (tableId: string, currentShowGrid: boolean, cellSize: number) => {
    setTableGrid(tableId, !currentShowGrid, cellSize);
  };

  const handlePanTable = (tableId: string, direction: string) => {
    const panAmount = 100;
    switch (direction) {
      case 'up':
        panViewport(tableId, 0, -panAmount);
        break;
      case 'down':
        panViewport(tableId, 0, panAmount);
        break;
      case 'left':
        panViewport(tableId, -panAmount, 0);
        break;
      case 'right':
        panViewport(tableId, panAmount, 0);
        break;
    }
  };

  const handleZoomTable = (tableId: string, zoomIn: boolean) => {
    const zoomFactor = zoomIn ? 1.2 : 0.8;
    const centerX = 400; // Canvas center - should be dynamic
    const centerY = 300;
    zoomTable(tableId, zoomFactor, centerX, centerY);
  };

  return (
    <div className="table-panel">
      <div className="table-panel-header">
        <h3>Tables</h3>
        <button 
          className="create-table-btn"
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          +
        </button>
      </div>

      {showCreateForm && (
        <div className="create-table-form">
          <input
            type="text"
            placeholder="Table name"
            value={newTableName}
            onChange={(e) => setNewTableName(e.target.value)}
          />
          <div className="size-inputs">
            <label>
              Width:
              <input
                type="number"
                value={newTableWidth}
                onChange={(e) => setNewTableWidth(Number(e.target.value))}
                min="500"
                max="10000"
              />
            </label>
            <label>
              Height:
              <input
                type="number"
                value={newTableHeight}
                onChange={(e) => setNewTableHeight(Number(e.target.value))}
                min="500"
                max="10000"
              />
            </label>
          </div>
          <div className="form-buttons">
            <button onClick={handleCreateTable}>Create</button>
            <button onClick={() => setShowCreateForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="tables-list">
        {tables.map((table: TableInfo) => (
          <div 
            key={table.table_id}
            className={`table-item ${table.table_id === activeTableId ? 'active' : ''}`}
          >
            <div className="table-header">
              <span 
                className="table-name"
                onClick={() => handleTableSelect(table.table_id)}
              >
                {table.table_name}
              </span>
              <button 
                className="remove-table-btn"
                onClick={() => removeTable(table.table_id)}
                title="Remove table"
              >
                ×
              </button>
            </div>
            
            <div className="table-info">
              <div className="table-size">
                {table.width}×{table.height}
              </div>
              <div className="table-scale">
                Scale: {table.table_scale.toFixed(2)}x
              </div>
            </div>

            {table.table_id === activeTableId && (
              <div className="table-controls">
                <div className="grid-controls">
                  <label>
                    <input
                      type="checkbox"
                      checked={table.show_grid}
                      onChange={() => handleToggleGrid(table.table_id, table.show_grid, table.cell_side)}
                    />
                    Show Grid
                  </label>
                  {table.show_grid && (
                    <input
                      type="number"
                      value={table.cell_side}
                      onChange={(e) => setTableGrid(table.table_id, true, Number(e.target.value))}
                      min="5"
                      max="200"
                      title="Grid cell size"
                    />
                  )}
                </div>

                <div className="pan-controls">
                  <div className="pan-label">Pan:</div>
                  <div className="pan-buttons">
                    <button onClick={() => handlePanTable(table.table_id, 'up')}>↑</button>
                    <div className="pan-row">
                      <button onClick={() => handlePanTable(table.table_id, 'left')}>←</button>
                      <button onClick={() => handlePanTable(table.table_id, 'right')}>→</button>
                    </div>
                    <button onClick={() => handlePanTable(table.table_id, 'down')}>↓</button>
                  </div>
                </div>

                <div className="zoom-controls">
                  <div className="zoom-label">Zoom:</div>
                  <div className="zoom-buttons">
                    <button onClick={() => handleZoomTable(table.table_id, false)}>-</button>
                    <button onClick={() => handleZoomTable(table.table_id, true)}>+</button>
                  </div>
                </div>

                <div className="viewport-info">
                  <div>Viewport: ({table.viewport_x.toFixed(0)}, {table.viewport_y.toFixed(0)})</div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {tables.length === 0 && (
        <div className="no-tables">
          No tables created. Click + to create your first table.
        </div>
      )}
    </div>
  );
};

export default TablePanel;
