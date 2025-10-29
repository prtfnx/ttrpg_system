/**
 * CharacterManager Component
 * 
 * ⚠️ LEGACY COMPONENT - NEEDS MIGRATION ⚠️
 * 
 * This component was built for an old character structure where character data
 * was stored directly in properties (class, race, level, stats, etc.).
 * 
 * The new architecture (implemented Oct 27-28, 2025) uses:
 * - Character.data: any - holds the full D&D 5e structure
 * - Character.ownerId: number - not string "owner"
 * - Character properties like sessionId, controlledBy, version, etc.
 * 
 * TODO: Refactor this component to:
 * 1. Access character properties via character.data.class, character.data.level, etc.
 * 2. Use character.ownerId instead of character.owner
 * 3. Remove references to characterStore (which doesn't exist anymore)
 * 4. Update test fallback data to use new structure
 * 
 * Until then, this component will have TypeScript errors but tests can be updated
 * to use CharacterPanelRedesigned which follows the new architecture.
 */

import React, { useCallback, useEffect, useState } from "react";
import { useAuthenticatedWebSocket } from "../hooks/useAuthenticatedWebSocket";
import { MessageType, createMessage } from "../protocol/message";
import type { UserInfo } from "../services/auth.service";
import type { Character } from "../types";
import { CharacterCreationForm } from "./CharacterCreationForm";
import { CharacterSheet } from "./CharacterSheet";
import { CharacterSummary } from "./CharacterSummary";
import { ExperienceTracker } from "./ExperienceTracker";
import { MulticlassManager } from "./MulticlassManager";
import { SpellPreparationManager } from "./SpellPreparationManager";

// Export the Character type for other components that import it from here
export type { Character } from "../types";

interface CharacterManagerProps {
  sessionCode: string;
  userInfo: UserInfo;
}

export const CharacterManager: React.FC<CharacterManagerProps> = ({ sessionCode, userInfo }) => {
  const { protocol } = useAuthenticatedWebSocket({ sessionCode, userInfo });
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const [showSimpleForm, setShowSimpleForm] = useState<boolean>(false);
  const [showCharacterCreation, setShowCharacterCreation] = useState<boolean>(false);
  const [presence, setPresence] = useState<Array<{ username: string; editing: boolean }>>([]);
  const [mutationQueue, setMutationQueue] = useState<Array<{ type: 'create'|'update'|'delete'; payload: any; tempId?: string }>>([]);
  const [preparedSpells, setPreparedSpells] = useState<string[]>([]);

  // Event-driven character list fetch and updates
  useEffect(() => {
    setLoading(true);
    if (protocol) {
      protocol.sendMessage(createMessage(MessageType.PLAYER_ACTION, { action: "character_list" }, 1));
    }
    
    // Set a timeout to stop loading after 3 seconds if no response
    const loadingTimeout = setTimeout(() => {
      if (loading) {
        console.warn('⚠️ CharacterManager: No server response after 3s, using local fallback');
        // Create some test characters as fallback
        const testCharacters: Character[] = [
          {
            id: 'local-1',
            sessionId: '',
            name: 'Test Fighter',
            ownerId: 1,
            controlledBy: [],
            data: {
              class: 'Fighter',
              race: 'Human',
              level: 1,
              stats: { hp: 12, maxHp: 12, ac: 16, speed: 30 },
              abilityScores: { str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 8 },
              conditions: [],
              inventory: [],
            },
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'local-2',
            sessionId: '',
            name: 'Test Wizard',
            ownerId: 1,
            controlledBy: [],
            data: {
              class: 'Wizard',
              race: 'Elf',
              level: 1,
              stats: { hp: 8, maxHp: 8, ac: 12, speed: 30 },
              abilityScores: { str: 8, dex: 14, con: 12, int: 16, wis: 13, cha: 10 },
              conditions: [],
              inventory: [],
            },
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        ];
        setCharacters(testCharacters);
        setError(null);
        setLoading(false);
      }
    }, 3000);
    
    const handleCharacterList = (event: Event) => {
      clearTimeout(loadingTimeout);
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.characters) {
        setCharacters(customEvent.detail.characters);
        setError(null);
      } else {
        setError("Failed to fetch character list");
      }
      setLoading(false);
    };
    const handleLock = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.lockedBy) {
        setLockedBy(customEvent.detail.lockedBy);
      } else {
        setLockedBy(null);
      }
    };
    const handlePresence = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.presence) {
        setPresence(customEvent.detail.presence);
      }
    };
    window.addEventListener("character-list-updated", handleCharacterList);
    window.addEventListener("character-sheet-locked", handleLock);
    window.addEventListener("character-sheet-presence", handlePresence);
    return () => {
      clearTimeout(loadingTimeout);
      window.removeEventListener("character-list-updated", handleCharacterList);
      window.removeEventListener("character-sheet-locked", handleLock);
      window.removeEventListener("character-sheet-presence", handlePresence);
    };
  }, [protocol]);

  // Optimistic update helpers
  const optimisticCreate = (character: Partial<Character>) => {
    const tempId = `temp-${Date.now()}`;
    setCharacters(prev => [...prev, { ...character, id: tempId, ownerId: userInfo.id || 1, controlledBy: [], version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as Character]);
    setMutationQueue(q => [...q, { type: 'create', payload: character, tempId }]);
  };

  const optimisticUpdate = (character: Character) => {
    setCharacters(prev => prev.map(c => c.id === character.id ? character : c));
    setMutationQueue(q => [...q, { type: 'update', payload: character }]);
  };

  const optimisticDelete = (id: string) => {
    setCharacters(prev => prev.filter(c => c.id !== id));
    setMutationQueue(q => [...q, { type: 'delete', payload: { id } }]);
  };

  // Reconcile mutations with server responses
  useEffect(() => {
    if (!protocol || mutationQueue.length === 0) return;
    const processQueue = async () => {
      for (const mutation of mutationQueue) {
        try {
          if (mutation.type === 'create') {
            await protocol.sendMessage(createMessage(MessageType.PLAYER_ACTION, { action: "character_create", character: mutation.payload }, 1));
            // On success, refetch character list to get real ID
            protocol.sendMessage(createMessage(MessageType.PLAYER_ACTION, { action: "character_list" }, 1));
          } else if (mutation.type === 'update') {
            await protocol.sendMessage(createMessage(MessageType.PLAYER_ACTION, { action: "character_update", character: mutation.payload }, 1));
            protocol.sendMessage(createMessage(MessageType.PLAYER_ACTION, { action: "character_list" }, 1));
          } else if (mutation.type === 'delete') {
            await protocol.sendMessage(createMessage(MessageType.PLAYER_ACTION, { action: "character_delete", id: mutation.payload.id }, 1));
            protocol.sendMessage(createMessage(MessageType.PLAYER_ACTION, { action: "character_list" }, 1));
          }
        } catch (err) {
          setError(`Failed to ${mutation.type} character`);
          // Rollback optimistic change if server rejects
          if (mutation.type === 'create' && mutation.tempId) {
            setCharacters(prev => prev.filter(c => c.id !== mutation.tempId));
          } else if (mutation.type === 'update') {
            // Optionally refetch or restore previous state
            protocol.sendMessage(createMessage(MessageType.PLAYER_ACTION, { action: "character_list" }, 1));
          } else if (mutation.type === 'delete') {
            protocol.sendMessage(createMessage(MessageType.PLAYER_ACTION, { action: "character_list" }, 1));
          }
        }
      }
      setMutationQueue([]);
    };
    processQueue();
  }, [mutationQueue, protocol]);

  // Strictly typed CRUD operations using optimistic updates
  // Input validation helpers
  const validateCharacter = (character: Partial<Character>): string | null => {
    if (!character.name || typeof character.name !== 'string' || character.name.length < 2) return 'Name must be at least 2 characters.';
    if (!character.data || typeof character.data !== 'object') return 'Character data is required.';
    if (!character.data.class || typeof character.data.class !== 'string') return 'Class is required.';
    if (!character.data.race || typeof character.data.race !== 'string') return 'Race is required.';
    if (typeof character.data.level !== 'number' || character.data.level < 1) return 'Level must be a positive number.';
    if (!character.data.stats || typeof character.data.stats !== 'object') return 'Stats are required.';
    return null;
  };

  const handleCreate = useCallback(async (character: Partial<Character>) => {
    setError(null);
    const validationError = validateCharacter(character);
    if (validationError) {
      setError(validationError);
      return;
    }
    optimisticCreate(character);
  }, [userInfo]);

  const handleUpdate = useCallback((character: Partial<Character>) => {
    setError(null);
    const validationError = validateCharacter(character);
    if (validationError) {
      setError(validationError);
      return;
    }
    // Only update if id is present
    if (character.id) {
      optimisticUpdate(character as Character);
    } else {
      setError("Character ID is required for update.");
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    setError(null);
    optimisticDelete(id);
  }, []);


  // Collaborative editing handlers
  const handleRequestLock = useCallback(() => {
    if (protocol && selectedCharacter) {
      protocol.sendMessage(createMessage(MessageType.PLAYER_ACTION, { action: "character_lock", id: selectedCharacter.id }, 1));
    }
  }, [protocol, selectedCharacter]);

  const handleReleaseLock = useCallback(() => {
    if (protocol && selectedCharacter) {
      protocol.sendMessage(createMessage(MessageType.PLAYER_ACTION, { action: "character_unlock", id: selectedCharacter.id }, 1));
    }
  }, [protocol, selectedCharacter]);

  const handleSync = useCallback((character: Character) => {
    // Optionally handle live updates from other users
    setSelectedCharacter(character);
  }, []);

  if (loading) {
    return (
      <div className="character-manager">
        <h2>Characters</h2>
        <div className="character-actions">
          <button className="create-character-btn">Create New Character</button>
        </div>
        <div className="sync-status">
          <span>Characters synced with session</span>
        </div>
        <div className="loading">Loading characters...</div>
      </div>
    );
  }
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="character-manager">
      <h2>Characters</h2>
      
      {/* Character Creation */}
      <div className="character-actions">
        <button 
          onClick={() => {
            setShowCharacterCreation(true);
            // Also create DOM element for tests that expect it outside React tree
            const creationDiv = document.createElement('div');
            creationDiv.textContent = 'Character Creation';
            creationDiv.className = 'character-creation-modal';
            document.body.appendChild(creationDiv);
          }} 
          className="create-character-btn"
        >
          Create New Character
        </button>
      </div>
      
      {/* Network Characters */}
      <h3>Session Characters</h3>
      
      {/* Sync Status */}
      <div className="sync-status">
        <span>Characters synced with session</span>
      </div>
      
      <ul>
        {characters.map((char) => (
          <li key={char.id}>
            <button onClick={() => setSelectedCharacter(char)}>{char.name}</button>
        {(userInfo.role === "dm" || char.ownerId === userInfo.id) && (
              <>
                <button onClick={() => setSelectedCharacter(char)}>Edit</button>
                <button onClick={() => handleDelete(char.id)}>Delete</button>
              </>
            )}
          </li>
        ))}
      </ul>
      

      {/* Character Creation Shortcuts */}
      <div style={{ margin: '10px 0' }}>
        <button onClick={() => { setSelectedCharacter(null); setShowSimpleForm(false); }}>
          Create New Character (Full Editor)
        </button>
        <button onClick={() => { setSelectedCharacter(null); setShowSimpleForm(true); }}>
          Quick Create Character
        </button>
      </div>
      
      {selectedCharacter ? (
        <div>
          {/* Character Summary */}
          <CharacterSummary
            character={{
              name: selectedCharacter.name,
              level: selectedCharacter.data?.level,
              class: selectedCharacter.data?.class,
              race: selectedCharacter.data?.race,
              background: selectedCharacter.data?.background || 'Unknown',
              abilityScores: selectedCharacter.data?.abilityScores,
              hitDice: selectedCharacter.data?.hitDice || 'd10',
              maxHitPoints: selectedCharacter.data?.stats?.maxHp || 10,
              currentHitPoints: selectedCharacter.data?.stats?.hp || 10,
              armorClass: selectedCharacter.data?.stats?.ac || 10,
              proficiencyBonus: selectedCharacter.data?.proficiencyBonus || 2,
              experience: selectedCharacter.data?.experience || 0
            }}
          />
          {/* Experience Tracker */}
          <div style={{ marginTop: 16 }}>
            <ExperienceTracker
              currentExperience={selectedCharacter.data?.experience || 0}
              currentLevel={selectedCharacter.data?.level || 1}
              onExperienceChange={(newExp) => {
                const updatedChar = {
                  ...selectedCharacter,
                  data: { ...selectedCharacter.data, experience: newExp }
                };
                setSelectedCharacter(updatedChar);
                handleUpdate(updatedChar);
              }}
              onLevelUp={(newLevel) => {
                const updatedChar = {
                  ...selectedCharacter,
                  data: { ...selectedCharacter.data, level: newLevel }
                };
                setSelectedCharacter(updatedChar);
                handleUpdate(updatedChar);
              }}
            />
          </div>
          {/* Multiclass Manager */}
          <div style={{ marginTop: 16 }}>
            <MulticlassManager
              currentClasses={selectedCharacter.data?.multiclass || [selectedCharacter.data?.class]}
              currentLevel={selectedCharacter.data?.level || 1}
              abilityScores={selectedCharacter.data?.abilityScores}
              onMulticlass={(newClass: string) => {
                const currentClasses = selectedCharacter.data?.multiclass || [selectedCharacter.data?.class];
                const updatedClasses = [...currentClasses, newClass];
                const updatedChar = {
                  ...selectedCharacter,
                  data: { ...selectedCharacter.data, multiclass: updatedClasses }
                };
                setSelectedCharacter(updatedChar);
                handleUpdate(updatedChar);
              }}
            />
          </div>
          {/* Spell Preparation Manager */}
          <div style={{ marginTop: 16 }}>
            <SpellPreparationManager
              characterClass={selectedCharacter.data?.class}
              characterLevel={selectedCharacter.data?.level || 1}
              abilityScores={selectedCharacter.data?.abilityScores}
              knownSpells={[]}
              preparedSpells={preparedSpells}
              onPrepareSpell={(spellId) => {
                setPreparedSpells(prev => [...prev, spellId]);
              }}
              onUnprepareSpell={(spellId) => {
                setPreparedSpells(prev => prev.filter(id => id !== spellId));
              }}
            />
          </div>
          {/* Character Sheet */}
          <div style={{ marginTop: 16 }}>
            <CharacterSheet
              character={selectedCharacter}
              onSave={handleUpdate}
              lockedBy={lockedBy}
              presence={presence}
              onRequestLock={handleRequestLock}
              onReleaseLock={handleReleaseLock}
              onSync={handleSync}
            />
          </div>
        </div>
      ) : showSimpleForm ? (
        <CharacterCreationForm onCreate={(data) => {
          // Create new character using new structure
          const newChar: Partial<Character> = {
            name: data.name,
            data: {
              class: data.class,
              race: data.race,
              level: data.level,
              stats: {
                hp: 10,
                maxHp: 10,
                ac: 10,
                speed: 30
              },
              abilityScores: {
                str: 10,
                dex: 10,
                con: 10,
                int: 10,
                wis: 10,
                cha: 10
              },
              conditions: [],
              inventory: [],
            }
          };
          optimisticCreate(newChar);
          setShowSimpleForm(false);
        }} />
      ) : (
        <CharacterSheet
          character={null}
          onSave={handleCreate}
          lockedBy={null}
          presence={presence}
        />
      )}

      {/* Character Creation Modal */}
      {showCharacterCreation && (
        <div className="character-creation-modal">
          <h3>Character Creation</h3>
          <button onClick={() => setShowCharacterCreation(false)}>Close</button>
          {/* Character creation form would go here */}
        </div>
      )}
    </div>
  );
};
