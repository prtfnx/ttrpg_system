import { useGameStore } from '@/store';
import { authService } from '@features/auth';
import { useCharacterUpdateCommand } from '@features/character/hooks/useCharacterUpdateCommand';
import { isDM } from '@features/session/types/roles';
import { useProtocol } from '@lib/api';
import { Modal } from '@shared/components';
import { logger } from '@shared/utils/logger';
import clsx from 'clsx';
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
  const { submitCharacterUpdate } = useCharacterUpdateCommand();

  const sprite = sprites.find(s => s.id === spriteId);
  const linkedCharacter = sprite?.characterId ? getCharacterForSprite(spriteId) : null;
  const canManageOwnership = isDM(sessionRole);

 const [selectedCharacterId, setSelectedCharacterId] = useState<string>(sprite?.characterId || '');
 const [localHp, setLocalHp] = useState<number>(linkedCharacter ? linkedCharacter.data?.stats?.hp ?? 0 : sprite?.hp ?? 10);
 const [localMaxHp, setLocalMaxHp] = useState<number>(linkedCharacter ? linkedCharacter.data?.stats?.maxHp ?? 0 : sprite?.maxHp ?? 10);
 const [localAc, setLocalAc] = useState<number>(linkedCharacter ? linkedCharacter.data?.stats?.ac ?? 0 : sprite?.ac ?? 10);
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
          id: String(p.user_id ?? ''),
          name: p.username || `User #${p.user_id ?? '?'}`
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
      logger.debug('[TokenConfigModal] Loading character list for user', { currentUserId });
      protocol.requestCharacterList(currentUserId);
    }
 }, [protocol, isConnected, characters.length]);

  useEffect(() => {
    if (sprite?.characterId && !linkedCharacter && protocol && isConnected) {
      protocol.loadCharacter(sprite.characterId);
    }
  }, [sprite?.characterId, linkedCharacter, protocol, isConnected]);

  // Update local state when sprite or linked character changes
  useEffect(() => {
    if (sprite) {
      setLocalHp(linkedCharacter ? linkedCharacter.data?.stats?.hp ?? 0 : sprite.hp ?? 10);
      setLocalMaxHp(linkedCharacter ? linkedCharacter.data?.stats?.maxHp ?? 0 : sprite.maxHp ?? 10);
      setLocalAc(linkedCharacter ? linkedCharacter.data?.stats?.ac ?? 0 : sprite.ac ?? 10);
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

        // The server copies the current source stats while accepting the link.
        updateSprite(spriteId, { 
          characterId, 
          ...(darkvisionInTableUnits != null
            ? { hasDarkvision: true, darkvisionRadiusUnits: darkvisionInTableUnits }
            : {}),
        });
      } else {
        updateSprite(spriteId, { characterId });
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
    
    if (sprite.characterId) {
      if (linkedCharacter) submitCharacterUpdate(linkedCharacter.id, { data: { stats: { hp: newHp } } });
    } else updateSprite(spriteId, { hp: newHp });
  };

  const handleMaxHpChange = (newMaxHp: number) => {
    setLocalMaxHp(newMaxHp);
    if (sprite.characterId) {
      if (linkedCharacter) submitCharacterUpdate(linkedCharacter.id, { data: { stats: { maxHp: newMaxHp } } });
    } else updateSprite(spriteId, { maxHp: newMaxHp });
  };

  const handleAcChange = (newAc: number) => {
    setLocalAc(newAc);
    if (sprite.characterId) {
      if (linkedCharacter) submitCharacterUpdate(linkedCharacter.id, { data: { stats: { ac: newAc } } });
    } else updateSprite(spriteId, { ac: newAc });
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
  const statsUnavailable = Boolean(sprite.characterId && !linkedCharacter);

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

  const content = (
    <>
      <div className={inline ? styles.modalContent : undefined}>
          {/* Ownership - DM/CO-DM only */}
          {canManageOwnership && (
            <div className={styles.ownershipSection}>
              <label htmlFor="token-owner-select">Token Ownership:</label>
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
                  id="token-owner-select"
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
            {sprite.characterId && <p role="status">{statsUnavailable
              ? 'Load the linked character to edit its stats.'
              : linkedCharacter?.syncStatus === 'syncing' ? 'Saving character stats…'
              : linkedCharacter?.syncStatus === 'error' ? 'Character stats could not be confirmed. Review saved state before retrying.'
              : linkedCharacter?.syncStatus === 'local' ? 'Character stats are saved only on this page.'
              : 'Edits update the linked character. Use combat controls for encounter HP.'}</p>}
            <div className={styles.statRow}>
              <label htmlFor="token-current-hp">HP:</label>
              <div className={styles.hpInputGroup}>
                <button
                  type="button"
                  className={styles.hpButton}
                  onClick={() => handleHpChange(Math.max(0, localHp - 1))}
                  disabled={statsUnavailable}
                >
                  −
                </button>
                <input
                  id="token-current-hp"
                  type="number"
                  value={localHp}
                  onChange={(e) => handleHpChange(Math.max(0, parseInt(e.target.value) || 0))}
                  className={styles.hpInput}
                  min="0"
                  max={localMaxHp}
                  disabled={statsUnavailable}
                />
                <button
                  type="button"
                  className={styles.hpButton}
                  onClick={() => handleHpChange(Math.min(localMaxHp, localHp + 1))}
                  disabled={statsUnavailable}
                >
                  +
                </button>
              </div>
            </div>
            
            <div className={styles.hpBarContainer}>
              <div
                className={clsx(
                  styles.hpBarFill,
                  hpPercentage > 50
                    ? styles.hpHealthy
                    : hpPercentage > 25
                      ? styles.hpWarning
                      : styles.hpCritical
                )}
                style={{ width: `${hpPercentage}%` }}
              />
              <span className={styles.hpBarText}>{localHp} / {localMaxHp}</span>
            </div>
          </div>

          <div className={styles.configSection}>
            <div className={styles.statRow}>
              <label htmlFor="token-max-hp">Max HP:</label>
              <input
                id="token-max-hp"
                type="number"
                value={localMaxHp}
                onChange={(e) => handleMaxHpChange(Math.max(1, parseInt(e.target.value) || 1))}
                className={styles.hpInput}
                min="1"
                disabled={statsUnavailable}
              />
            </div>
          </div>

          <div className={styles.configSection}>
            <div className={styles.statRow}>
              <label htmlFor="token-armor-class">Armor Class (AC):</label>
              <input
                id="token-armor-class"
                type="number"
                value={localAc}
                onChange={(e) => handleAcChange(Math.max(0, parseInt(e.target.value) || 0))}
                className={styles.hpInput}
                min="0"
                disabled={statsUnavailable}
              />
            </div>
          </div>

          <div className={styles.configSection}>
            <div className={styles.statRow}>
              <label htmlFor="token-aura-radius">Aura Radius:</label>
              <div className={styles.inlineField}>
                <input
                  id="token-aura-radius"
                  type="number"
                  value={localAuraRadius}
                  onChange={(e) => handleAuraRadiusChange(Math.max(0, parseFloat(e.target.value) || 0))}
                  className={styles.hpInput}
                  min="0"
                  step="5"
                />
                <span className={styles.unitLabel}>ft</span>
                <input
                  className={styles.colorInput}
                  type="color"
                  value={localAuraColor}
                  onChange={(e) => handleAuraColorChange(e.target.value)}
                  title="Aura color"
                  aria-label="Aura color"
                />
              </div>
            </div>
          </div>

          {canManageOwnership && (
            <div className={styles.configSection}>
              <h4 className={styles.sectionTitle}>Vision</h4>
              <div className={styles.statRow}>
                <label htmlFor="token-vision-radius">Vision Radius:</label>
                <div className={styles.inlineField}>
                  <input
                    id="token-vision-radius"
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
                  <span className={styles.unitLabel}>{distanceUnit}</span>
                </div>
              </div>
              <div className={clsx(styles.statRow, styles.darkvisionRow)}>
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
                    aria-label="Darkvision radius"
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
              <p className={styles.syncNote}>
                <Check size={14} aria-hidden /> Token stats synced with character
              </p>
            </div>
          )}
          
          {!linkedCharacter && (
            <div className={styles.noCharacterMessage}>
              <p>
                No character linked - token stats are independent
              </p>
            </div>
          )}
        </div>
        
        <div className={styles.modalFooter}>
          <button type="button" className={styles.doneButton} onClick={onClose}>Done</button>
        </div>
    </>
  );

  if (inline) return <div className={styles.inlineModal}>{content}</div>;

  return (
    <Modal isOpen onClose={onClose} title="Token configuration">
      {content}
    </Modal>
  );
};
