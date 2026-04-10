import { useState } from 'react';
import styles from './EncounterBuilder.module.css';
import { ProtocolService } from '@lib/api';
import { createMessage, MessageType } from '@lib/websocket';
import { useGameStore } from '@/store';
import type { EncounterChoice } from '../stores/encounterStore';

interface NewChoice {
  text: string;
  requires_roll: boolean;
  skill: string;
  dc: string;
}

const emptyChoice = (): NewChoice => ({ text: '', requires_roll: false, skill: 'Perception', dc: '12' });

export function EncounterBuilder() {
  const tableId = useGameStore((s) => s.activeTableId ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [choices, setChoices] = useState<NewChoice[]>([emptyChoice()]);

  const addChoice = () => setChoices((prev) => [...prev, emptyChoice()]);
  const removeChoice = (i: number) => setChoices((prev) => prev.filter((_, idx) => idx !== i));

  const updateChoice = (i: number, patch: Partial<NewChoice>) =>
    setChoices((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const launch = () => {
    if (!title.trim()) return;
    const payload: { table_id: string; title: string; description: string; choices: EncounterChoice[] } = {
      table_id: tableId,
      title: title.trim(),
      description: description.trim(),
      choices: choices
        .filter((c) => c.text.trim())
        .map((c, i) => ({
          id: `c${i}`,
          text: c.text.trim(),
          requires_roll: c.requires_roll,
          skill: c.requires_roll ? c.skill : undefined,
          dc: c.requires_roll ? Number(c.dc) : undefined,
        })),
    };
    ProtocolService.getProtocol()?.sendMessage(createMessage(MessageType.ENCOUNTER_START, payload));
    setTitle('');
    setDescription('');
    setChoices([emptyChoice()]);
  };

  return (
    <div className={styles.builder}>
      <div className={styles.fieldGroup}>
        <label className={styles.label}>Title</label>
        <input
          className={styles.input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Encounter title…"
        />
      </div>
      <div className={styles.fieldGroup}>
        <label className={styles.label}>Description</label>
        <textarea
          className={styles.textarea}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Describe the situation…"
        />
      </div>
      <div className={styles.choicesSection}>
        <div className={styles.choicesHeader}>
          <span className={styles.label}>Choices</span>
          <button className={styles.addChoiceBtn} onClick={addChoice}>+ Add</button>
        </div>
        {choices.map((c, i) => (
          <div key={i} className={styles.choiceRow}>
            <input
              className={styles.input}
              value={c.text}
              onChange={(e) => updateChoice(i, { text: e.target.value })}
              placeholder={`Choice ${i + 1}`}
            />
            <label className={styles.checkLabel}>
              <input
                type="checkbox"
                checked={c.requires_roll}
                onChange={(e) => updateChoice(i, { requires_roll: e.target.checked })}
              />
              Roll
            </label>
            {c.requires_roll && (
              <>
                <input
                  className={styles.inputSm}
                  value={c.skill}
                  onChange={(e) => updateChoice(i, { skill: e.target.value })}
                  placeholder="Skill"
                />
                <input
                  className={styles.inputSm}
                  type="number"
                  value={c.dc}
                  onChange={(e) => updateChoice(i, { dc: e.target.value })}
                  placeholder="DC"
                />
              </>
            )}
            {choices.length > 1 && (
              <button className={styles.removeBtn} onClick={() => removeChoice(i)}>✕</button>
            )}
          </div>
        ))}
      </div>
      <button className={styles.launchBtn} onClick={launch} disabled={!title.trim()}>
        Launch Encounter
      </button>
    </div>
  );
}
