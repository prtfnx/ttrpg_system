import React, { useState, useEffect } from 'react';
import { LegendaryActions } from './LegendaryActions';
import { MessageType, createMessage } from '../../protocol/message';
import { useProtocol } from '../../services/ProtocolContext';
import styles from './MonsterActionPanel.module.css';

interface MonsterAction {
  name: string;
  description: string;
  attack_bonus?: number;
  damage_dice?: string;
  damage_type?: string;
}

interface LairAction {
  description: string;
}

interface Monster {
  name: string;
  actions?: MonsterAction[];
  legendary_actions?: Array<{ name: string; description: string; cost: number }>;
  lair_actions?: LairAction[];
  legendary_actions_per_round?: number;
}

interface MonsterActionPanelProps {
  monsterName: string;
}

export const MonsterActionPanel: React.FC<MonsterActionPanelProps> = ({ monsterName }) => {
  const { protocol } = useProtocol();
  const [monster, setMonster] = useState<Monster | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!protocol || !monsterName) return;

    const fetchMonster = () => {
      setLoading(true);
      protocol.sendMessage(createMessage(
        MessageType.COMPENDIUM_GET_MONSTER,
        { name: monsterName }
      ));
    };

    const handleResponse = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { monster: monsterData, found } = customEvent.detail;
      
      if (found && monsterData) {
        setMonster(monsterData);
      }
      setLoading(false);
    };

    window.addEventListener('compendium-monster-response', handleResponse);
    fetchMonster();

    return () => {
      window.removeEventListener('compendium-monster-response', handleResponse);
    };
  }, [protocol, monsterName]);

  const handleUseAction = (action: { name: string; description: string; cost: number }) => {
    console.log(`Used legendary action: ${action.name} (cost: ${action.cost})`);
  };

  if (loading) {
    return <div className={styles.loading}>Loading monster data...</div>;
  }

  if (!monster) {
    return <div className={styles.error}>Monster not found</div>;
  }

  return (
    <div className={styles.monsterActionPanel}>
      <h2 className={styles.monsterName}>{monster.name}</h2>

      {monster.actions && monster.actions.length > 0 && (
        <div className={styles.section}>
          <h3>Actions</h3>
          <div className={styles.actionsList}>
            {monster.actions.map((action, idx) => (
              <div key={idx} className={styles.action}>
                <div className={styles.actionHeader}>
                  <span className={styles.actionName}>{action.name}</span>
                  {action.attack_bonus !== undefined && (
                    <span className={styles.attackBonus}>+{action.attack_bonus}</span>
                  )}
                </div>
                <p className={styles.actionDescription}>{action.description}</p>
                {action.damage_dice && (
                  <div className={styles.damage}>
                    <span className={styles.damageDice}>{action.damage_dice}</span>
                    {action.damage_type && (
                      <span className={styles.damageType}> {action.damage_type}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {monster.legendary_actions && monster.legendary_actions.length > 0 && (
        <LegendaryActions
          actions={monster.legendary_actions}
          actionsPerRound={monster.legendary_actions_per_round || 3}
          onUseAction={handleUseAction}
        />
      )}

      {monster.lair_actions && monster.lair_actions.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.lairHeader}>Lair Actions (Initiative 20)</h3>
          <p className={styles.lairDescription}>
            On initiative count 20 (losing initiative ties), the creature can take a lair action 
            to cause one of the following effects:
          </p>
          <div className={styles.lairActionsList}>
            {monster.lair_actions.map((action, idx) => (
              <div key={idx} className={styles.lairAction}>
                <span className={styles.bullet}>•</span>
                <p>{action.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
