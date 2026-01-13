import React, { useState } from 'react';
import styles from './MonsterActionPanel.module.css';

interface MonsterAction {
  name: string;
  attackBonus?: number;
  damage?: string;
  damageType?: string;
  range?: string;
  description: string;
}

interface MonsterActionPanelProps {
  monster: {
    name: string;
    actions: MonsterAction[];
    reactions?: MonsterAction[];
    legendaryActions?: Array<{name: string; description: string; cost: number}>;
  };
  onUseAction?: (action: MonsterAction) => void;
}

export const MonsterActionPanel: React.FC<MonsterActionPanelProps> = ({
  monster,
  onUseAction
}) => {
  const [activeTab, setActiveTab] = useState<'actions' | 'reactions' | 'legendary'>('actions');

  const handleActionClick = (action: MonsterAction) => {
    if (action.attackBonus !== undefined) {
      const roll = Math.floor(Math.random() * 20) + 1;
      const total = roll + action.attackBonus;
      // Optionally, display or log the roll
      if (action.damage) {
        const damageRoll = rollDice(action.damage);
        // Optionally, display or log the damage
      }
    }
    onUseAction?.(action);
  };

  const rollDice = (diceStr: string): number => {
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

  return (
    <div className={styles.actionPanel}>
      <h2>{monster.name} Actions</h2>
      <div className={styles.tabs}>
        <button 
          className={activeTab === 'actions' ? styles.active : ''}
          onClick={() => setActiveTab('actions')}
        >
          Actions ({monster.actions.length})
        </button>
        {monster.reactions && monster.reactions.length > 0 && (
          <button 
            className={activeTab === 'reactions' ? styles.active : ''}
            onClick={() => setActiveTab('reactions')}
          >
            Reactions ({monster.reactions.length})
          </button>
        )}
        {monster.legendaryActions && monster.legendaryActions.length > 0 && (
          <button 
            className={activeTab === 'legendary' ? styles.active : ''}
            onClick={() => setActiveTab('legendary')}
          >
            Legendary ({monster.legendaryActions.length})
          </button>
        )}
      </div>
      <div className={styles.actionList}>
        {activeTab === 'actions' && monster.actions.map((action, idx) => (
          <div key={idx} className={styles.action}>
            <div className={styles.actionHeader}>
              <h4>{action.name}</h4>
              {action.attackBonus && (
                <span className={styles.attackBonus}>+{action.attackBonus}</span>
              )}
            </div>
            {action.damage && (
              <div className={styles.damageInfo}>
                <span>{action.damage}</span>
                {action.damageType && <span className={styles.damageType}>{action.damageType}</span>}
              </div>
            )}
            <p className={styles.description}>{action.description}</p>
            <button 
              className={styles.useActionBtn}
              onClick={() => handleActionClick(action)}
            >
              Use Action
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};