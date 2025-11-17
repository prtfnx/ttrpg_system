import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store';
import { useProtocol } from '../services/ProtocolContext';
import { authService } from '../services/auth.service';
import './TokenConfigModal.css';

interface TokenConfigModalProps {
  spriteId: string;
  onClose: () => void;
}

export const TokenConfigModal: React.FC<TokenConfigModalProps> = ({ spriteId, onClose }) => {
  const { sprites, characters, linkSpriteToCharacter, unlinkSpriteFromCharacter, getCharacterForSprite, updateSprite } = useGameStore();
  const { protocol, isConnected } = useProtocol();
  
  const sprite = sprites.find(s => s.id === spriteId);
  const linkedCharacter = sprite?.characterId ? getCharacterForSprite(spriteId) : null;
  
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>(sprite?.characterId || '');
  // Use token HP/AC, fallback to character stats if linked
  const [localHp, setLocalHp] = useState<number>(sprite?.hp ?? linkedCharacter?.data?.stats?.hp ?? 10);
  const [localMaxHp, setLocalMaxHp] = useState<number>(sprite?.maxHp ?? linkedCharacter?.data?.stats?.maxHp ?? 10);
  const [localAc, setLocalAc] = useState<number>(sprite?.ac ?? linkedCharacter?.data?.stats?.ac ?? 10);
  const [localAuraRadius, setLocalAuraRadius] = useState<number>(sprite?.auraRadius ?? 0);

  // Load characters if not already loaded
  useEffect(() => {
    const userInfo = authService.getUserInfo();
    const currentUserId = userInfo?.id || 0;
    
    if (protocol && isConnected && currentUserId && characters.length === 0) {
      console.log('[TokenConfigModal] 🔄 Loading character list for user:', currentUserId);
      protocol.requestCharacterList(currentUserId);
    }
  }, [protocol, isConnected, characters.length]);

  // Debug logging
  useEffect(() => {
    console.log('[TokenConfigModal] Characters updated:', {
      spriteId,
      sprite,
      linkedCharacter,
      charactersCount: characters.length,
      characters: characters.map(c => ({ id: c.id, name: c.name, sessionId: c.sessionId }))
    });
  }, [characters, spriteId, sprite, linkedCharacter]);

  // Update local state when sprite or linked character changes
  useEffect(() => {
    if (sprite) {
      // Use sprite stats first, fallback to character stats
      setLocalHp(sprite.hp ?? linkedCharacter?.data?.stats?.hp ?? 10);
      setLocalMaxHp(sprite.maxHp ?? linkedCharacter?.data?.stats?.maxHp ?? 10);
      setLocalAc(sprite.ac ?? linkedCharacter?.data?.stats?.ac ?? 10);
      setLocalAuraRadius(sprite.auraRadius ?? 0);
      setSelectedCharacterId(sprite.characterId || '');
    }
  }, [sprite, linkedCharacter]);

  if (!sprite) {
    return null;
  }

  const handleCharacterLink = (characterId: string) => {
    if (characterId) {
      linkSpriteToCharacter(spriteId, characterId);
      setSelectedCharacterId(characterId);
      
      // Sync character stats to token
      const char = characters.find(c => c.id === characterId);
      if (char) {
        const newHp = char.data?.stats?.hp ?? localHp;
        const newMaxHp = char.data?.stats?.maxHp ?? localMaxHp;
        const newAc = char.data?.stats?.ac ?? localAc;
        
        setLocalHp(newHp);
        setLocalMaxHp(newMaxHp);
        setLocalAc(newAc);
        
        // Update sprite with character stats
        updateSprite(spriteId, { hp: newHp, maxHp: newMaxHp, ac: newAc });
      }
    } else {
      unlinkSpriteFromCharacter(spriteId);
      setSelectedCharacterId('');
      // Keep current token stats even when unlinking
    }
  };

  const handleHpChange = (newHp: number) => {
    setLocalHp(newHp);
    
    console.log('[TokenConfigModal] Updating HP:', { 
      spriteId, 
      newHp, 
      currentCharacterId: sprite?.characterId,
      linkedCharacter: linkedCharacter?.id 
    });
    
    // Always update token HP - preserve characterId
    updateSprite(spriteId, { hp: newHp });
    
    // Also update character HP if linked
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
    // Always update token max HP
    updateSprite(spriteId, { maxHp: newMaxHp });
    
    // Also update character max HP if linked
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

  const handleAcChange = (newAc: number) => {
    setLocalAc(newAc);
    // Always update token AC
    updateSprite(spriteId, { ac: newAc });
    
    // Also update character AC if linked
    if (linkedCharacter) {
      const updateCharacter = useGameStore.getState().updateCharacter;
      const newData = {
        ...linkedCharacter.data,
        stats: {
          ...linkedCharacter.data?.stats,
          ac: newAc,
        }
      };
      updateCharacter(linkedCharacter.id, { data: newData });
    }
  };

  const handleAuraRadiusChange = (newRadius: number) => {
    setLocalAuraRadius(newRadius);
    updateSprite(spriteId, { auraRadius: newRadius });
  };

  const hpPercentage = localMaxHp > 0 ? (localHp / localMaxHp) * 100 : 0;

  // Show all characters - don't filter by session since we might not have session info
  const sessionCharacters = characters;
  
  console.log('[TokenConfigModal] Available characters:', sessionCharacters.length);

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

          {/* Token Stats - Always visible */}
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
              <input
                type="number"
                value={localAc}
                onChange={(e) => handleAcChange(Math.max(0, parseInt(e.target.value) || 10))}
                className="hp-input"
                min="0"
              />
            </div>
          </div>

          <div className="config-section">
            <div className="stat-row">
              <label>Aura Radius:</label>
              <input
                type="number"
                value={localAuraRadius}
                onChange={(e) => handleAuraRadiusChange(Math.max(0, parseFloat(e.target.value) || 0))}
                className="hp-input"
                min="0"
                step="5"
              />
              <span style={{ marginLeft: '8px', color: '#888' }}>ft</span>
            </div>
          </div>

          {/* Character Info - Only show if linked */}
          {linkedCharacter && (
            <div className="character-info">
              <h3>{linkedCharacter.name}</h3>
              <p className="character-details">
                Level {linkedCharacter.data?.level || 1} {linkedCharacter.data?.race || 'Unknown'} {linkedCharacter.data?.class || 'Unknown'}
              </p>
              <p className="sync-note" style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>
                ✓ Token stats synced with character
              </p>
            </div>
          )}
          
          {!linkedCharacter && (
            <div className="no-character-message">
              <p style={{ color: '#888', fontStyle: 'italic' }}>
                No character linked - token stats are independent
              </p>
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
