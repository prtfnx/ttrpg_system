import React, { useState } from "react";
import type { Character } from "./CharacterManager";


interface CharacterSheetProps {
  character: Character | null;
  onSave: (character: Partial<Character>) => void;
  lockedBy?: string | null; // Collaborative editing lock
  presence?: Array<{ username: string; editing: boolean }>;
  onRequestLock?: () => void;
  onReleaseLock?: () => void;
  onSync?: (character: Character) => void;
}

export const CharacterSheet: React.FC<CharacterSheetProps> = ({ character, onSave, lockedBy, presence, onRequestLock, onReleaseLock, onSync }) => {
  const [form, setForm] = useState<Partial<Character>>(
    character || {
      name: "",
      class: "",
      race: "",
      level: 1,
      stats: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      owner: "",
    }
  );
  const [editing, setEditing] = useState<boolean>(false);


  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (lockedBy && lockedBy !== "me") return;
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setEditing(true);
    if (onRequestLock) onRequestLock();
  };


  const handleStatChange = (stat: string, value: number) => {
    if (lockedBy && lockedBy !== "me") return;
    setForm((prev) => ({
      ...prev,
      stats: { ...prev.stats, [stat]: value },
    }));
    setEditing(true);
    if (onRequestLock) onRequestLock();
  };


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (lockedBy && lockedBy !== "me") return;
    onSave(form);
    setEditing(false);
    if (onReleaseLock) onReleaseLock();
  };

  // Sync updates from other users
  React.useEffect(() => {
    if (character && !editing) {
      setForm(character);
      if (onSync) onSync(character);
    }
  }, [character]);

  return (
    <form className="character-sheet" onSubmit={handleSubmit}>
      {lockedBy && lockedBy !== "me" ? (
        <div className="locked">Locked by {lockedBy}</div>
      ) : null}
      <div className="presence">
        {presence && presence.length > 0 && (
          <div>
            Viewing: {presence.map(p => p.username + (p.editing ? " (editing)" : "")).join(", ")}
          </div>
        )}
      </div>
      <label>
        Name: <input name="name" value={form.name || ""} onChange={handleChange} required disabled={!!lockedBy && lockedBy !== "me"} />
      </label>
      <label>
        Class: <input name="class" value={form.class || ""} onChange={handleChange} required disabled={!!lockedBy && lockedBy !== "me"} />
      </label>
      <label>
        Race: <input name="race" value={form.race || ""} onChange={handleChange} required disabled={!!lockedBy && lockedBy !== "me"} />
      </label>
      <label>
        Level: <input name="level" type="number" min={1} value={form.level || 1} onChange={handleChange} required disabled={!!lockedBy && lockedBy !== "me"} />
      </label>
      <fieldset>
        <legend>Stats</legend>
        {Object.entries(form.stats || {}).map(([stat, value]) => (
          <label key={stat}>
            {stat}: <input type="number" min={1} max={30} value={value} onChange={e => handleStatChange(stat, Number(e.target.value))} disabled={!!lockedBy && lockedBy !== "me"} />
          </label>
        ))}
      </fieldset>
      <button type="submit" disabled={!!lockedBy && lockedBy !== "me"}>Save</button>
    </form>
  );
};
