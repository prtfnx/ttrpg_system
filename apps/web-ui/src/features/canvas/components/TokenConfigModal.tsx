import { useGameStore } from '@/store';
import { authService } from '@features/auth';
import { isDM } from '@features/session/types/roles';
import { useProtocol } from '@lib/api';
import { Check } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import styles from './TokenConfigModal.module.css';

interface TokenConfigModalProps {
  spriteId: string;
  onClose: () => void;
  // When true, renders without the overlay backdrop (used inside FloatingWindow)
  inline?: boolean;
}

export const TokenConfigModal: React.FC<TokenConfigModalProps> = ({ spriteId, onClose, inline = false }) => {
  const { sprites, characters, sessionRole, unlinkSpriteFromCharacter, getCharacterForSprite, updateSprite } = useGameStore();
  const distanceUnit = useGameStore(s => s.distanceUnit);
  const { protocol, isConnected } = useProtocol();

  const sprite = sprites.find(s => s.id === spriteId);
  const linkedCharacter = sprite?.characterId ? getCharacterForSprite(spriteId) : null;
  const canManageOwnership = isDM(sessionRole);

 const [selectedCharacterId, setSelectedCharacterId] = useState<string>(sprite?.characterId || '');
 const [localHp, setLocalHp] = useState<number>(sprite?.hp ?? linkedCharacter?.data?.stats?.hp ?? 10);
 const [localMaxHp, setLocalMaxHp] = useState<number>(sprite?.maxHp ?? linkedCharacter?.data?.stats?.maxHp ?? 10);
 const [localAc, setLocalAc] = useState<number>(sprite?.ac ?? linkedCharacter?.data?.stats?.ac ?? 10);
 const [localAuraRadius, setLocalAuraRadius] = useState<number>(sprite?.auraRadiusUnits ?? (sprite?.auraRadius ? useGameStore.getState().getUnitConverter().toUnits(sprite.auraRadius) : 0));
 const [localAuraColor, setLocalAuraColor] = useState<string>(sprite?.auraColor ?? '#ffe4b5');
 const [localVisionRadius, setLocalVisionRadius] = useState<number | ''>(sprite?.visionRadiusUnits ?? (sprite?.visionRadius ? useGameStore.getState().getUnitConverter().toUnits(sprite.visionRadius) : ''));
 const [localHasDarkvision, setLocalHasDarkvision] = useState<boolean>(sprite?.hasDarkvision ?? false);
 const [localDarkvisionRadius, setLocalDarkvisionRadius] = useState<number | ''>(sprite?.darkvisionRadiusUnits ?? (sprite?.darkvisionRadius ? useGameStore.getState().getUnitConverter().toUnits(sprite.darkvisionRadius) : ''));
 const [newOwnerId, setNewOwnerId] = useState<string>('');
 const [sessionPlayers, setSessionPlayers] = useState<{ id: string; name: string }[]>([]);

  // Fetch session player list for DM ownership controls
  useEffect(() => {
    if (!canManageOwnership || !protocol || !isConnected) return;
    protocol.requestPlayerList();
    const handler = (e: Event) => {
      const players = (e as CustomEvent).detail?.players;
      if (Array.isArray(players)) {
        // Server returns { user_id, username, client_id, ... }
        setSessionPlayers(players.map((p: { user_id?: number; username?: string; client_id?: string }) => ({
          id: String(p.user_id ?? p.id ?? ''),
          name: p.username || p.name || `User #${p.user_id ?? p.id}`
        })));
      }
    };
    window.addEventListener('player-list-updated', handler);
    return () => window.removeEventListener('player-list-updated', handler);
 }, [canManageOwnership, protocol, isConnected]);

  // Load characters if not already loaded
  useEffect(() => {
    const userInfo = authService.getUserInfo();
    const currentUserId = userInfo?.id || 0;
    
    if (protocol && isConnected && currentUserId && characters.length === 0) {
      console.log('[TokenConfigModal] Loading character list for user:', currentUserId);
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
      setLocalAuraRadius(sprite.auraRadiusUnits ?? (sprite.auraRadius ? useGameStore.getState().getUnitConverter().toUnits(sprite.auraRadius) : 0));
      setLocalAuraColor(sprite.auraColor ?? '#ffe4b5');
      setLocalVisionRadius(sprite.visionRadiusUnits ?? (sprite.visionRadius ? useGameStore.getState().getUnitConverter().toUnits(sprite.visionRadius) : ''));
      setLocalHasDarkvision(sprite.hasDarkvision ?? false);
      setLocalDarkvisionRadius(sprite.darkvisionRadiusUnits ?? (sprite.darkvisionRadius ? useGameStore.getState().getUnitConverter().toUnits(sprite.darkvisionRadius) : ''));
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
        
        // Auto-populate darkvision from character race data (already in feet from compendium)
        const raceDarkvision: number | undefined = char.data?.race_traits?.darkvision ?? char.data?.darkvision;
        let darkvisionInTableUnits: number | undefined;
        if (raceDarkvision != null && raceDarkvision > 0) {
          const converter = useGameStore.getState().getUnitConverter();
          darkvisionInTableUnits = converter.fromFeet(raceDarkvision);
          setLocalHasDarkvision(true);
          setLocalDarkvisionRadius(darkvisionInTableUnits);
        }

        // Single update: link character AND sync stats in one call
        updateSprite(spriteId, { 
          characterId, 
          hp: newHp, 
          maxHp: newMaxHp, 
          ac: newAc,
          ...(darkvisionInTableUnits != null
            ? { hasDarkvision: true, darkvisionRadiusUnits: darkvisionInTableUnits }
            : {}),
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
    // newRadius is in game units (ft/m); convert to px for WASM rendering
    const conv = useGameStore.getState().getUnitConverter();
    updateSprite(spriteId, { auraRadiusUnits: newRadius, auraRadius: conv.toPixels(newRadius) });
  };

  const handleAuraColorChange = (newColor: string) => {
    setLocalAuraColor(newColor);
    updateSprite(spriteId, { auraColor: newColor });
  };

  const hpPercentage = localMaxHp > 0 ? (localHp / localMaxHp) * 100 : 0;

  // Current ownership list
  const controlledBy: string[] = Array.isArray(sprite?.controlledBy)
    ? sprite!.controlledBy.map(String)
 : [];

  const handleAddOwner = () => {
    const id = newOwnerId.trim();
    if (!id || controlledBy.includes(id)) return;
    updateSprite(spriteId, { controlledBy: [...controlledBy, id] });
    setNewOwnerId('');
  };

  const handleRemoveOwner = (id: string) => {
    updateSprite(spriteId, { controlledBy: controlledBy.filter(x => x !== id) });
  };

  // Show all characters - don't filter by session since we might not have session info
  const sessionCharacters = characters;

  const body = (
    <div className={inline ? styles.inlineModal : styles.tokenConfigModal}
         onClick={inline ? undefined : (e) => e.stopPropagation()}>
      {!inline && (
        <div className={styles.modalHeader}>
          <h2>Token Configuration</h2>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>
      )}
      
      <div className={styles.modalContent}>
          {/* Ownership - DM/CO-DM only */}
          {canManageOwnership && (
            <div className={styles.ownershipSection}>
              <label>Token Ownership:</label>
              <div className={styles.ownershipTags}>
                {controlledBy.length === 0 && (
                  <p className={styles.noOwnersNote}>DM-only (no player controllers)</p>
                )}
                {controlledBy.map(id => {
                  const player = sessionPlayers.find(p => p.id === id);
                  const label = player ? player.name : `#${id}`;
                  return (
                    <span key={id} className={styles.ownerTag}>
                      {label}
                      <button
                        className={styles.ownerTagRemove}
                        onClick={() => handleRemoveOwner(id)}
                        title={`Remove ${label}`}
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
              <div className={styles.ownerInputRow}>
                <select
                  className={styles.ownerInput}
                  value={newOwnerId}
                  onChange={e => setNewOwnerId(e.target.value)}
                >
                  <option value="">-- Select player --</option>
                  {sessionPlayers
                    .filter(p => !controlledBy.includes(p.id))
                    .map(p => (
                      <option key={p.id} value={p.id}>{p.name} (#{p.id})</option>
                    ))
                  }
                </select>
                <button className={styles.ownerAddBtn} onClick={handleAddOwner} disabled={!newOwnerId}>Add</button>
              </div>
            </div>
          )}

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
              <span style={{ marginLeft: '8px', color: 'var(--text-muted)' }}>ft</span>
              <input
                type="color"
                value={localAuraColor}
                onChange={(e) => handleAuraColorChange(e.target.value)}
                title="Aura color"
                style={{ marginLeft: '8px', width: '32px', height: '24px', padding: '0', border: 'none', cursor: 'pointer', background: 'none' }}
              />
            </div>
          </div>

          {canManageOwnership && (
            <div className={styles.configSection}>
              <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: 'var(--text-secondary)' }}>Vision</h4>
              <div className={styles.statRow}>
                <label>Vision Radius:</label>
                <input
                  type="number"
                  value={localVisionRadius}
                  placeholder="default"
                  onChange={(e) => setLocalVisionRadius(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0))}
                  onBlur={() => {
                    if (localVisionRadius === '') {
                      updateSprite(spriteId, { visionRadiusUnits: undefined, visionRadius: undefined });
                    } else {
                      const units = Number(localVisionRadius);
                      const px = useGameStore.getState().getUnitConverter().toPixels(units);
                      updateSprite(spriteId, { visionRadiusUnits: units, visionRadius: px });
                    }
                  }}
                  className={styles.hpInput}
                  min="0"
                  step="5"
                />
                <span style={{ marginLeft: '8px', color: 'var(--text-muted)' }}>{distanceUnit}</span>
              </div>
              <div className={styles.statRow} style={{ marginTop: '6px' }}>
                <label>
                  <input
                    type="checkbox"
                    checked={localHasDarkvision}
                    onChange={(e) => {
                      setLocalHasDarkvision(e.target.checked);
                      updateSprite(spriteId, { hasDarkvision: e.target.checked });
                    }}
                  />{' '}Darkvision
                </label>
                {localHasDarkvision && (
                  <input
                    type="number"
                    value={localDarkvisionRadius}
                    placeholder="radius"
                    onChange={(e) => setLocalDarkvisionRadius(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0))}
                    onBlur={() => {
                      if (localDarkvisionRadius !== '') {
                        const units = Number(localDarkvisionRadius);
                        const px = useGameStore.getState().getUnitConverter().toPixels(units);
                        updateSprite(spriteId, { darkvisionRadiusUnits: units, darkvisionRadius: px });
                      }
                    }}
                    className={styles.hpInput}
                    min="0"
                    step="5"
                    style={{ marginLeft: '8px' }}
                  />
                )}
              </div>
            </div>
          )}

          {/* Character Info - Only show if linked */}
          {linkedCharacter && (
            <div className={styles.characterInfo}>
              <h3>{linkedCharacter.name}</h3>
              <p className={styles.characterDetails}>
                Level {linkedCharacter.data?.level || 1} {linkedCharacter.data?.race || 'Unknown'} {linkedCharacter.data?.class || 'Unknown'}
              </p>
              <p className={styles.syncNote} style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Check size={14} aria-hidden /> Token stats synced with character
              </p>
            </div>
          )}
          
          {!linkedCharacter && (
            <div className={styles.noCharacterMessage}>
              <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                No character linked - token stats are independent
              </p>
            </div>
          )}
        </div>
        
        <div className={styles.modalFooter}>
          <button className={styles.doneButton} onClick={onClose}>Done</button>
        </div>
    </div>
  );

  if (inline) return body;
  return (
    <div className={styles.tokenConfigModalOverlay} onClick={onClose}>
      {body}
    </div>
  );
};
