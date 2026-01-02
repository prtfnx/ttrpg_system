/**
 * SpellCard Component
 * D&D 5e spell card following VTT best practices (Roll20, Foundry VTT style)
 */

import React from 'react';
import type { Spell } from '../../services/compendium.service';
import styles from './SpellCard.module.css';

interface SpellCardProps {
  spell: Spell & {
    casting_time?: string;
    range?: string;
    components?: string;
    duration?: string;
    concentration?: boolean;
    ritual?: boolean;
    classes?: string[];
    description?: string;
    higher_levels?: string;
  };
  onClose?: () => void;
}

const SCHOOL_ICONS: Record<string, string> = {
  'abjuration': '🛡️',
  'conjuration': '🌀',
  'divination': '🔮',
  'enchantment': '✨',
  'evocation': '⚡',
  'illusion': '🎭',
  'necromancy': '💀',
  'transmutation': '🔄'
};

export const SpellCard: React.FC<SpellCardProps> = ({ spell, onClose }) => {
  const schoolIcon = SCHOOL_ICONS[spell.school?.toLowerCase()] || '📜';
  const levelText = spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`;
  
  const handleDragStart = (e: React.DragEvent) => {
    const dragData = {
      type: 'spell',
      data: {
        name: spell.name,
        level: spell.level,
        school: spell.school
      }
    };
    e.dataTransfer.setData('application/json', JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = 'copy';
  };
  
  return (
    <div 
      className={styles.spellCard}
      draggable={true}
      onDragStart={handleDragStart}
    >
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <span className={styles.schoolIcon}>{schoolIcon}</span>
          <h2 className={styles.spellName}>{spell.name}</h2>
        </div>
        {onClose && (
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        )}
      </div>

      {/* Level and School */}
      <div className={styles.subtitle}>
        <span className={styles.level}>{levelText}</span>
        <span className={styles.schoolDivider}>•</span>
        <span className={styles.school}>{spell.school}</span>
        {spell.ritual && <span className={styles.tag}>Ritual</span>}
        {spell.concentration && <span className={styles.tag}>Concentration</span>}
      </div>

      {/* Spell Properties Grid */}
      <div className={styles.properties}>
        <div className={styles.property}>
          <span className={styles.propLabel}>Casting Time</span>
          <span className={styles.propValue}>{spell.casting_time || '1 action'}</span>
        </div>
        <div className={styles.property}>
          <span className={styles.propLabel}>Range</span>
          <span className={styles.propValue}>{spell.range || 'Self'}</span>
        </div>
        <div className={styles.property}>
          <span className={styles.propLabel}>Components</span>
          <span className={styles.propValue}>{spell.components || 'V, S'}</span>
        </div>
        <div className={styles.property}>
          <span className={styles.propLabel}>Duration</span>
          <span className={styles.propValue}>{spell.duration || 'Instantaneous'}</span>
        </div>
      </div>

      {/* Description */}
      <div className={styles.description}>
        <p>{spell.description || 'No description available.'}</p>
        {spell.higher_levels && (
          <div className={styles.higherLevels}>
            <strong>At Higher Levels:</strong> {spell.higher_levels}
          </div>
        )}
      </div>

      {/* Classes */}
      {spell.classes && spell.classes.length > 0 && (
        <div className={styles.classes}>
          <span className={styles.classesLabel}>Classes:</span>
          {spell.classes.join(', ')}
        </div>
      )}
    </div>
  );
};
