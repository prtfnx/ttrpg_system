import React, { useCallback, useEffect, useState } from "react";
import { useAuthenticatedWebSocket } from "../hooks/useAuthenticatedWebSocket";
import { MessageType, createMessage } from "../protocol/message";
import type { UserInfo } from "../services/auth.service";
import { useCharacterStore } from "../store/characterStore";
import { CharacterCreationForm } from "./CharacterCreationForm";
import { CharacterSheet } from "./CharacterSheet";

export interface Character {
  id: string;
  name: string;
  class: string;
  race: string;
  level: number;
  stats: Record<string, number>;
  owner: string;
}

interface CharacterManagerProps {
  sessionCode: string;
  userInfo: UserInfo;
}



export const CharacterManager: React.FC<CharacterManagerProps> = ({ sessionCode, userInfo }) => {
  const { protocol } = useAuthenticatedWebSocket({ sessionCode, userInfo });
  const { characters: localCharacters, addCharacter, removeCharacter } = useCharacterStore();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const [showSimpleForm, setShowSimpleForm] = useState<boolean>(false);
  const [presence, setPresence] = useState<Array<{ username: string; editing: boolean }>>([]);
  const [mutationQueue, setMutationQueue] = useState<Array<{ type: 'create'|'update'|'delete'; payload: any; tempId?: string }>>([]);

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
            name: 'Test Fighter',
            class: 'Fighter',
            race: 'Human',
            level: 1,
            stats: { str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 8 },
            owner: userInfo.username
          },
          {
            id: 'local-2', 
            name: 'Test Wizard',
            class: 'Wizard',
            race: 'Elf',
            level: 1,
            stats: { str: 8, dex: 14, con: 12, int: 16, wis: 13, cha: 10 },
            owner: userInfo.username
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
    setCharacters(prev => [...prev, { ...character, id: tempId, owner: userInfo.username } as Character]);
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
    if (!character.class || typeof character.class !== 'string') return 'Class is required.';
    if (!character.race || typeof character.race !== 'string') return 'Race is required.';
    if (typeof character.level !== 'number' || character.level < 1) return 'Level must be a positive number.';
    if (!character.stats || typeof character.stats !== 'object') return 'Stats are required.';
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

  if (loading) return <div className="loading">Loading characters...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="character-manager">
      <h2>Characters</h2>
      
      {/* Network Characters */}
      <h3>Session Characters</h3>
      <ul>
        {characters.map((char) => (
          <li key={char.id}>
            <button onClick={() => setSelectedCharacter(char)}>{char.name}</button>
            {(userInfo.role === "dm" || char.owner === userInfo.username) && (
              <>
                <button onClick={() => setSelectedCharacter(char)}>Edit</button>
                <button onClick={() => handleDelete(char.id)}>Delete</button>
              </>
            )}
          </li>
        ))}
      </ul>
      
      {/* Local Characters from Store */}
      <h3>Local Characters</h3>
      <ul>
        {localCharacters.map((char) => (
          <li key={char.id}>
            <button onClick={() => {
              // Convert local character to network character format for editing
              const networkChar: Character = {
                id: char.id,
                name: char.name,
                class: char.class,
                race: 'Unknown', // Store doesn't have race, add default
                level: 1, // Store doesn't have level, add default
                stats: {
                  strength: char.stats.strength,
                  dexterity: char.stats.dexterity,
                  constitution: char.stats.constitution,
                  intelligence: char.stats.intelligence,
                  wisdom: char.stats.wisdom,
                  charisma: char.stats.charisma,
                },
                owner: userInfo.username
              };
              setSelectedCharacter(networkChar);
            }}>{char.name}</button>
            <button onClick={() => removeCharacter(char.id)}>Delete</button>
          </li>
        ))}
      </ul>
      
      <div style={{ margin: '10px 0' }}>
        <button onClick={() => { setSelectedCharacter(null); setShowSimpleForm(false); }}>
          Create New Character (Full Editor)
        </button>
        <button onClick={() => { setSelectedCharacter(null); setShowSimpleForm(true); }}>
          Quick Create Character
        </button>
      </div>
      
      {selectedCharacter ? (
        <CharacterSheet
          character={selectedCharacter}
          onSave={handleUpdate}
          lockedBy={lockedBy}
          presence={presence}
          onRequestLock={handleRequestLock}
          onReleaseLock={handleReleaseLock}
          onSync={handleSync}
        />
      ) : showSimpleForm ? (
        <CharacterCreationForm onCreate={(data) => {
          // Add to local store and optionally sync to network
          addCharacter({
            name: data.name,
            class: data.class,
            stats: {
              strength: 10,
              dexterity: 10,
              constitution: 10,
              intelligence: 10,
              wisdom: 10,
              charisma: 10,
            },
            inventory: [],
            conditions: [],
          });
          
          // Also create on network if needed
          const networkChar = {
            name: data.name,
            class: data.class,
            race: data.race,
            level: data.level,
            stats: {
              strength: 10,
              dexterity: 10,
              constitution: 10,
              intelligence: 10,
              wisdom: 10,
              charisma: 10,
            },
          };
          optimisticCreate(networkChar);
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
    </div>
  );
};
