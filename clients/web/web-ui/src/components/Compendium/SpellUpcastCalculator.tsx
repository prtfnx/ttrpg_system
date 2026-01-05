import React, { useEffect, useState } from 'react';
import { MessageType, createMessage } from '../../protocol/message';
import { useProtocol } from '../../services/ProtocolContext';
import styles from './SpellUpcastCalculator.module.css';

interface SpellUpcastCalculatorProps {
  spellName: string;
  baseLevel: number;
  onClose: () => void;
}

export const SpellUpcastCalculator: React.FC<SpellUpcastCalculatorProps> = ({
  spellName,
  baseLevel,
  onClose
}) => {
  const { protocol } = useProtocol();
  const [slotLevel, setSlotLevel] = useState(baseLevel);
  const [upcastInfo, setUpcastInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!protocol) return;

    const handleResponse = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { spell } = customEvent.detail;
      if (spell?.upcast_info) {
        setUpcastInfo(spell.upcast_info);
      }
      setLoading(false);
    };

    window.addEventListener('compendium-spell-response', handleResponse);
    return () => window.removeEventListener('compendium-spell-response', handleResponse);
  }, [protocol]);

  const calculateUpcast = () => {
    if (!protocol || slotLevel < baseLevel) return;

    setLoading(true);
    protocol.sendMessage(createMessage(
      MessageType.COMPENDIUM_GET_SPELL,
      { 
        name: spellName, 
        calculate_upcast: true,
        slot_level: slotLevel 
      }
    ));
  };

  useEffect(() => {
    calculateUpcast();
  }, [slotLevel]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.calculator} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3>{spellName}</h3>
          <button onClick={onClose} className={styles.closeButton}>✕</button>
        </div>

        <div className={styles.content}>
          <div className={styles.slotSelector}>
            <label>Cast at Spell Slot Level:</label>
            <div className={styles.slotButtons}>
              {[...Array(10 - baseLevel)].map((_, idx) => {
                const level = baseLevel + idx;
                return (
                  <button
                    key={level}
                    onClick={() => setSlotLevel(level)}
                    className={`${styles.slotButton} ${slotLevel === level ? styles.active : ''}`}
                  >
                    {level}
                  </button>
                );
              })}
            </div>
          </div>

          {loading && <div className={styles.loading}>Calculating...</div>}

          {upcastInfo && !loading && (
            <div className={styles.results}>
              <div className={styles.resultRow}>
                <span className={styles.label}>Base Damage:</span>
                <span className={styles.value}>{upcastInfo.base_damage || 'N/A'}</span>
              </div>

              {upcastInfo.upcast_damage && upcastInfo.upcast_damage !== upcastInfo.base_damage && (
                <>
                  <div className={styles.resultRow}>
                    <span className={styles.label}>Bonus:</span>
                    <span className={styles.value}>{upcastInfo.upcast_bonus || 'N/A'}</span>
                  </div>
                  <div className={styles.resultRow}>
                    <span className={styles.label}>Total Damage:</span>
                    <span className={`${styles.value} ${styles.total}`}>
                      {upcastInfo.total_damage}
                    </span>
                  </div>
                </>
              )}

              {upcastInfo.description && (
                <div className={styles.description}>
                  <strong>At Higher Levels:</strong> {upcastInfo.description}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
