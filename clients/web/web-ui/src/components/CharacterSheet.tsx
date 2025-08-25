import React, { useState } from "react";
import type { Character } from "./CharacterManager";

interface CharacterSheetProps {
  character: Character | null;
  onSave: (character: Partial<Character>) => void;
}

export const CharacterSheet: React.FC<CharacterSheetProps> = ({ character, onSave }) => {
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleStatChange = (stat: string, value: number) => {
    setForm((prev) => ({
      ...prev,
      stats: { ...prev.stats, [stat]: value },
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <form className="character-sheet" onSubmit={handleSubmit}>
      <label>
        Name: <input name="name" value={form.name || ""} onChange={handleChange} required />
      </label>
      <label>
        Class: <input name="class" value={form.class || ""} onChange={handleChange} required />
      </label>
      <label>
        Race: <input name="race" value={form.race || ""} onChange={handleChange} required />
      </label>
      <label>
        Level: <input name="level" type="number" min={1} value={form.level || 1} onChange={handleChange} required />
      </label>
      <fieldset>
        <legend>Stats</legend>
        {Object.entries(form.stats || {}).map(([stat, value]) => (
          <label key={stat}>
            {stat}: <input type="number" min={1} max={30} value={value} onChange={e => handleStatChange(stat, Number(e.target.value))} />
          </label>
        ))}
      </fieldset>
      <button type="submit">Save</button>
    </form>
  );
};
