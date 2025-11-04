import React, { useEffect, useState } from 'react';
import { useProtocol } from '../services/ProtocolContext';
import { useGameStore } from '../store';
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
  
  // Drag-and-drop: start drag with character id
  const handleDragStart = (e: React.DragEvent, charId: string) => {
    e.dataTransfer.setData('application/x-character-id', charId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  // ...existing code...
  const [showWizard, setShowWizard] = useState(false);
  const [expandedCharId, setExpandedCharId] = useState<string | null>(null);
  const [wizardKey, setWizardKey] = useState(0);

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
        protocol.saveCharacter({
          character_data: newCharacter,
          user_id: userId,
          session_code: sessionId?.toString() || ''
        });
        
        // Server will broadcast CHARACTER_UPDATE with real ID
        // Protocol handlers will update the character with real ID and syncStatus:'synced'
      } catch (error) {
        console.error('Failed to save character:', error);
        // Rollback optimistic update on error
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
        protocol.deleteCharacter(charId);
        // Server will broadcast CHARACTER_UPDATE with operation:'delete'
      } catch (error) {
        console.error('Failed to delete character:', error);
        // Rollback: Re-add character on error
        addCharacter(character);
        alert('Failed to delete character. Please try again.');
      }
    } else if (charId.startsWith('temp-')) {
      // Temp character - just remove locally
      console.log('Removed local-only character');
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
                  <div className="details-section">
                    <div className="stat-row">
                      <span>Version:</span>
                      <span>{char.version}</span>
                    </div>
                    <div className="stat-row">
                      <span>Created:</span>
                      <span>{char.createdAt}</span>
                    </div>
                    <div className="stat-row">
                      <span>Updated:</span>
                      <span>{char.updatedAt}</span>
                    </div>
                  </div>
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
