import { useNetworkClient } from '@shared/hooks/useNetworkClient';
import { useEffect, useState } from 'react';
import { useTableSync } from '../hooks/useTableSync';
import styles from './TableSyncPanel.module.css';

interface ActivityLog {
  id: number;
  timestamp: Date;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
  emoji: string;
}

function TableSyncPanel() {
  const { tableSync, isLoading, error } = useTableSync();
  const { networkState } = useNetworkClient();
  const isConnected = networkState.isConnected;
  const [activityLog, setActivityLog] = useState<ActivityLog[]>([]);
  const [currentTableId, setCurrentTableId] = useState<string>('');
  const [newTableName, setNewTableName] = useState<string>('');
  const [spriteData, setSpriteData] = useState({
    name: 'Test Sprite',
    x: 100,
    y: 100,
    width: 50,
    height: 50,
    imageUrl: '',
    rotation: 0
  });
  const [mutationQueue, setMutationQueue] = useState<Array<{ type: 'create'|'update'|'delete'; payload: any; tempId?: string }>>([]);

  const addLog = (type: ActivityLog['type'], message: string, emoji: string) => {
    const newLog: ActivityLog = {
      id: Date.now(),
      timestamp: new Date(),
      type,
      message,
      emoji
    };
    setActivityLog(prev => [newLog, ...prev.slice(0, 49)]); // Keep last 50 entries
  };

  useEffect(() => {
    if (isConnected) {
      addLog('success', 'Connected to table sync service', '[ok]');
    } else {
      addLog('warning', 'Disconnected from table sync service', '[x]');
    }
  }, [isConnected]);

  useEffect(() => {
    if (error) {
      addLog('error', `Error: ${error}`, '[x]');
    }
  }, [error]);

  // Optimistic update helpers for table CRUD
  const optimisticCreateTable = (name: string) => {
    const tempId = `temp-table-${Date.now()}`;
    addLog('info', `Optimistically creating table: ${name}`, '🆕');
    setMutationQueue(q => [...q, { type: 'create', payload: { name }, tempId }]);
  };

  const optimisticRequestTable = (tableId: string) => {
    addLog('info', `Optimistically requesting table: ${tableId}`, '[->]');
    setMutationQueue(q => [...q, { type: 'update', payload: { tableId } }]);
  };

  // Reconcile mutations with server responses
  useEffect(() => {
    if (!tableSync || mutationQueue.length === 0) return;
    const processQueue = async () => {
      for (const mutation of mutationQueue) {
        try {
          if (mutation.type === 'create') {
            await tableSync.request_new_table(mutation.payload.name);
            addLog('success', `Table created: ${mutation.payload.name}`, '[ok]');
          } else if (mutation.type === 'update') {
            await tableSync.request_table(mutation.payload.tableId);
            addLog('success', `Table requested: ${mutation.payload.tableId}`, '[ok]');
          }
        } catch (err) {
          addLog('error', `Failed to ${mutation.type} table: ${err}`, '[x]');
        }
      }
      setMutationQueue([]);
    };
    processQueue();
  }, [mutationQueue, tableSync]);

  const handleRequestTable = async () => {
    if (!tableSync || !currentTableId.trim()) {
      addLog('warning', 'Please enter a table ID', '[!]');
      return;
    }
    optimisticRequestTable(currentTableId.trim());
  };

  const handleCreateNewTable = async () => {
    if (!tableSync || !newTableName.trim()) {
      addLog('warning', 'Please enter a table name', '[!]');
      return;
    }
    optimisticCreateTable(newTableName.trim());
    setNewTableName('');
  };

  const handleAddSprite = async () => {
    if (!tableSync) {
      addLog('warning', 'Table sync not available', '[!]');
      return;
    }

    try {
      const spriteId = `sprite_${Date.now()}`;
      addLog('info', `Adding sprite: ${spriteData.name}`, '[~]');
      
      await tableSync.add_sprite(
        spriteId,
        spriteData.name,
        spriteData.x,
        spriteData.y,
        spriteData.width,
        spriteData.height,
        spriteData.imageUrl,
        spriteData.rotation
      );
      
      addLog('success', `Sprite added: ${spriteData.name} (${spriteId})`, '[ok]');
    } catch (err) {
      addLog('error', `Failed to add sprite: ${err}`, '[x]');
    }
  };

  const handleUpdateSprite = async () => {
    if (!tableSync) {
      addLog('warning', 'Table sync not available', '[!]');
      return;
    }

    try {
      const spriteId = `sprite_${Date.now() - 1000}`; // Use a recent ID for demo
      addLog('info', `Updating sprite: ${spriteData.name}`, '[e]');
      
      await tableSync.update_sprite(
        spriteId,
        spriteData.name,
        spriteData.x,
        spriteData.y,
        spriteData.width,
        spriteData.height,
        spriteData.imageUrl,
        spriteData.rotation
      );
      
      addLog('success', `Sprite updated: ${spriteData.name} (${spriteId})`, '[ok]');
    } catch (err) {
      addLog('error', `Failed to update sprite: ${err}`, '[x]');
    }
  };

  const handleRemoveSprite = async () => {
    if (!tableSync) {
      addLog('warning', 'Table sync not available', '[!]');
      return;
    }

    try {
      const spriteId = `sprite_${Date.now() - 1000}`; // Use a recent ID for demo
      addLog('info', `Removing sprite: ${spriteId}`, '[del]');
      
      await tableSync.remove_sprite(spriteId);
      addLog('success', `Sprite removed: ${spriteId}`, '[ok]');
    } catch (err) {
      addLog('error', `Failed to remove sprite: ${err}`, '[x]');
    }
  };

  const handleAddTestLine = async () => {
    if (!tableSync) {
      addLog('warning', 'Table sync not available', '[!]');
      return;
    }

    try {
      const spriteId = `line_${Date.now()}`;
      addLog('info', `Adding test line segment`, '[--]');
      
      await tableSync.add_sprite(
        spriteId,
        'Test Line',
        150,  // x
        150,  // y
        100,  // width (length)
        5,    // height (thickness)
        '',
        0
      );
      
      addLog('success', `Line segment added: ${spriteId}`, '[ok]');
    } catch (err) {
      addLog('error', `Failed to add line: ${err}`, '[x]');
    }
  };

  const handleAddTestCircle = async () => {
    if (!tableSync) {
      addLog('warning', 'Table sync not available', '[!]');
      return;
    }

    try {
      const spriteId = `circle_${Date.now()}`;
      addLog('info', `Adding test circle`, '[o]');
      
      await tableSync.add_sprite(
        spriteId,
        'Test Circle',
        200,  // x
        200,  // y
        60,   // width (diameter)
        60,   // height (diameter)
        '',
        0
      );
      
      addLog('success', `Circle added: ${spriteId}`, '[ok]');
    } catch (err) {
      addLog('error', `Failed to add circle: ${err}`, '[x]');
    }
  };

  const clearLog = () => {
    setActivityLog([]);
    addLog('info', 'Activity log cleared', '[c]');
  };

  if (isLoading) {
    return (
      <div className="panel-base">
        <div className="loading-state">
          <div className="loading-spinner">...</div>
          <p>Loading table sync...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-base">
      <div className={styles.panelHeader}>
        <h3>Table Sync</h3>
        <div className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
          <span>{isConnected ? '[ok]' : '[x]'}</span>
          <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span>[x] {error}</span>
        </div>
      )}

      <div className="panel-section">
        <h4>Table Operations</h4>
        <div className="control-group">
          <div className="input-group">
            <label>Table ID</label>
            <input
              type="text"
              placeholder="Enter table ID"
              value={currentTableId}
              onChange={(e) => setCurrentTableId(e.target.value)}
              className="panel-input"
            />
          </div>
          <button 
            onClick={handleRequestTable}
            disabled={!tableSync || !isConnected}
            className="panel-button primary"
          >
            Request Table
          </button>
        </div>
        
        <div className="control-group">
          <div className="input-group">
            <label>New Table Name</label>
            <input
              type="text"
              placeholder="Enter new table name"
              value={newTableName}
              onChange={(e) => setNewTableName(e.target.value)}
              className="panel-input"
            />
          </div>
          <button 
            onClick={handleCreateNewTable}
            disabled={!tableSync || !isConnected}
            className="panel-button success"
          >
            🆕 Create New Table
          </button>
        </div>
      </div>

      <div className="panel-section">
        <h4>Sprite Operations</h4>
        <div className="control-group">
          <div className="input-grid">
            <div className="input-group">
              <label>Name</label>
              <input
                type="text"
                placeholder="Sprite name"
                value={spriteData.name}
                onChange={(e) => setSpriteData(prev => ({ ...prev, name: e.target.value }))}
                className="panel-input"
              />
            </div>
            <div className="input-group">
              <label>Image URL</label>
              <input
                type="text"
                placeholder="Image URL (optional)"
                value={spriteData.imageUrl}
                onChange={(e) => setSpriteData(prev => ({ ...prev, imageUrl: e.target.value }))}
                className="panel-input"
              />
            </div>
          </div>
          
          <div className="input-grid">
            <div className="input-group">
              <label>X Position</label>
              <input
                type="number"
                placeholder="X"
                value={spriteData.x}
                onChange={(e) => setSpriteData(prev => ({ ...prev, x: parseInt(e.target.value) || 0 }))}
                className="panel-input"
              />
            </div>
            <div className="input-group">
              <label>Y Position</label>
              <input
                type="number"
                placeholder="Y"
                value={spriteData.y}
                onChange={(e) => setSpriteData(prev => ({ ...prev, y: parseInt(e.target.value) || 0 }))}
                className="panel-input"
              />
            </div>
          </div>
          
          <div className="input-grid three-col">
            <div className="input-group">
              <label>Width</label>
              <input
                type="number"
                placeholder="Width"
                value={spriteData.width}
                onChange={(e) => setSpriteData(prev => ({ ...prev, width: parseInt(e.target.value) || 0 }))}
                className="panel-input"
              />
            </div>
            <div className="input-group">
              <label>Height</label>
              <input
                type="number"
                placeholder="Height"
                value={spriteData.height}
                onChange={(e) => setSpriteData(prev => ({ ...prev, height: parseInt(e.target.value) || 0 }))}
                className="panel-input"
              />
            </div>
            <div className="input-group">
              <label>Rotation</label>
              <input
                type="number"
                placeholder="Degrees"
                value={spriteData.rotation}
                onChange={(e) => setSpriteData(prev => ({ ...prev, rotation: parseInt(e.target.value) || 0 }))}
                className="panel-input"
              />
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button 
              onClick={handleAddSprite}
              disabled={!tableSync || !isConnected}
              className="panel-button success"
            >
              + Add Sprite
            </button>
            <button 
              onClick={handleUpdateSprite}
              disabled={!tableSync || !isConnected}
              className="panel-button primary"
            >
              Update Sprite
            </button>
            <button 
              onClick={handleRemoveSprite}
              disabled={!tableSync || !isConnected}
              className="panel-button danger"
            >
              Remove Sprite
            </button>
          </div>
          
          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #333' }}>
            <div style={{ marginBottom: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>
              Quick Test Sprites:
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button 
                onClick={handleAddTestLine}
                disabled={!tableSync || !isConnected}
                className="panel-button"
                title="Add horizontal line segment (100x5)"
              >
                Line Segment
              </button>
              <button 
                onClick={handleAddTestCircle}
                disabled={!tableSync || !isConnected}
                className="panel-button"
                title="Add circle (60px diameter)"
              >
                Circle
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="panel-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h4>Activity Log</h4>
          <button onClick={clearLog} className="panel-button">
            Clear
          </button>
        </div>
        
        <div className="activity-log">
          {activityLog.length === 0 ? (
            <div className="empty-state">
              <span>No activity yet. Try requesting a table or adding a sprite!</span>
            </div>
          ) : (
            activityLog.map((log) => (
              <div key={log.id} className={`log-entry ${log.type}`}>
                <span>{log.emoji}</span>
                <span className="log-timestamp">
                  {log.timestamp.toLocaleTimeString()}
                </span>
                <span className="log-message">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export { TableSyncPanel };
