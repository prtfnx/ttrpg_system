import React, { useEffect, useState } from 'react';
import { MessageType, createMessage } from '../../protocol/message';
import { useProtocol } from '../../services/ProtocolContext';
import { useGameStore } from '../../store';
import type { Monster } from '../../types/compendium';
import styles from './MonsterQuickActions.module.css';

interface MonsterQuickActionsProps {
  characterId: string;
  spritePosition: { x: number; y: number };
  onClose: () => void;
}

export const MonsterQuickActions: React.FC<MonsterQuickActionsProps> = ({
  characterId,
  spritePosition,
  onClose
}) => {
  const { protocol } = useProtocol();
  const { characters } = useGameStore();
  const [monster, setMonster] = useState<Monster | null>(null);
  const [loading, setLoading] = useState(false);
  
  const character = characters.find(c => c.id === characterId);
  const monsterName = character?.name || character?.data?.name;

  useEffect(() => {
    if (!protocol || !monsterName) return;

    setLoading(true);
    protocol.sendMessage(createMessage(
      MessageType.COMPENDIUM_GET_MONSTER,
      { name: monsterName }
    ));

    const handleResponse = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.monster) {
        setMonster(customEvent.detail.monster);
      }
      setLoading(false);
    };

    window.addEventListener('compendium-monster-response', handleResponse);
    return () => window.removeEventListener('compendium-monster-response', handleResponse);
  }, [protocol, monsterName]);

  const handleActionClick = (action: any) => {
    console.log(`[MonsterQuickActions] Using action: ${action.name}`);
    
    // Roll attack if it's an attack action
    if (action.attack_bonus !== undefined) {
      const roll = Math.floor(Math.random() * 20) + 1;
      const total = roll + action.attack_bonus;
      
      console.log(`${action.name}: d20(${roll}) + ${action.attack_bonus} = ${total}`);
      
      // If hit, roll damage
      if (action.damage) {
        const damageRoll = rollDiceString(action.damage);
        console.log(`Damage: ${damageRoll} ${action.damage_type || ''}`);
      }
    }
  };

  const rollDiceString = (diceStr: string): number => {
    // Parse "2d6+3" or "1d8" format
    const match = diceStr.match(/(\d+)d(\d+)([+-]\d+)?/);
    if (!match) return 0;

    const [, numDice, diceType, modifier] = match;
    let total = 0;

    for (let i = 0; i < parseInt(numDice); i++) {
      total += Math.floor(Math.random() * parseInt(diceType)) + 1;
    }

    if (modifier) {
      total += parseInt(modifier);
    }

    return total;
  };

  if (!character || character.data?.characterType !== 'npc') {
    return null;
  }

  if (loading) {
    return (
      <div className={styles.quickActions} style={{ left: spritePosition.x, top: spritePosition.y }}>
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  if (!monster?.actions || monster.actions.length === 0) {
    return null;
  }

  // Show up to 3 most common actions
  const quickActions = monster.actions.slice(0, 3);

  return (
    <div className={styles.quickActions} style={{ left: spritePosition.x, top: spritePosition.y }}>
      <div className={styles.header}>
        <span className={styles.monsterName}>{monsterName}</span>
        <button className={styles.closeBtn} onClick={onClose} title="Close">✕</button>
      </div>
      
      <div className={styles.actionButtons}>
        {quickActions.map((action, idx) => (
          <button
            key={idx}
            className={styles.actionBtn}
            onClick={() => handleActionClick(action)}
            title={action.description || action.name}
          >
            <span className={styles.actionName}>{action.name}</span>
            {action.attack_bonus !== undefined && (
              <span className={styles.attackBonus}>+{action.attack_bonus}</span>
            )}
          </button>
        ))}
      </div>
      
      {monster.actions.length > 3 && (
        <button className={styles.moreBtn} onClick={() => console.log('Open full action panel')}>
          {monster.actions.length - 3} more actions...
        </button>
      )}
    </div>
  );
};
