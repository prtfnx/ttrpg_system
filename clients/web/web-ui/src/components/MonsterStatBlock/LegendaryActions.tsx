import React, { useState } from 'react';
import styles from './LegendaryActions.module.css';

interface LegendaryAction {
  name: string;
  description: string;
  cost: number;
}

interface LegendaryActionsProps {
  actions: LegendaryAction[];
  actionsPerRound?: number;
  onUseAction?: (action: LegendaryAction) => void;
}

export const LegendaryActions: React.FC<LegendaryActionsProps> = ({
  actions,
  actionsPerRound = 3,
  onUseAction
}) => {
  const [actionsUsed, setActionsUsed] = useState(0);

  const handleUseAction = (action: LegendaryAction) => {
    if (actionsUsed + action.cost <= actionsPerRound) {
      setActionsUsed(prev => prev + action.cost);
      onUseAction?.(action);
    }
  };

  const resetActions = () => setActionsUsed(0);

  const canUseAction = (cost: number) => actionsUsed + cost <= actionsPerRound;

  if (!actions || actions.length === 0) {
    return null;
  }

  return (
    <div className={styles.legendaryActions}>
      <div className={styles.header}>
        <h3>Legendary Actions</h3>
        <div className={styles.actionCounter}>
          <span className={styles.actionsRemaining}>
            {actionsPerRound - actionsUsed}/{actionsPerRound}
          </span>
          <button 
            onClick={resetActions} 
            className={styles.resetButton}
            title="Reset legendary actions (new round)"
          >
            ↻
          </button>
        </div>
      </div>

      <p className={styles.description}>
        Can take {actionsPerRound} legendary actions, choosing from the options below. 
        Only one legendary action can be used at a time and only at the end of another creature's turn. 
        Regains spent legendary actions at the start of its turn.
      </p>

      <div className={styles.actionsList}>
        {actions.map((action, idx) => (
          <div 
            key={idx} 
            className={`${styles.action} ${!canUseAction(action.cost) ? styles.disabled : ''}`}
          >
            <div className={styles.actionHeader}>
              <span className={styles.actionName}>{action.name}</span>
              {action.cost > 1 && (
                <span className={styles.actionCost}>
                  Costs {action.cost} Actions
                </span>
              )}
              {onUseAction && (
                <button
                  onClick={() => handleUseAction(action)}
                  disabled={!canUseAction(action.cost)}
                  className={styles.useButton}
                >
                  Use
                </button>
              )}
            </div>
            <p className={styles.actionDescription}>{action.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
