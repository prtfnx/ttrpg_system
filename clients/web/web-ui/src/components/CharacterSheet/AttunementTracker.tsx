/**
 * Attunement Tracker Component
 * Manages character's attuned magic items (max 3 slots)
 */

import React from 'react';
import { showToast } from '../../utils/toast';
import styles from './AttunementTracker.module.css';

const MAX_ATTUNEMENT_SLOTS = 3;

interface MagicItem {
  name: string;
  rarity?: string;
  description?: string;
  requiresAttunement: boolean;
}

interface AttunementTrackerProps {
  attunedItems: MagicItem[];
  onAttune: (item: MagicItem) => void;
  onUnattune: (itemName: string) => void;
}

export const AttunementTracker: React.FC<AttunementTrackerProps> = ({
  attunedItems,
  onAttune,
  onUnattune
}) => {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      const data = e.dataTransfer.getData('application/json');
      if (!data) return;

      const dragData = JSON.parse(data);
      
      if (dragData.type === 'equipment' && dragData.data.requiresAttunement) {
        const item = dragData.data;
        
        if (attunedItems.length >= MAX_ATTUNEMENT_SLOTS) {
          showToast.error(`Maximum ${MAX_ATTUNEMENT_SLOTS} attuned items`);
          return;
        }

        if (attunedItems.some(i => i.name === item.name)) {
          showToast.warning(`${item.name} is already attuned`);
          return;
        }

        onAttune(item);
        showToast.success(`Attuned to ${item.name}`);
      } else {
        showToast.error('Only items requiring attunement can be attuned');
      }
    } catch (error) {
      console.error('Error handling drop:', error);
    }
  };

  const handleUnattune = (itemName: string) => {
    onUnattune(itemName);
    showToast.info(`Unattuned from ${itemName}`);
  };

  const emptySlots = MAX_ATTUNEMENT_SLOTS - attunedItems.length;

  return (
    <div className={styles.tracker}>
      <div className={styles.header}>
        <h3 className={styles.title}>Attunement</h3>
        <span className={styles.count}>
          {attunedItems.length} / {MAX_ATTUNEMENT_SLOTS}
        </span>
      </div>

      <div 
        className={styles.slots}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {attunedItems.map((item) => (
          <div key={item.name} className={styles.slot}>
            <div className={styles.itemInfo}>
              <span className={styles.itemName}>{item.name}</span>
              {item.rarity && (
                <span className={`${styles.rarity} ${styles[`rarity${item.rarity}`]}`}>
                  {item.rarity}
                </span>
              )}
            </div>
            <button
              onClick={() => handleUnattune(item.name)}
              className={styles.unattuneBtn}
              aria-label="Unattune"
            >
              ✕
            </button>
          </div>
        ))}

        {[...Array(emptySlots)].map((_, idx) => (
          <div key={`empty-${idx}`} className={styles.emptySlot}>
            <span className={styles.emptyText}>Drop item to attune</span>
          </div>
        ))}
      </div>

      <p className={styles.hint}>
        💡 Drag magic items requiring attunement here
      </p>
    </div>
  );
};
