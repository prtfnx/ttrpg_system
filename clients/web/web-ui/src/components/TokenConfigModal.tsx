import React, { useEffect, useState } from 'react';
import { useProtocol } from '../services/ProtocolContext';
import { authService } from '../services/auth.service';
import { useGameStore } from '../store';
import styles from './TokenConfigModal.module.css';

interface TokenConfigModalProps {
  spriteId: string;
  onClose: () => void;
}

export const TokenConfigModal: React.FC<TokenConfigModalProps> = ({ spriteId, onClose }) => {
  const { sprites, characters, unlinkSpriteFromCharacter, getCharacterForSprite, updateSprite } = useGameStore();
  const { protocol, isConnected } = useProtocol();
  
  const sprite = sprites.find(s => s.id === spriteId);
  const linkedCharacter = sprite?.characterId ? getCharacterForSprite(spriteId) : null;
  
  const [activeTab, setActiveTab] = useState<'stats' | 'debug'>('stats');
  const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';
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
      // Find the character
      const char = characters.find(c => c.id === characterId);
      
      if (char) {
        // Get character stats
        const newHp = char.data?.stats?.hp ?? localHp;
        const newMaxHp = char.data?.stats?.maxHp ?? localMaxHp;
        const newAc = char.data?.stats?.ac ?? localAc;
        
        // Update local state
        setLocalHp(newHp);
        setLocalMaxHp(newMaxHp);
        setLocalAc(newAc);
        setSelectedCharacterId(characterId);
        
        // Single update: link character AND sync stats in one call
        updateSprite(spriteId, { 
          characterId, 
          hp: newHp, 
          maxHp: newMaxHp, 
          ac: newAc 
        });
      } else {
        // Character not found, link with current token stats
        updateSprite(spriteId, { 
          characterId,
          hp: localHp,
          maxHp: localMaxHp,
          ac: localAc
        });
        setSelectedCharacterId(characterId);
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
    <div className={styles.tokenConfigModalOverlay} onClick={onClose}>
      <div className={styles.tokenConfigModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Token Configuration</h2>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>
        
        {/* Tabs */}
        <div className={styles.tabs}>
          <button 
            className={`${styles.tab} ${activeTab === 'stats' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('stats')}
          >
            Stats & Settings
          </button>
          {isDev && (
            <button
              className={`${styles.tab} ${activeTab === 'debug' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('debug')}
            >
              Technical Info
            </button>
          )}
        </div>
        
        <div className={styles.modalContent}>
          {activeTab === 'stats' ? (
          <>
          {/* Character Linking */}
          <div className={styles.configSection}>
            <label htmlFor="character-select">Link to Character:</label>
            <select
              id="character-select"
              value={selectedCharacterId}
              onChange={(e) => handleCharacterLink(e.target.value)}
              className={styles.characterSelect}
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
          <div className={styles.configSection}>
            <div className={styles.statRow}>
              <label>HP:</label>
              <div className={styles.hpInputGroup}>
                <button
                  className={styles.hpButton}
                  onClick={() => handleHpChange(Math.max(0, localHp - 1))}
                >
                  −
                </button>
                <input
                  type="number"
                  value={localHp}
                  onChange={(e) => handleHpChange(Math.max(0, parseInt(e.target.value) || 0))}
                  className={styles.hpInput}
                  min="0"
                  max={localMaxHp}
                />
                <button
                  className={styles.hpButton}
                  onClick={() => handleHpChange(Math.min(localMaxHp, localHp + 1))}
                >
                  +
                </button>
              </div>
            </div>
            
            <div className={styles.hpBarContainer}>
              <div
                className={styles.hpBarFill}
                style={{ 
                  width: `${hpPercentage}%`,
                  backgroundColor: hpPercentage > 50 ? '#4ade80' : hpPercentage > 25 ? '#fbbf24' : '#ef4444'
                }}
              />
              <span className={styles.hpBarText}>{localHp} / {localMaxHp}</span>
            </div>
          </div>

          <div className={styles.configSection}>
            <div className={styles.statRow}>
              <label>Max HP:</label>
              <input
                type="number"
                value={localMaxHp}
                onChange={(e) => handleMaxHpChange(Math.max(1, parseInt(e.target.value) || 1))}
                className={styles.hpInput}
                min="1"
              />
            </div>
          </div>

          <div className={styles.configSection}>
            <div className={styles.statRow}>
              <label>Armor Class (AC):</label>
              <input
                type="number"
                value={localAc}
                onChange={(e) => handleAcChange(Math.max(0, parseInt(e.target.value) || 10))}
                className={styles.hpInput}
                min="0"
              />
            </div>
          </div>

          <div className={styles.configSection}>
            <div className={styles.statRow}>
              <label>Aura Radius:</label>
              <input
                type="number"
                value={localAuraRadius}
                onChange={(e) => handleAuraRadiusChange(Math.max(0, parseFloat(e.target.value) || 0))}
                className={styles.hpInput}
                min="0"
                step="5"
              />
              <span style={{ marginLeft: '8px', color: '#888' }}>ft</span>
            </div>
          </div>

          {/* Character Info - Only show if linked */}
          {linkedCharacter && (
            <div className={styles.characterInfo}>
              <h3>{linkedCharacter.name}</h3>
              <p className={styles.characterDetails}>
                Level {linkedCharacter.data?.level || 1} {linkedCharacter.data?.race || 'Unknown'} {linkedCharacter.data?.class || 'Unknown'}
              </p>
              <p className={styles.syncNote} style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>
                ✓ Token stats synced with character
              </p>
            </div>
          )}
          
          {!linkedCharacter && (
            <div className={styles.noCharacterMessage}>
              <p style={{ color: '#888', fontStyle: 'italic' }}>
                No character linked - token stats are independent
              </p>
            </div>
          )}
          </>
          ) : (
            /* Debug Tab */
            <div className={styles.debugPanel}>
              <h3 style={{ marginBottom: '16px', color: '#4ade80' }}>🔧 Technical Information</h3>
              
              <div className={styles.debugSection}>
                <h4>Sprite ID & References</h4>
                <div className={styles.debugGrid}>
                  <div className={styles.debugItem}>
                    <span className={styles.debugLabel}>Sprite ID:</span>
                    <code className={styles.debugValue}>{sprite?.id || 'N/A'}</code>
                  </div>
                  <div className={styles.debugItem}>
                    <span className={styles.debugLabel}>Character ID:</span>
                    <code className={styles.debugValue}>{sprite?.characterId || 'None'}</code>
                  </div>
                  <div className={styles.debugItem}>
                    <span className={styles.debugLabel}>Table ID:</span>
                    <code className={styles.debugValue}>{sprite?.tableId || 'N/A'}</code>
                  </div>
                  <div className={styles.debugItem}>
                    <span className={styles.debugLabel}>Asset ID:</span>
                    <code className={styles.debugValue}>{(sprite as any)?.assetId || (sprite as any)?.asset_id || 'None'}</code>
                  </div>
                  <div className={styles.debugItem}>
                    <span className={styles.debugLabel}>Asset Hash:</span>
                    <code className={styles.debugValue}>{(sprite as any)?.asset_xxhash || 'None'}</code>
                  </div>
                </div>
              </div>
              
              <div className={styles.debugSection}>
                <h4>Position & Transform</h4>
                <div className={styles.debugGrid}>
                  <div className={styles.debugItem}>
                    <span className={styles.debugLabel}>X Position:</span>
                    <code className={styles.debugValue}>{sprite?.x?.toFixed(2) || '0'}</code>
                  </div>
                  <div className={styles.debugItem}>
                    <span className={styles.debugLabel}>Y Position:</span>
                    <code className={styles.debugValue}>{sprite?.y?.toFixed(2) || '0'}</code>
                  </div>
                  <div className={styles.debugItem}>
                    <span className={styles.debugLabel}>Rotation:</span>
                    <code className={styles.debugValue}>{sprite?.rotation?.toFixed(2) || '0'}°</code>
                  </div>
                  <div className={styles.debugItem}>
                    <span className={styles.debugLabel}>Scale X:</span>
                    <code className={styles.debugValue}>{(sprite as any)?.scale?.x || (sprite as any)?.scaleX || '1'}</code>
                  </div>
                  <div className={styles.debugItem}>
                    <span className={styles.debugLabel}>Scale Y:</span>
                    <code className={styles.debugValue}>{(sprite as any)?.scale?.y || (sprite as any)?.scaleY || '1'}</code>
                  </div>
                  <div className={styles.debugItem}>
                    <span className={styles.debugLabel}>Layer:</span>
                    <code className={styles.debugValue}>{sprite?.layer || 'tokens'}</code>
                  </div>
                </div>
              </div>
              
              <div className={styles.debugSection}>
                <h4>Texture & Rendering</h4>
                <div className={styles.debugItem}>
                  <span className={styles.debugLabel}>Texture URL:</span>
                  <code className={styles.debugValue} style={{ wordBreak: 'break-all', fontSize: '10px' }}>
                    {sprite?.texture ? (sprite.texture.length > 150 ? sprite.texture.substring(0, 150) + '...' : sprite.texture) : 'None'}
                  </code>
                </div>
                <div className={styles.debugItem}>
                  <span className={styles.debugLabel}>Tint Color:</span>
                  <code className={styles.debugValue}>
                    {(sprite as any)?.tint_color ? `[${(sprite as any).tint_color.join(', ')}]` : '[1, 1, 1, 1]'}
                  </code>
                </div>
              </div>
              
              <div className={styles.debugSection}>
                <h4>Stats & Combat</h4>
                <div className={styles.debugGrid}>
                  <div className={styles.debugItem}>
                    <span className={styles.debugLabel}>HP:</span>
                    <code className={styles.debugValue}>{sprite?.hp || 0}</code>
                  </div>
                  <div className={styles.debugItem}>
                    <span className={styles.debugLabel}>Max HP:</span>
                    <code className={styles.debugValue}>{sprite?.maxHp || 0}</code>
                  </div>
                  <div className={styles.debugItem}>
                    <span className={styles.debugLabel}>AC:</span>
                    <code className={styles.debugValue}>{sprite?.ac || 10}</code>
                  </div>
                  <div className={styles.debugItem}>
                    <span className={styles.debugLabel}>Aura Radius:</span>
                    <code className={styles.debugValue}>{sprite?.auraRadius || 0} ft</code>
                  </div>
                  <div className={styles.debugItem}>
                    <span className={styles.debugLabel}>Controlled By:</span>
                    <code className={styles.debugValue}>
                      {Array.isArray(sprite?.controlledBy) ? sprite.controlledBy.join(', ') : sprite?.controlledBy || 'None'}
                    </code>
                  </div>
                </div>
              </div>
              
              <div className={styles.debugSection}>
                <h4>Raw Sprite Object</h4>
                <pre className={styles.debugJson}>
                  {JSON.stringify(sprite, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
        
        <div className={styles.modalFooter}>
          <button className={styles.doneButton} onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
};
