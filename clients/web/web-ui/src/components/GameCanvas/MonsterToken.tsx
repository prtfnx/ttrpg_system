import React from 'react';
import styles from './MonsterToken.module.css';

interface MonsterAction {
  name: string;
  attackBonus?: number;
  damage?: string;
  damageType?: string;
  range?: string;
  description: string;
}

interface MonsterTokenProps {
  monster: {
    id: string;
    name: string;
    actions: MonsterAction[];
    [key: string]: any;
  };
  selectedMonsterId: string | null;
  executeMonsterAction: (monster: any, action: MonsterAction) => void;
  openMonsterActionPanel: (monster: any) => void;
}

export const MonsterToken: React.FC<MonsterTokenProps> = ({
  monster,
  selectedMonsterId,
  executeMonsterAction,
  openMonsterActionPanel
}) => {
  return (
    <div className={styles.monsterToken}>
      {/* ...existing token rendering... */}
      {selectedMonsterId === monster.id && (
        <div className={styles.quickActions}>
          {monster.actions.slice(0, 3).map((action, idx) => (
            <button
              key={idx}
              className={styles.quickActionBtn}
              onClick={() => executeMonsterAction(monster, action)}
            >
              {action.name}
            </button>
          ))}
          <button 
            className={styles.moreActionsBtn}
            onClick={() => openMonsterActionPanel(monster)}
          >
            More...
          </button>
        </div>
      )}
    </div>
  );
};