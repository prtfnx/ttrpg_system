import React from 'react';
import styles from './EquipmentToken.module.css';

interface EquipmentTokenProps {
  item: {
    name: string;
    type: string;
    imageUrl?: string;
    rarity?: string;
  };
  draggable?: boolean;
  onDragStart?: (item: any) => void;
}

export const EquipmentToken: React.FC<EquipmentTokenProps> = ({
  item,
  draggable = true,
  onDragStart
}) => {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'equipment-token',
      data: item
    }));
    onDragStart?.(item);
  };

  const getRarityClass = () => {
    switch (item.rarity) {
      case 'common': return styles.common;
      case 'uncommon': return styles.uncommon;
      case 'rare': return styles.rare;
      case 'very_rare': return styles.veryRare;
      case 'legendary': return styles.legendary;
      default: return '';
    }
  };

  return (
    <div 
      className={`${styles.equipmentToken} ${getRarityClass()}`}
      draggable={draggable}
      onDragStart={handleDragStart}
    >
      {item.imageUrl ? (
        <img src={item.imageUrl} alt={item.name} />
      ) : (
        <div className={styles.placeholder}>
          {item.type === 'weapon' && '⚔️'}
          {item.type === 'armor' && '🛡️'}
          {item.type === 'potion' && '🧪'}
          {item.type === 'scroll' && '📜'}
          {item.type === 'ring' && '💍'}
        </div>
      )}
      <div className={styles.tokenLabel}>
        {item.name}
      </div>
    </div>
  );
};