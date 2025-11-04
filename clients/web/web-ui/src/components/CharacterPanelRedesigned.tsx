import React, { useEffect, useState } from 'react';
import { useProtocol } from '../services/ProtocolContext';
import { useGameStore } from '../store';
import type { Character } from '../types';
import './CharacterPanelRedesigned.css';
import { EnhancedCharacterWizard } from './CharacterWizard/EnhancedCharacterWizard';

function genId(): string {
  return 'temp-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
}

// Sync status icon components
const SyncStatusIcon: React.FC<{ status?: 'local' | 'syncing' | 'synced' | 'error' }> = ({ status }) => {
  if (!status || status === 'synced') return null; // Don't show anything for synced (clean UI)
  
  const statusConfig = {
    local: { icon: '📝', tooltip: 'Not synced - changes are local only', color: '#fbbf24' },
    syncing: { icon: '⟳', tooltip: 'Syncing with server...', color: '#3b82f6' },
    error: { icon: '⚠️', tooltip: 'Sync failed - click to retry', color: '#ef4444' },
  };
  
  const config = statusConfig[status];
  
  return (
    <span 
      className={`sync-status-icon ${status}`} 
      title={config.tooltip}
      style={{ color: config.color, fontSize: '14px', marginLeft: '4px' }}
    >
      {status === 'syncing' ? (
        <span className="sync-spinner">{config.icon}</span>
      ) : (
        config.icon
      )}
    </span>
  );
};


export function CharacterPanelRedesigned() {
  const {
    characters,
    getSpritesForCharacter,
    linkSpriteToCharacter,
    canEditCharacter,
    canControlSprite,
    addCharacter,
    updateCharacter,
    removeCharacter,
    selectSprite,
    selectedSprites,
    sessionId
  } = useGameStore();
  
  const { protocol, isConnected } = useProtocol();
  
  // Auto-load characters when connected
  useEffect(() => {
    if (protocol && isConnected) {
      protocol.requestCharacterList();
    }
  }, [protocol, isConnected]);
  
  // Pending operations tracker for rollback
  const pendingOperationsRef = React.useRef<Map<string, {
    type: 'create' | 'update' | 'delete';
    characterId: string;
    originalState?: any;
    timeoutId: ReturnType<typeof setTimeout>;
  }>>(new Map());
  
  // Cleanup pending operations on unmount
  useEffect(() => {
    return () => {
      // Clear all pending timeouts
      pendingOperationsRef.current.forEach(op => clearTimeout(op.timeoutId));
      pendingOperationsRef.current.clear();
    };
  }, []);
  
  // Register a pending operation with automatic rollback after 5 seconds
  const registerPendingOperation = (
    characterId: string,
    type: 'create' | 'update' | 'delete',
    originalState?: any
  ) => {
    // Clear any existing timeout for this character
    const existing = pendingOperationsRef.current.get(characterId);
    if (existing) {
      clearTimeout(existing.timeoutId);
    }
    
    // Set new timeout for rollback
    const timeoutId = setTimeout(() => {
      console.warn(`Operation timeout for character ${characterId}, rolling back...`);
      
      const operation = pendingOperationsRef.current.get(characterId);
      if (!operation) return;
      
      // Perform rollback based on operation type
      if (type === 'create') {
        // Remove the character that was never confirmed by server
        removeCharacter(characterId);
        console.log(`Rolled back create operation for ${characterId}`);
      } else if (type === 'update' && originalState) {
        // Restore original state
        updateCharacter(characterId, originalState);
        console.log(`Rolled back update operation for ${characterId}`);
      } else if (type === 'delete' && originalState) {
        // Re-add the deleted character
        addCharacter(originalState);
        console.log(`Rolled back delete operation for ${characterId}`);
      }
      
      // Update sync status to error
      updateCharacter(characterId, { syncStatus: 'error' });
      
      // Clean up
      pendingOperationsRef.current.delete(characterId);
      
      // Notify user
      alert(`Server did not respond. Operation for "${originalState?.name || 'character'}" was rolled back.`);
    }, 5000); // 5 second timeout
    
    // Store the pending operation
    pendingOperationsRef.current.set(characterId, {
      type,
      characterId,
      originalState,
      timeoutId
    });
  };
  
  // Confirm a pending operation (server responded successfully)
  const confirmPendingOperation = (characterId: string) => {
    const operation = pendingOperationsRef.current.get(characterId);
    if (operation) {
      clearTimeout(operation.timeoutId);
      pendingOperationsRef.current.delete(characterId);
      console.log(`Confirmed operation for ${characterId}`);
    }
  };
  
  // Listen for successful server responses to confirm operations
  useEffect(() => {
    const handleCharacterUpdate = (event: CustomEvent) => {
      const { character_id } = event.detail;
      if (character_id) {
        confirmPendingOperation(character_id);
        
        // Also confirm by temp ID if it's a create operation
        const tempChars = characters.filter(c => c.id.startsWith('temp-') && c.syncStatus === 'syncing');
        tempChars.forEach(c => confirmPendingOperation(c.id));
      }
    };
    
    window.addEventListener('character-update' as any, handleCharacterUpdate);
    
    return () => {
      window.removeEventListener('character-update' as any, handleCharacterUpdate);
    };
  }, [characters, confirmPendingOperation]);
  
  // Drag-and-drop: start drag with character id
  const handleDragStart = (e: React.DragEvent, charId: string) => {
    e.dataTransfer.setData('application/x-character-id', charId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  // ...existing code...
  const [showWizard, setShowWizard] = useState(false);
  const [expandedCharId, setExpandedCharId] = useState<string | null>(null);
  const [wizardKey, setWizardKey] = useState(0);
  const [editingCharId, setEditingCharId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<{
    hp?: number;
    maxHp?: number;
    ac?: number;
    speed?: number;
    newCondition?: string;
  }>({});

  const selectedCharacter = characters.find(c => {
    return getSpritesForCharacter(c.id).some(s => selectedSprites.includes(s.id));
  }) || null;

  const handleCharacterClick = (charId: string) => {
    setExpandedCharId(expandedCharId === charId ? null : charId);
    // Select first linked sprite if any
    const linkedSprites = getSpritesForCharacter(charId);
    if (linkedSprites.length > 0) selectSprite(linkedSprites[0].id, false);
  };

  const handleCreateCharacter = () => {
    setWizardKey(k => k + 1);
    setShowWizard(true);
  };

  const handleWizardFinish = async (data: any) => {
    const tempId = genId();
    const userId = typeof sessionId === 'string' ? parseInt(sessionId, 10) : (sessionId || 0);
    
    const newCharacter = {
      id: tempId,
      sessionId: sessionId?.toString() || '',
      name: data.name || `${data.race} ${data.class}`,
      ownerId: userId,
      controlledBy: [],
      data,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'syncing' as const,
    };
    
    // Optimistic update: Add to UI immediately
    addCharacter(newCharacter);
    setShowWizard(false);
    setExpandedCharId(tempId);
    
    // Send to server if connected
    if (protocol && isConnected) {
      try {
        // Register pending operation with automatic rollback after 5 seconds
        registerPendingOperation(tempId, 'create', newCharacter);
        
        protocol.saveCharacter({
          character_data: newCharacter,
          user_id: userId,
          session_code: sessionId?.toString() || ''
        });
        
        // Server will broadcast CHARACTER_UPDATE with real ID
        // Protocol handlers will update the character with real ID and syncStatus:'synced'
        // The pending operation will be confirmed when server responds
      } catch (error) {
        console.error('Failed to save character:', error);
        // Clear pending operation and rollback
        confirmPendingOperation(tempId);
        removeCharacter(tempId);
        alert('Failed to create character. Please try again.');
      }
    } else {
      // No connection - mark as local only
      updateCharacter(tempId, { syncStatus: 'local' });
      console.warn('Character created locally - not connected to server');
    }
  };

  const handleAddToken = (charId: string) => {
    // Create a new sprite linked to this character
    const spriteId = genId();
    const character = characters.find(c => c.id === charId);
    const sprite = {
      id: spriteId,
      tableId: '',
      characterId: charId,
      controlledBy: [],
      x: 0,
      y: 0,
      layer: 'tokens',
      texture: '',
      scale: { x: 1, y: 1 },
      rotation: 0,
      syncStatus: 'local' as const,
      name: character?.name || 'Unnamed Sprite',
    };
    useGameStore.getState().addSprite(sprite);
    linkSpriteToCharacter(spriteId, charId);
  };

  const handleDeleteCharacter = async (charId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Delete this character?')) return;
    
    const character = characters.find(c => c.id === charId);
    if (!character) return;
    
    // Optimistic update: Remove from UI immediately
    removeCharacter(charId);
    if (expandedCharId === charId) setExpandedCharId(null);
    
    // Send to server if connected and not a temp ID
    if (protocol && isConnected && !charId.startsWith('temp-')) {
      try {
        // Register pending delete operation with automatic rollback
        registerPendingOperation(charId, 'delete', character);
        
        protocol.deleteCharacter(charId);
        // Server will broadcast CHARACTER_UPDATE with operation:'delete'
        // Pending operation will be confirmed when server responds
      } catch (error) {
        console.error('Failed to delete character:', error);
        // Clear pending operation and rollback immediately
        confirmPendingOperation(charId);
        addCharacter(character);
        alert('Failed to delete character. Please try again.');
      }
    } else if (charId.startsWith('temp-')) {
      // Temp character - just remove locally
      console.log('Removed local-only character');
    }
  };

  // === EDIT MODE HANDLERS ===
  const handleStartEdit = (char: Character) => {
    setEditingCharId(char.id);
    // Character data is stored in char.data object
    const charData = char.data || {};
    const stats = charData.stats || {};
    setEditFormData({
      hp: stats.hp || 0,
      maxHp: stats.maxHp || 10,
      ac: stats.ac || 10,
      speed: stats.speed || 30,
      newCondition: ''
    });
  };

  const handleCancelEdit = () => {
    setEditingCharId(null);
    setEditFormData({});
  };

  const handleSaveEdit = (charId: string) => {
    const char = characters.find(c => c.id === charId);
    if (!char) return;

    const charData = char.data || {};
    const currentStats = charData.stats || {};

    // Build delta updates for data.stats
    const statsUpdates: Record<string, unknown> = {};

    if (editFormData.hp !== undefined && editFormData.hp !== currentStats.hp) {
      statsUpdates.hp = editFormData.hp;
    }
    if (editFormData.maxHp !== undefined && editFormData.maxHp !== currentStats.maxHp) {
      statsUpdates.maxHp = editFormData.maxHp;
    }
    if (editFormData.ac !== undefined && editFormData.ac !== currentStats.ac) {
      statsUpdates.ac = editFormData.ac;
    }
    if (editFormData.speed !== undefined && editFormData.speed !== currentStats.speed) {
      statsUpdates.speed = editFormData.speed;
    }

    // Only send update if there are changes
    if (Object.keys(statsUpdates).length === 0) {
      handleCancelEdit();
      return;
    }

    // Build updates object with nested data.stats
    const updates = {
      data: {
        ...charData,
        stats: { ...currentStats, ...statsUpdates }
      }
    };

    // Optimistic update locally
    updateCharacter(charId, updates);

    // Send to server if connected
    if (protocol && isConnected) {
      updateCharacter(charId, { syncStatus: 'syncing' });
      protocol.updateCharacter(charId, updates, char.version);

      // Register rollback timer
      const rollbackTimer = setTimeout(() => {
        console.warn(`⏱️ Character update timeout for ${charId}, rolling back...`);
        // Rollback to original values
        updateCharacter(charId, {
          data: charData,
          syncStatus: 'error'
        });
        alert(`Character update failed - rolled back changes for ${char.name}`);
      }, 5000);

      pendingOperationsRef.current.set(charId, {
        type: 'update',
        characterId: charId,
        originalState: charData,
        timeoutId: rollbackTimer
      });

      // Listen for confirmation
      const handleUpdateConfirm = (e: Event) => {
        const customEvent = e as CustomEvent;
        if (customEvent.detail?.character_id === charId && customEvent.detail?.success) {
          const op = pendingOperationsRef.current.get(charId);
          if (op && op.type === 'update') {
            clearTimeout(op.timeoutId);
            pendingOperationsRef.current.delete(charId);
            console.log(`✅ Character update confirmed: ${charId}`);
          }
        }
      };

      window.addEventListener('character-update-response', handleUpdateConfirm, { once: true });
    }

    handleCancelEdit();
  };

  const handleAddCondition = (charId: string) => {
    const char = characters.find(c => c.id === charId);
    if (!char || !editFormData.newCondition?.trim()) return;

    const charData = char.data || {};
    const currentConditions = charData.conditions || [];
    const newCondition = editFormData.newCondition.trim();
    
    if (currentConditions.includes(newCondition)) {
      alert('Condition already exists');
      return;
    }

    const updates = {
      data: {
        ...charData,
        conditions: [...currentConditions, newCondition]
      }
    };

    // Optimistic update
    updateCharacter(charId, updates);

    // Send to server
    if (protocol && isConnected) {
      updateCharacter(charId, { syncStatus: 'syncing' });
      protocol.updateCharacter(charId, updates, char.version);
    }

    // Clear input
    setEditFormData({ ...editFormData, newCondition: '' });
  };

  const handleRemoveCondition = (charId: string, condition: string) => {
    const char = characters.find(c => c.id === charId);
    if (!char) return;

    const charData = char.data || {};
    const currentConditions = charData.conditions || [];

    const updates = {
      data: {
        ...charData,
        conditions: currentConditions.filter((c: string) => c !== condition)
      }
    };

    // Optimistic update
    updateCharacter(charId, updates);

    // Send to server
    if (protocol && isConnected) {
      updateCharacter(charId, { syncStatus: 'syncing' });
      protocol.updateCharacter(charId, updates, char.version);
    }
  };

  return (
    <div className="character-panel-redesigned">
      {/* Connection status banner */}
      {!isConnected && (
        <div className="connection-banner offline" title="Not connected to server - characters will be saved locally">
          ⚠️ Offline - Changes saved locally only
        </div>
      )}
      
      {/* Header with single create button */}
      <div className="panel-header">
        <h2>Characters</h2>
        {isConnected && (
          <span className="connection-status connected" title="Connected to server">🟢</span>
        )}
        <button
          className="create-btn"
          onClick={handleCreateCharacter}
          title="Create New Character"
          aria-label="Create New Character"
          data-testid="create-character-btn"
        >
          +
        </button>
      </div>

      {/* Character List */}
      <div className="character-list">
        {characters.length === 0 && (
          <div className="empty-state">
            No characters yet. Click <strong>+</strong> to create one.
          </div>
        )}

  {characters.map(char => {
          const isExpanded = expandedCharId === char.id;
          const isSelected = selectedCharacter?.id === char.id;
          const linkedSprites = getSpritesForCharacter(char.id);
          const userId = typeof sessionId === 'string' ? parseInt(sessionId, 10) : sessionId;
          const canEdit = canEditCharacter(char.id, userId);
          return (
            <div
              key={char.id}
              className={`character-card ${isSelected ? 'selected' : ''} ${isExpanded ? 'expanded' : ''}`}
              draggable
              onDragStart={e => handleDragStart(e, char.id)}
            >
              <div
                className="character-header"
                onClick={() => handleCharacterClick(char.id)}
              >
                <div className="char-avatar">{char.name.charAt(0).toUpperCase()}</div>
                <div className="char-info">
                  <div className="char-name">
                    {char.name}
                    <SyncStatusIcon status={char.syncStatus} />
                  </div>
                  <div className="char-details">Owner: {char.ownerId}</div>
                </div>
                {/* Badges for linked tokens */}
                <div className="char-badges">
                  {linkedSprites.map((s: typeof linkedSprites[0]) => {
                    const canControlToken = canControlSprite(s.id, userId);
                    return (
                      <span key={s.id} className={`token-badge${canControlToken ? '' : ' no-permission'}`} title={canControlToken ? 'You can control this token.' : 'You do not have permission to control this token.'}>
                        Token
                        <SyncStatusIcon status={s.syncStatus} />
                        {!canControlToken && (
                          <span className="permission-warning" title="No control permission">🚫</span>
                        )}
                      </span>
                    );
                  })}
                </div>
                <button
                  className="char-expand-btn"
                  onClick={e => { e.stopPropagation(); handleCharacterClick(char.id); }}
                >
                  {isExpanded ? '▼' : '▶'}
                </button>
              </div>
              {isExpanded && (
                <div className="character-details">
                  {/* Stats Section */}
                  {editingCharId === char.id ? (
                    <div className="details-section edit-mode">
                      <h4>Edit Stats</h4>
                      <div className="stat-row">
                        <label>HP:</label>
                        <input
                          type="number"
                          value={editFormData.hp || 0}
                          onChange={e => setEditFormData({ ...editFormData, hp: parseInt(e.target.value) || 0 })}
                          className="stat-input"
                        />
                        <span>/ {editFormData.maxHp}</span>
                      </div>
                      <div className="stat-row">
                        <label>Max HP:</label>
                        <input
                          type="number"
                          value={editFormData.maxHp || 10}
                          onChange={e => setEditFormData({ ...editFormData, maxHp: parseInt(e.target.value) || 10 })}
                          className="stat-input"
                        />
                      </div>
                      <div className="stat-row">
                        <label>AC:</label>
                        <input
                          type="number"
                          value={editFormData.ac || 10}
                          onChange={e => setEditFormData({ ...editFormData, ac: parseInt(e.target.value) || 10 })}
                          className="stat-input"
                        />
                      </div>
                      <div className="stat-row">
                        <label>Speed:</label>
                        <input
                          type="number"
                          value={editFormData.speed || 30}
                          onChange={e => setEditFormData({ ...editFormData, speed: parseInt(e.target.value) || 30 })}
                          className="stat-input"
                        />
                        <span>ft</span>
                      </div>
                      <div className="edit-actions">
                        <button className="action-btn save" onClick={() => handleSaveEdit(char.id)}>
                          Save
                        </button>
                        <button className="action-btn cancel" onClick={handleCancelEdit}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="details-section">
                      <h4>Stats</h4>
                      <div className="stat-row">
                        <span>HP:</span>
                        <span>{char.data?.stats?.hp || 0} / {char.data?.stats?.maxHp || 10}</span>
                      </div>
                      <div className="stat-row">
                        <span>AC:</span>
                        <span>{char.data?.stats?.ac || 10}</span>
                      </div>
                      <div className="stat-row">
                        <span>Speed:</span>
                        <span>{char.data?.stats?.speed || 30} ft</span>
                      </div>
                      <div className="stat-row">
                        <span>Version:</span>
                        <span>{char.version}</span>
                      </div>
                      {canEdit && (
                        <button className="action-btn edit" onClick={() => handleStartEdit(char)}>
                          Edit Stats
                        </button>
                      )}
                    </div>
                  )}
                  
                  {/* Conditions Section */}
                  <div className="details-section conditions-section">
                    <h4>Conditions</h4>
                    <div className="conditions-list">
                      {(char.data?.conditions || []).length === 0 && (
                        <span className="no-conditions">No active conditions</span>
                      )}
                      {(char.data?.conditions || []).map((cond: string) => (
                        <div key={cond} className="condition-tag">
                          {cond}
                          {canEdit && (
                            <button
                              className="remove-condition"
                              onClick={() => handleRemoveCondition(char.id, cond)}
                              title="Remove condition"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {canEdit && editingCharId !== char.id && (
                      <div className="add-condition-row">
                        <input
                          type="text"
                          placeholder="Add condition..."
                          value={editFormData.newCondition || ''}
                          onChange={e => setEditFormData({ ...editFormData, newCondition: e.target.value })}
                          onKeyPress={e => {
                            if (e.key === 'Enter') {
                              handleAddCondition(char.id);
                            }
                          }}
                          className="condition-input"
                        />
                        <button
                          className="action-btn add-condition"
                          onClick={() => handleAddCondition(char.id)}
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Actions Section */}
                  <div className="char-actions">
                    <button className="action-btn" onClick={() => handleAddToken(char.id)} disabled={!canEdit} title={canEdit ? 'Add a token for this character.' : 'You do not have permission to add tokens for this character.'}>
                      Add Token
                    </button>
                    {canEdit && (
                      <button className="action-btn delete" onClick={e => handleDeleteCharacter(char.id, e)} title="Delete this character.">
                        Delete
                      </button>
                    )}
                    {!canEdit && (
                      <button className="action-btn delete" disabled title="You do not have permission to delete this character.">
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Character Creation Wizard Modal */}
      {showWizard && (
        <EnhancedCharacterWizard
          key={wizardKey}
          isOpen={showWizard}
          onFinish={handleWizardFinish}
          onCancel={() => setShowWizard(false)}
        />
      )}
    </div>
  );
}

export default CharacterPanelRedesigned;
