import { useSpells } from '@features/compendium';
import type { Spell } from '@features/compendium';
import type { SpellSlots } from '../services/spellManagement.service';
import clsx from 'clsx';
import React, { useMemo, useState } from 'react';
import { spellManagementService } from '../services/spellManagement.service';
import styles from './SpellsTab.module.css';

interface SpellData {
  cantrips: string[];
  knownSpells: string[];
  preparedSpells: string[];
}

interface Props {
  data: Record<string, unknown>;
  onSave: (data: Record<string, unknown>) => void;
}

export const SpellsTab: React.FC<Props> = ({ data, onSave }) => {
  const characterClass: string = (data.class as string) ?? '';
  const level: number = (data.level as number) ?? 1;
  const spells: SpellData = (data.spells as SpellData) ?? { cantrips: [], knownSpells: [], preparedSpells: [] };
  const slotsUsed: Record<number, number> = (data.spellSlotsUsed as Record<number, number>) ?? {};
  const [expandedSpell, setExpandedSpell] = useState<string | null>(null);

  const slots = useMemo(
    () => spellManagementService.getSpellSlots(characterClass, level),
    [characterClass, level]
  );

  // Load compendium spell details for known spells
  const { data: compendiumSpells } = useSpells({ class: characterClass });

  const slotLevels = useMemo(
    () => [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(l => ((slots as SpellSlots)[l] ?? 0) > 0),
    [slots]
  );

  // Group known spells by level using compendium data
  const spellsByLevel = useMemo(() => {
    const groups: Record<number, Array<{ name: string; details: Spell | null }>> = {};
    spells.knownSpells.forEach(name => {
      const details = compendiumSpells?.[name] ?? null;
      const spellLevel = details?.level ?? 1;
      if (!groups[spellLevel]) groups[spellLevel] = [];
      groups[spellLevel].push({ name, details });
    });
    return groups;
  }, [spells.knownSpells, compendiumSpells]);

  function consumeSlot(slotLevel: number) {
    const max = (slots as SpellSlots)[slotLevel] ?? 0;
    const used = slotsUsed[slotLevel] ?? 0;
    if (used >= max) return;
    onSave({ ...data, spellSlotsUsed: { ...slotsUsed, [slotLevel]: used + 1 } });
  }

  function recoverSlot(slotLevel: number) {
    const used = slotsUsed[slotLevel] ?? 0;
    if (used <= 0) return;
    onSave({ ...data, spellSlotsUsed: { ...slotsUsed, [slotLevel]: used - 1 } });
  }

  function longRest() {
    onSave({ ...data, spellSlotsUsed: {} });
  }

  return (
    <div className={styles.tab}>
      {/* Spell Slots */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Spell Slots</h3>
          {slotLevels.length > 0 && (
            <button className={styles.restBtn} onClick={longRest} type="button">
              Long Rest
            </button>
          )}
        </div>
        {slotLevels.length === 0 ? (
          <p className={styles.empty}>No spell slots — non-caster or cantrips only</p>
        ) : (
          <div className={styles.slotsGrid}>
            {slotLevels.map(slotLevel => {
              const max = (slots as SpellSlots)[slotLevel];
              const used = slotsUsed[slotLevel] ?? 0;
              const remaining = max - used;
              return (
                <div key={slotLevel} className={styles.slotGroup}>
                  <span className={styles.slotLabel}>Lvl {slotLevel}</span>
                  <div className={styles.slotPips}>
                    {Array.from({ length: max }).map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        className={clsx(styles.slotPip, i < remaining ? styles.pipAvailable : styles.pipUsed)}
                        onClick={() => i < remaining ? consumeSlot(slotLevel) : recoverSlot(slotLevel)}
                        title={i < remaining ? 'Click to use slot' : 'Click to recover slot'}
                      />
                    ))}
                  </div>
                  <span className={styles.slotCount}>{remaining}/{max}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Cantrips */}
      {spells.cantrips.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Cantrips</h3>
          <div className={styles.spellList}>
            {spells.cantrips.map(name => {
              const details = compendiumSpells?.[name];
              const isExpanded = expandedSpell === name;
              return (
                <div key={name} className={styles.spellRow}>
                  <button
                    type="button"
                    className={styles.spellToggle}
                    onClick={() => setExpandedSpell(isExpanded ? null : name)}
                    aria-expanded={isExpanded}
                  >
                    <span className={styles.spellName}>{name}</span>
                    <span className={styles.spellMeta}>
                      {details ? `${details.school} · ${details.casting_time}` : 'Cantrip'}
                    </span>
                  </button>
                  {isExpanded && details && (
                    <div className={styles.spellDetails}>
                      <p className={styles.spellDesc}>{details.description}</p>
                      <div className={styles.spellStats}>
                        <span>Range: {details.range}</span>
                        <span>Duration: {details.duration}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Known Spells by level */}
      {spells.knownSpells.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Spells</h3>
          {Object.keys(spellsByLevel)
            .sort((a, b) => Number(a) - Number(b))
            .map(levelStr => {
              const lvl = Number(levelStr);
              const spellsInLevel = spellsByLevel[lvl];
              const max = (slots as SpellSlots)[lvl] ?? 0;
              const used = slotsUsed[lvl] ?? 0;
              const remaining = max - used;
              return (
                <div key={lvl} className={styles.spellLevelGroup}>
                  <div className={styles.levelHeader}>
                    <span>Level {lvl}</span>
                    {max > 0 && (
                      <span className={clsx(styles.slotBadge, remaining === 0 && styles.slotBadgeEmpty)}>
                        {remaining}/{max} slots
                      </span>
                    )}
                  </div>
                  <div className={styles.spellList}>
                    {spellsInLevel.map(({ name, details }) => {
                      const isExpanded = expandedSpell === name;
                      const canCast = remaining > 0;
                      return (
                        <div key={name} className={styles.spellRow}>
                          <button
                            type="button"
                            className={styles.spellToggle}
                            onClick={() => setExpandedSpell(isExpanded ? null : name)}
                            aria-expanded={isExpanded}
                          >
                            <span className={styles.spellName}>{name}</span>
                            <span className={styles.spellMeta}>
                              {details ? `${details.school} · ${details.casting_time}` : `Level ${lvl}`}
                            </span>
                          </button>
                          {isExpanded && (
                            <div className={styles.spellDetails}>
                              {details && (
                                <>
                                  <p className={styles.spellDesc}>{details.description}</p>
                                  <div className={styles.spellStats}>
                                    <span>Range: {details.range}</span>
                                    <span>Duration: {details.duration}</span>
                                    {details.concentration && <span className={styles.tag}>Concentration</span>}
                                    {details.ritual && <span className={styles.tag}>Ritual</span>}
                                  </div>
                                </>
                              )}
                              <button
                                type="button"
                                className={clsx(styles.castBtn, !canCast && styles.castBtnDisabled)}
                                disabled={!canCast}
                                onClick={() => { if (canCast) consumeSlot(lvl); }}
                              >
                                {canCast ? 'Cast (use slot)' : 'No slots remaining'}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </section>
      )}

      {spells.cantrips.length === 0 && spells.knownSpells.length === 0 && (
        <p className={styles.empty}>No spells — select spells during character creation or level-up</p>
      )}
    </div>
  );
};
