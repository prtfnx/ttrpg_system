import React, { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { useAuthenticatedWebSocket } from '../hooks/useAuthenticatedWebSocket';
import { MessageType, createMessage } from '../protocol/message';
import type { UserInfo } from '../services/auth.service';
import styles from './InitiativeTracker.module.css';

interface Initiative {
  id: string;
  name: string;
  initiative: number;
  isPlayer: boolean;
  isActive: boolean;
  hp: number;
  maxHp: number;
  ac: number;
  conditions: string[];
  notes: string;
}

interface InitiativeTrackerProps {
  sessionCode: string;
  userInfo: UserInfo;
}

export const InitiativeTracker: React.FC<InitiativeTrackerProps> = ({ sessionCode, userInfo }) => {
  const { protocol } = useAuthenticatedWebSocket({ sessionCode, userInfo });
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [round, setRound] = useState(1);
  const [combatActive, setCombatActive] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newInitiative, setNewInitiative] = useState({
    name: '',
    initiative: 10,
    isPlayer: true,
    hp: 10,
    maxHp: 10,
    ac: 10,
    notes: ''
  });

  // Listen for initiative updates from server
  useEffect(() => {
    const handleInitiativeUpdate = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.initiatives) {
        setInitiatives(customEvent.detail.initiatives);
      }
      if (customEvent.detail?.currentTurn !== undefined) {
        setCurrentTurn(customEvent.detail.currentTurn);
      }
      if (customEvent.detail?.round !== undefined) {
        setRound(customEvent.detail.round);
      }
      if (customEvent.detail?.combatActive !== undefined) {
        setCombatActive(customEvent.detail.combatActive);
      }
    };

    window.addEventListener('initiative-updated', handleInitiativeUpdate);
    return () => window.removeEventListener('initiative-updated', handleInitiativeUpdate);
  }, []);

  const addInitiative = useCallback(async () => {
    if (!newInitiative.name.trim()) return;

    const initiative: Initiative = {
      id: `init_${Date.now()}`,
      name: newInitiative.name.trim(),
      initiative: newInitiative.initiative,
      isPlayer: newInitiative.isPlayer,
      isActive: false,
      hp: newInitiative.hp,
      maxHp: newInitiative.maxHp,
      ac: newInitiative.ac,
      conditions: [],
      notes: newInitiative.notes
    };

    setInitiatives(prev => [...prev, initiative].sort((a, b) => b.initiative - a.initiative));
    setNewInitiative({
      name: '',
      initiative: 10,
      isPlayer: true,
      hp: 10,
      maxHp: 10,
      ac: 10,
      notes: ''
    });
    setShowAddForm(false);

    // Send to server
    if (protocol) {
      try {
        await protocol.sendMessage(createMessage(MessageType.PLAYER_ACTION, {
          action: 'initiative_add',
          initiative
        }, 1));
      } catch (error) {
        console.error('Failed to add initiative:', error);
      }
    }
  }, [newInitiative, protocol]);

  const removeInitiative = useCallback(async (id: string) => {
    setInitiatives(prev => prev.filter(init => init.id !== id));
    
    // Adjust current turn if needed
    if (currentTurn >= initiatives.length - 1) {
      setCurrentTurn(0);
    }

    if (protocol) {
      try {
        await protocol.sendMessage(createMessage(MessageType.PLAYER_ACTION, {
          action: 'initiative_remove',
          id
        }, 1));
      } catch (error) {
        console.error('Failed to remove initiative:', error);
      }
    }
  }, [initiatives.length, currentTurn, protocol]);

  const updateInitiative = useCallback(async (id: string, updates: Partial<Initiative>) => {
    setInitiatives(prev => prev.map(init => 
      init.id === id ? { ...init, ...updates } : init
    ));

    if (protocol) {
      try {
        await protocol.sendMessage(createMessage(MessageType.PLAYER_ACTION, {
          action: 'initiative_update',
          id,
          updates
        }, 1));
      } catch (error) {
        console.error('Failed to update initiative:', error);
      }
    }
  }, [protocol]);

  const startCombat = useCallback(async () => {
    if (initiatives.length === 0) return;
    
    const sortedInitiatives = [...initiatives].sort((a, b) => b.initiative - a.initiative);
    setInitiatives(sortedInitiatives);
    setCurrentTurn(0);
    setRound(1);
    setCombatActive(true);

    // Mark first character as active
    if (sortedInitiatives.length > 0) {
      setInitiatives(prev => prev.map((init, index) => ({
        ...init,
        isActive: index === 0
      })));
    }

    if (protocol) {
      try {
        await protocol.sendMessage(createMessage(MessageType.PLAYER_ACTION, {
          action: 'combat_start',
          initiatives: sortedInitiatives
        }, 1));
      } catch (error) {
        console.error('Failed to start combat:', error);
      }
    }
  }, [initiatives, protocol]);

  const nextTurn = useCallback(async () => {
    if (!combatActive || initiatives.length === 0) return;

    let newTurn = currentTurn + 1;
    let newRound = round;

    if (newTurn >= initiatives.length) {
      newTurn = 0;
      newRound = round + 1;
    }

    setCurrentTurn(newTurn);
    setRound(newRound);

    // Update active status
    setInitiatives(prev => prev.map((init, index) => ({
      ...init,
      isActive: index === newTurn
    })));

    if (protocol) {
      try {
        await protocol.sendMessage(createMessage(MessageType.PLAYER_ACTION, {
          action: 'turn_next',
          currentTurn: newTurn,
          round: newRound
        }, 1));
      } catch (error) {
        console.error('Failed to advance turn:', error);
      }
    }
  }, [combatActive, initiatives.length, currentTurn, round, protocol]);

  const endCombat = useCallback(async () => {
    setCombatActive(false);
    setCurrentTurn(0);
    setRound(1);
    setInitiatives(prev => prev.map(init => ({ ...init, isActive: false })));

    if (protocol) {
      try {
        await protocol.sendMessage(createMessage(MessageType.PLAYER_ACTION, {
          action: 'combat_end'
        }, 1));
      } catch (error) {
        console.error('Failed to end combat:', error);
      }
    }
  }, [protocol]);

  const rollInitiative = useCallback((id: string) => {
    const roll = Math.floor(Math.random() * 20) + 1;
    updateInitiative(id, { initiative: roll });
  }, [updateInitiative]);

  const addCondition = useCallback((id: string, condition: string) => {
    if (!condition.trim()) return;
    
    const initiative = initiatives.find(init => init.id === id);
    if (initiative) {
      const newConditions = [...initiative.conditions, condition.trim()];
      updateInitiative(id, { conditions: newConditions });
    }
  }, [initiatives, updateInitiative]);

  const removeCondition = useCallback((id: string, conditionIndex: number) => {
    const initiative = initiatives.find(init => init.id === id);
    if (initiative) {
      const newConditions = initiative.conditions.filter((_, index) => index !== conditionIndex);
      updateInitiative(id, { conditions: newConditions });
    }
  }, [initiatives, updateInitiative]);

  return (
    <div className={styles.initiativeTracker}>
      <div className={styles.trackerHeader}>
        <h3>Initiative Tracker</h3>
        <div className={styles.combatControls}>
          {!combatActive ? (
            <button 
              onClick={startCombat}
              className={styles.btnPrimary}
              disabled={initiatives.length === 0}
            >
              Start Combat
            </button>
          ) : (
            <div className={styles.activeControls}>
              <button onClick={nextTurn} className={styles.btnPrimary}>
                Next Turn
              </button>
              <button onClick={endCombat} className={styles.btnSecondary}>
                End Combat
              </button>
            </div>
          )}
        </div>
      </div>

      {combatActive && (
        <div className={styles.combatStatus}>
          <span className={styles.roundInfo}>Round: {round}</span>
          <span className={styles.turnInfo}>
            Turn: {initiatives.length > 0 ? initiatives[currentTurn]?.name || 'Unknown' : 'None'}
          </span>
        </div>
      )}

      <div className={styles.addInitiative}>
        <button 
          onClick={() => setShowAddForm(true)}
          className={clsx(styles.btnSmall, styles.btnPrimary)}
        >
          + Add Character
        </button>
      </div>

      {showAddForm && (
        <div className={styles.addForm}>
          <div className={styles.formRow}>
            <input
              type="text"
              placeholder="Character name..."
              value={newInitiative.name}
              onChange={(e) => setNewInitiative(prev => ({ ...prev, name: e.target.value }))}
            />
          </div>
          <div className={styles.formRow}>
            <label>Initiative:</label>
            <input
              type="number"
              min="1"
              max="30"
              value={newInitiative.initiative}
              onChange={(e) => setNewInitiative(prev => ({ ...prev, initiative: parseInt(e.target.value) || 10 }))}
            />
            <button onClick={() => setNewInitiative(prev => ({ ...prev, initiative: Math.floor(Math.random() * 20) + 1 }))}>
              🎲
            </button>
          </div>
          <div className={styles.formRow}>
            <label>HP:</label>
            <input
              type="number"
              min="1"
              value={newInitiative.hp}
              onChange={(e) => setNewInitiative(prev => ({ ...prev, hp: parseInt(e.target.value) || 10, maxHp: parseInt(e.target.value) || 10 }))}
            />
            <label>AC:</label>
            <input
              type="number"
              min="1"
              value={newInitiative.ac}
              onChange={(e) => setNewInitiative(prev => ({ ...prev, ac: parseInt(e.target.value) || 10 }))}
            />
          </div>
          <div className={styles.formRow}>
            <label>
              <input
                type="checkbox"
                checked={newInitiative.isPlayer}
                onChange={(e) => setNewInitiative(prev => ({ ...prev, isPlayer: e.target.checked }))}
              />
              Player Character
            </label>
          </div>
          <div className={styles.formButtons}>
            <button onClick={addInitiative} className={clsx(styles.btnSmall, styles.btnPrimary)}>
              Add
            </button>
            <button 
              onClick={() => setShowAddForm(false)} 
              className={clsx(styles.btnSmall, styles.btnSecondary)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className={styles.initiativeList}>
        {initiatives.map((init) => (
          <div
            key={init.id}
            className={clsx(styles.initItem, init.isActive && styles.active)}
          >
            <div className={styles.initHeader}>
              <div className={styles.initInfo}>
                <span className={styles.initName}>{init.name}</span>
                <span className={styles.initValue}>{init.initiative}</span>
                <button 
                  onClick={() => rollInitiative(init.id)}
                  className={styles.rollInitBtn}
                  title="Roll Initiative"
                >
                  🎲
                </button>
              </div>
              <button
                onClick={() => removeInitiative(init.id)}
                className={styles.removeBtn}
                title="Remove"
              >
                ×
              </button>
            </div>

            <div className={styles.initStats}>
              <div className={styles.statGroup}>
                <label>HP:</label>
                <input
                  type="number"
                  min="0"
                  max={init.maxHp}
                  value={init.hp}
                  onChange={(e) => updateInitiative(init.id, { hp: parseInt(e.target.value) || 0 })}
                />
                <span className={styles.maxHp}>/ {init.maxHp}</span>
              </div>
              <div className={styles.statGroup}>
                <label>AC:</label>
                <input
                  type="number"
                  min="1"
                  value={init.ac}
                  onChange={(e) => updateInitiative(init.id, { ac: parseInt(e.target.value) || 10 })}
                  className={styles.acInput}
                />
              </div>
            </div>

            {init.conditions.length > 0 && (
              <div className={styles.conditions}>
                {init.conditions.map((condition, condIndex) => (
                  <span key={condIndex} className={styles.conditionTag}>
                    {condition}
                    <button 
                      onClick={() => removeCondition(init.id, condIndex)}
                      className={styles.removeCondition}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className={styles.conditionInput}>
              <input
                type="text"
                placeholder="Add condition..."
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    addCondition(init.id, e.currentTarget.value);
                    e.currentTarget.value = '';
                  }
                }}
              />
            </div>

            {init.notes && (
              <div className={styles.notes}>
                <textarea
                  value={init.notes}
                  onChange={(e) => updateInitiative(init.id, { notes: e.target.value })}
                  placeholder="Notes..."
                  rows={2}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default InitiativeTracker;
