import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store';
import './TokenConfigModal.css';

interface TokenConfigModalProps {
  spriteId: string;
  onClose: () => void;
}

export const TokenConfigModal: React.FC<TokenConfigModalProps> = ({ spriteId, onClose }) => {
  const { sprites, characters, linkSpriteToCharacter, unlinkSpriteFromCharacter, getCharacterForSprite } = useGameStore();
  
  const sprite = sprites.find(s => s.id === spriteId);
  const linkedCharacter = sprite?.characterId ? getCharacterForSprite(spriteId) : null;
  
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>(sprite?.characterId || '');
  const [localHp, setLocalHp] = useState<number>(linkedCharacter?.data?.stats?.hp || 0);
  const [localMaxHp, setLocalMaxHp] = useState<number>(linkedCharacter?.data?.stats?.maxHp || 0);

  // Update local state when linked character changes
  useEffect(() => {
    if (linkedCharacter) {
      setLocalHp(linkedCharacter.data?.stats?.hp || 0);
      setLocalMaxHp(linkedCharacter.data?.stats?.maxHp || 0);
    }
  }, [linkedCharacter]);

  if (!sprite) {
    return null;
  }

  const handleCharacterLink = (characterId: string) => {
    if (characterId) {
      linkSpriteToCharacter(spriteId, characterId);
      setSelectedCharacterId(characterId);
      
      // Load character HP values
      const char = characters.find(c => c.id === characterId);
      if (char) {
        setLocalHp(char.data?.stats?.hp || 0);
        setLocalMaxHp(char.data?.stats?.maxHp || 0);
      }
    } else {
      unlinkSpriteFromCharacter(spriteId);
      setSelectedCharacterId('');
      setLocalHp(0);
      setLocalMaxHp(0);
    }
  };

  const handleHpChange = (newHp: number) => {
    setLocalHp(newHp);
    
    // Update character HP
    if (linkedCharacter) {
      const updateCharacter = useGameStore.getState().updateCharacter;
      const newData = {
        ...linkedCharacter.data,
        stats: {
          ...linkedCharacter.data?.stats,
          hp: newHp,
        }
      };
      updateCharacter(linkedCharacter.id, { data: newData });
    }
  };

  const handleMaxHpChange = (newMaxHp: number) => {
    setLocalMaxHp(newMaxHp);
    
    // Update character max HP
    if (linkedCharacter) {
      const updateCharacter = useGameStore.getState().updateCharacter;
      const newData = {
        ...linkedCharacter.data,
        stats: {
          ...linkedCharacter.data?.stats,
          maxHp: newMaxHp,
        }
      };
      updateCharacter(linkedCharacter.id, { data: newData });
    }
  };

  const ac = linkedCharacter?.data?.stats?.ac || 10;
  const hpPercentage = localMaxHp > 0 ? (localHp / localMaxHp) * 100 : 0;

  // Filter characters in current session
  // Get session from linked character or use first character's session as fallback
  const currentSessionId = linkedCharacter?.sessionId || characters[0]?.sessionId;
  const sessionCharacters = currentSessionId 
    ? characters.filter(c => c.sessionId === currentSessionId)
    : characters;

  return (
    <div className="token-config-modal-overlay" onClick={onClose}>
      <div className="token-config-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Token Configuration</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-content">
          {/* Character Linking */}
          <div className="config-section">
            <label htmlFor="character-select">Link to Character:</label>
            <select
              id="character-select"
              value={selectedCharacterId}
              onChange={(e) => handleCharacterLink(e.target.value)}
              className="character-select"
            >
              <option value="">-- No Character --</option>
              {sessionCharacters.map(char => (
                <option key={char.id} value={char.id}>
                  {char.name} (Lv {char.data?.level || 1} {char.data?.class || 'Unknown'})
                </option>
              ))}
            </select>
          </div>

          {/* HP Management */}
          {linkedCharacter && (
            <>
              <div className="config-section">
                <div className="stat-row">
                  <label>Current HP:</label>
                  <div className="hp-input-group">
                    <button
                      className="hp-button"
                      onClick={() => handleHpChange(Math.max(0, localHp - 1))}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      value={localHp}
                      onChange={(e) => handleHpChange(Math.max(0, parseInt(e.target.value) || 0))}
                      className="hp-input"
                      min="0"
                      max={localMaxHp}
                    />
                    <button
                      className="hp-button"
                      onClick={() => handleHpChange(Math.min(localMaxHp, localHp + 1))}
                    >
                      +
                    </button>
                  </div>
                </div>
                
                <div className="hp-bar-container">
                  <div 
                    className="hp-bar-fill"
                    style={{ 
                      width: `${hpPercentage}%`,
                      backgroundColor: hpPercentage > 50 ? '#4ade80' : hpPercentage > 25 ? '#fbbf24' : '#ef4444'
                    }}
                  />
                  <span className="hp-bar-text">{localHp} / {localMaxHp}</span>
                </div>
              </div>

              <div className="config-section">
                <div className="stat-row">
                  <label>Max HP:</label>
                  <input
                    type="number"
                    value={localMaxHp}
                    onChange={(e) => handleMaxHpChange(Math.max(1, parseInt(e.target.value) || 1))}
                    className="hp-input"
                    min="1"
                  />
                </div>
              </div>

              <div className="config-section">
                <div className="stat-row">
                  <label>Armor Class (AC):</label>
                  <span className="stat-display">{ac}</span>
                </div>
              </div>

              <div className="character-info">
                <h3>{linkedCharacter.name}</h3>
                <p className="character-details">
                  Level {linkedCharacter.data?.level || 1} {linkedCharacter.data?.race || 'Unknown'} {linkedCharacter.data?.class || 'Unknown'}
                </p>
              </div>
            </>
          )}
          
          {!linkedCharacter && (
            <div className="no-character-message">
              <p>Select a character to manage token HP and stats.</p>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button className="done-button" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
};
