import React, { useEffect, useState, useCallback } from "react";
import { useAuthenticatedWebSocket } from "../hooks/useAuthenticatedWebSocket";
import type { UserInfo } from "../services/auth.service";
import { MessageType } from "../protocol/message";
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

  // Fetch character list
  useEffect(() => {
    setLoading(true);
    protocol?.sendMessage({ type: MessageType.CHARACTER_LIST_REQUEST, priority: 1 })
      .catch(() => setError("Failed to fetch characters"))
      .finally(() => setLoading(false));
    // Listen for character list response
    const handler = (msg: any) => {
      if (msg.type === MessageType.CHARACTER_LIST_RESPONSE) {
        setCharacters(msg.data.characters);
      }
    };
    protocol?.onMessage?.(handler);
    return () => protocol?.offMessage?.(handler);
  }, [protocol]);

  // CRUD operations
  const handleCreate = useCallback(async (character: Partial<Character>) => {
    setLoading(true);
    try {
      await protocol?.sendMessage({ type: MessageType.CHARACTER_SAVE_REQUEST, data: character, priority: 1 });
    } catch {
      setError("Failed to create character");
    } finally {
      setLoading(false);
    }
  }, [protocol]);

  const handleUpdate = useCallback(async (character: Character) => {
    setLoading(true);
    try {
      await protocol?.sendMessage({ type: MessageType.CHARACTER_SAVE_REQUEST, data: character, priority: 1 });
    } catch {
      setError("Failed to update character");
    } finally {
      setLoading(false);
    }
  }, [protocol]);

  const handleDelete = useCallback(async (id: string) => {
    setLoading(true);
    try {
      await protocol?.sendMessage({ type: MessageType.CHARACTER_DELETE_REQUEST, data: { id }, priority: 1 });
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
