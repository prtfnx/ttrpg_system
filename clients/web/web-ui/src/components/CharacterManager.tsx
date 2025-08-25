import React, { useCallback, useEffect, useState } from "react";
import { useAuthenticatedWebSocket } from "../hooks/useAuthenticatedWebSocket";
import { MessageType, createMessage } from "../protocol/message";
import type { UserInfo } from "../services/auth.service";
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
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);

  // Fetch character list and subscribe to updates
  useEffect(() => {
    setLoading(true);
    protocol?.requestCharacterList();
    const handleCharacterList = (event: Event) => {
      const customEvent = event as CustomEvent;
      setCharacters(customEvent.detail.characters || []);
      setLoading(false);
    };
    window.addEventListener('character-list-updated', handleCharacterList);
    return () => window.removeEventListener('character-list-updated', handleCharacterList);
  }, [protocol]);

  // CRUD operations
  const handleCreate = useCallback((character: Partial<Character>) => {
    setLoading(true);
    try {
  protocol?.saveCharacter(character as unknown as Record<string, unknown>);
    } catch {
      setError("Failed to create character");
    } finally {
      setLoading(false);
    }
  }, [protocol]);

  const handleUpdate = useCallback((character: Character) => {
    setLoading(true);
    try {
  protocol?.saveCharacter(character as unknown as Record<string, unknown>);
    } catch {
      setError("Failed to update character");
    } finally {
      setLoading(false);
    }
  }, [protocol]);

  const handleDelete = useCallback((id: string) => {
    setLoading(true);
    try {
  protocol?.sendMessage(createMessage(MessageType.CHARACTER_DELETE_REQUEST, { id }, 1));
    } catch {
      setError("Failed to delete character");
    } finally {
      setLoading(false);
    }
  }, [protocol]);

  if (loading) return <div className="loading">Loading characters...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="character-manager">
      <h2>Characters</h2>
      <ul>
        {characters.map((char) => (
          <li key={char.id}>
            <button onClick={() => setSelectedCharacter(char)}>{char.name}</button>
            {userInfo.role === "dm" || char.owner === userInfo.username ? (
              <>
                <button onClick={() => handleUpdate(char)}>Edit</button>
                <button onClick={() => handleDelete(char.id)}>Delete</button>
              </>
            ) : null}
          </li>
        ))}
      </ul>
      <button onClick={() => setSelectedCharacter(null)}>Create New Character</button>
      {selectedCharacter ? (
        <CharacterSheet character={selectedCharacter} onSave={handleUpdate} />
      ) : (
        <CharacterSheet character={null} onSave={handleCreate} />
      )}
    </div>
  );
};
