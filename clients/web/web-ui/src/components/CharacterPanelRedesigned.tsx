import React, { useState } from 'react';
import { useGameStore } from '../store';
import './CharacterPanelRedesigned.css';
import { EnhancedCharacterWizard } from './CharacterWizard/EnhancedCharacterWizard';

function genId(): string {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
}


export function CharacterPanelRedesigned() {
  const {
    characters,
    getSpritesForCharacter,
    linkSpriteToCharacter,
    canEditCharacter,
    canControlSprite,
    addCharacter,
    removeCharacter,
    selectSprite,
    selectedSprites,
    sessionId
  } = useGameStore();
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

  const handleWizardFinish = (data: any) => {
    const newCharacter = {
      id: genId(),
      sessionId: '',
      name: data.name || `${data.race} ${data.class}`,
      ownerId: data.ownerId || 0,
      controlledBy: [],
      data,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'local' as const,
    };
    addCharacter(newCharacter);
    setShowWizard(false);
    setExpandedCharId(newCharacter.id);
  };

  const handleAddToken = (charId: string) => {
    // Create a new sprite linked to this character
    const spriteId = genId();
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
    };
    useGameStore.getState().addSprite(sprite);
    linkSpriteToCharacter(spriteId, charId);
  };

  const handleDeleteCharacter = (charId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Delete this character?')) {
      removeCharacter(charId);
      if (expandedCharId === charId) setExpandedCharId(null);
    }
  };

  return (
    <div className="character-panel-redesigned">
      {/* Header with single create button */}
      <div className="panel-header">
        <h2>Characters</h2>
        <button className="create-btn" onClick={handleCreateCharacter} title="Create New Character">
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
                  <div className="char-name">{char.name}</div>
                  <div className="char-details">Owner: {char.ownerId}</div>
                </div>
                {/* Badges for linked tokens */}
                <div className="char-badges">
                  {linkedSprites.map((s: typeof linkedSprites[0]) => {
                    const canControlToken = canControlSprite(s.id, userId);
                    return (
                      <span key={s.id} className={`token-badge${canControlToken ? '' : ' no-permission'}`} title={canControlToken ? 'You can control this token.' : 'You do not have permission to control this token.'}>
                        Token
                        {s.syncStatus && (
                          <span className={`sync-status ${s.syncStatus}`}>{s.syncStatus}</span>
                        )}
                        {!canControlToken && (
                          <span className="permission-warning" title="No control permission">🚫</span>
                        )}
                      </span>
                    );
                  })}
                  {char.syncStatus && (
                    <span className={`sync-status ${char.syncStatus}`}>{char.syncStatus}</span>
                  )}
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
