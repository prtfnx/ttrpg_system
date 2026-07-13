import { useState } from 'react';
import { useGameStore } from '@/store';
import { MessageType } from '@lib/websocket';
import { X } from 'lucide-react';
import { useCombatCommands } from '../hooks/useCombatCommands';
import type { EncounterChoice } from '../stores/encounterStore';
import styles from './EncounterBuilder.module.css';

interface NewChoice {
  text: string;
  requires_roll: boolean;
  skill: string;
  dc: string;
}

const emptyChoice = (): NewChoice => ({ text: '', requires_roll: false, skill: 'Perception', dc: '12' });

export function EncounterBuilder() {
  const tableId = useGameStore((s) => s.activeTableId ?? '');
  const { sendProtocolMessage } = useCombatCommands();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [choices, setChoices] = useState<NewChoice[]>([emptyChoice()]);

  const addChoice = () => setChoices((prev) => [...prev, emptyChoice()]);
  const removeChoice = (i: number) => setChoices((prev) => prev.filter((_, idx) => idx !== i));

  const updateChoice = (i: number, patch: Partial<NewChoice>) =>
    setChoices((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const launch = () => {
    const validChoices = choices.filter((choice) => choice.text.trim());
    if (!title.trim() || validChoices.length === 0) return;
    const payload: { table_id: string; title: string; description: string; choices: EncounterChoice[] } = {
      table_id: tableId,
      title: title.trim(),
      description: description.trim(),
      choices: validChoices
        .map((c, i) => ({
          choice_id: `c${i}`,
          text: c.text.trim(),
          requires_roll: c.requires_roll,
          roll_skill: c.requires_roll ? c.skill : undefined,
          roll_dc: c.requires_roll ? Number(c.dc) : undefined,
        })),
    };
    sendProtocolMessage(MessageType.ENCOUNTER_START, payload);
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
          placeholder="Encounter title..."
        />
      </div>
      <div className={styles.fieldGroup}>
        <label className={styles.label}>Description</label>
        <textarea
          className={styles.textarea}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Describe the situation..."
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
              <button className={styles.removeBtn} onClick={() => removeChoice(i)} title="Remove choice">
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        className={styles.launchBtn}
        onClick={launch}
        disabled={!title.trim() || !choices.some((choice) => choice.text.trim())}
      >
        Launch Encounter
      </button>
    </div>
  );
}
