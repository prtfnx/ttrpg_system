import React from 'react';
import styles from './EquipmentToken.module.css';

interface EquipmentItem {
  name: string;
  type: string;
  rarity?: string;
  requires_attunement?: boolean;
  image_url?: string;
}

interface EquipmentTokenProps {
  item: EquipmentItem;
  draggable?: boolean;
  onDragStart?: (item: EquipmentItem) => void;
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
    switch (item.rarity?.toLowerCase()) {
      case 'common': return styles.common;
      case 'uncommon': return styles.uncommon;
      case 'rare': return styles.rare;
      case 'very rare': return styles.veryRare;
      case 'legendary': return styles.legendary;
      case 'artifact': return styles.artifact;
      default: return '';
    }
  };
  
  const getItemEmoji = () => {
    const type = item.type?.toLowerCase() || '';
    if (type.includes('weapon')) return '⚔️';
    if (type.includes('armor')) return '🛡️';
    if (type.includes('potion')) return '🧪';
    if (type.includes('scroll')) return '📜';
    if (type.includes('ring')) return '💍';
    if (type.includes('wand') || type.includes('staff') || type.includes('rod')) return '🪄';
    if (type.includes('cloak') || type.includes('robe')) return '🧥';
    if (type.includes('boots')) return '👢';
    if (type.includes('helmet') || type.includes('hat')) return '🎩';
    return '📦';
  };
  
  return (
    <div 
      className={`${styles.equipmentToken} ${getRarityClass()}`}
      draggable={draggable}
      onDragStart={handleDragStart}
      title={`${item.name}${item.rarity ? ` (${item.rarity})` : ''}${item.requires_attunement ? ' - Requires Attunement' : ''}`}
    >
      {item.image_url ? (
        <img src={item.image_url} alt={item.name} className={styles.tokenImage} />
      ) : (
        <div className={styles.placeholder}>
          {getItemEmoji()}
        </div>
      )}
      
      <div className={styles.tokenLabel}>
        {item.name}
        {item.requires_attunement && <span className={styles.attunementBadge} title="Requires Attunement">✦</span>}
      </div>
    </div>
  );
};
