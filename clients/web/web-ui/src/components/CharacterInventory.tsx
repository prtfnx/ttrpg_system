import React from 'react';
import styles from './CharacterInventory.module.css';
import { EquipmentToken } from './Compendium/EquipmentToken';

interface Equipment {
  name: string;
  type: string;
  rarity?: string;
  requires_attunement?: boolean;
  equipped?: boolean;
  attuned?: boolean;
  quantity?: number;
}

interface CharacterInventoryProps {
  character: any;
  onSave: (updates: any) => void;
}

export const CharacterInventory: React.FC<CharacterInventoryProps> = ({
  character,
  onSave
}) => {
  const inventory = character.data?.inventory || [];

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type === 'equipment-token' && data.data) {
        const newItem: Equipment = {
          ...data.data,
          equipped: false,
          attuned: false,
          quantity: 1
        };
        
        // Check if item already exists
        const existingIndex = inventory.findIndex((item: Equipment) => item.name === newItem.name);
        let updatedInventory;
        
        if (existingIndex >= 0) {
          // Increase quantity
          updatedInventory = [...inventory];
          updatedInventory[existingIndex] = {
            ...updatedInventory[existingIndex],
            quantity: (updatedInventory[existingIndex].quantity || 1) + 1
          };
        } else {
          // Add new item
          updatedInventory = [...inventory, newItem];
        }
        
        onSave({
          data: { ...character.data, inventory: updatedInventory }
        });
      }
    } catch (error) {
      console.error('Failed to add item to inventory:', error);
    }
  };

  const handleEquip = (index: number) => {
    const updatedInventory = [...inventory];
    updatedInventory[index] = {
      ...updatedInventory[index],
      equipped: !updatedInventory[index].equipped
    };
    onSave({
      data: { ...character.data, inventory: updatedInventory }
    });
  };

  const handleAttune = (index: number) => {
    const item = inventory[index];
    if (!item.requires_attunement) return;
    
    // Check attunement limit client-side (server also validates)
    const attunedCount = inventory.filter((i: Equipment) => i.attuned).length;
    if (!item.attuned && attunedCount >= 3) {
      alert('You can only attune to 3 items at a time (D&D 5e rule)');
      return;
    }
    
    // Send WebSocket message to server
    const messageType = item.attuned ? 'character_unattune_item' : 'character_attune_item';
    window.dispatchEvent(new CustomEvent('protocol-send-message', {
      detail: {
        type: messageType,
        data: {
          character_id: character.character_id,
          item_name: item.name
        }
      }
    }));
  };

  const handleRemove = (index: number) => {
    const updatedInventory = inventory.filter((_: any, i: number) => i !== index);
    onSave({
      data: { ...character.data, inventory: updatedInventory }
    });
  };

  const attunedItems = inventory.filter((item: Equipment) => item.attuned);

  return (
    <div className={styles.inventory}>
      <div className={styles.header}>
        <h3>Inventory</h3>
        <div className={styles.attunementTracker}>
          <span className={styles.attunementLabel}>Attunement:</span>
          <span className={styles.attunementCount}>
            {attunedItems.length} / 3
          </span>
        </div>
      </div>

      <div 
        className={styles.dropZone}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <p className={styles.dropHint}>Drop equipment from compendium here</p>
        
        {inventory.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No items in inventory</p>
            <p className={styles.helpText}>Drag equipment from the compendium panel to add items</p>
          </div>
        ) : (
          <div className={styles.itemList}>
            {inventory.map((item: Equipment, index: number) => (
              <div key={index} className={styles.inventoryItem}>
                <div className={styles.itemIcon}>
                  <EquipmentToken item={item} draggable={false} />
                </div>
                
                <div className={styles.itemDetails}>
                  <div className={styles.itemHeader}>
                    <span className={styles.itemName}>{item.name}</span>
                    {item.quantity && item.quantity > 1 && (
                      <span className={styles.quantity}>×{item.quantity}</span>
                    )}
                  </div>
                  
                  <div className={styles.itemMeta}>
                    <span className={styles.itemType}>{item.type}</span>
                    {item.rarity && (
                      <span className={`${styles.rarity} ${styles[item.rarity.toLowerCase().replace(' ', '')]}`}>
                        {item.rarity}
                      </span>
                    )}
                  </div>
                  
                  <div className={styles.itemActions}>
                    <button
                      className={`${styles.actionBtn} ${item.equipped ? styles.active : ''}`}
                      onClick={() => handleEquip(index)}
                    >
                      {item.equipped ? '✓ Equipped' : 'Equip'}
                    </button>
                    
                    {item.requires_attunement && (
                      <button
                        className={`${styles.actionBtn} ${styles.attunementBtn} ${item.attuned ? styles.active : ''}`}
                        onClick={() => handleAttune(index)}
                        disabled={!item.attuned && attunedItems.length >= 3}
                      >
                        {item.attuned ? '✦ Attuned' : 'Attune'}
                      </button>
                    )}
                    
                    <button
                      className={`${styles.actionBtn} ${styles.removeBtn}`}
                      onClick={() => handleRemove(index)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
