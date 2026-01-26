import React, { useCallback, useEffect, useState } from 'react';
import type { UserInfo } from '../features/auth';
import { useAuthenticatedWebSocket } from '@features/auth';
import { MessageType, createMessage } from '@lib/websocket';

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
    <div className="initiative-tracker">
      <div className="tracker-header">
        <h3>Initiative Tracker</h3>
        <div className="combat-controls">
          {!combatActive ? (
            <button 
              onClick={startCombat}
              className="btn-primary"
              disabled={initiatives.length === 0}
            >
              Start Combat
            </button>
          ) : (
            <div className="active-controls">
              <button onClick={nextTurn} className="btn-primary">
                Next Turn
              </button>
              <button onClick={endCombat} className="btn-secondary">
                End Combat
              </button>
            </div>
          )}
        </div>
      </div>

      {combatActive && (
        <div className="combat-status">
          <span className="round-info">Round: {round}</span>
          <span className="turn-info">
            Turn: {initiatives.length > 0 ? initiatives[currentTurn]?.name || 'Unknown' : 'None'}
          </span>
        </div>
      )}

      <div className="add-initiative">
        <button 
          onClick={() => setShowAddForm(true)}
          className="btn-small btn-primary"
        >
          + Add Character
        </button>
      </div>

      {showAddForm && (
        <div className="add-form">
          <div className="form-row">
            <input
              type="text"
              placeholder="Character name..."
              value={newInitiative.name}
              onChange={(e) => setNewInitiative(prev => ({ ...prev, name: e.target.value }))}
            />
          </div>
          <div className="form-row">
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
          <div className="form-row">
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
          <div className="form-row">
            <label>
              <input
                type="checkbox"
                checked={newInitiative.isPlayer}
                onChange={(e) => setNewInitiative(prev => ({ ...prev, isPlayer: e.target.checked }))}
              />
              Player Character
            </label>
          </div>
          <div className="form-buttons">
            <button onClick={addInitiative} className="btn-small btn-primary">
              Add
            </button>
            <button 
              onClick={() => setShowAddForm(false)} 
              className="btn-small btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="initiative-list">
        {initiatives.map((init) => (
          <div
            key={init.id}
            className={`initiative-item ${init.isActive ? 'active-turn' : ''} ${init.isPlayer ? 'player' : 'npc'}`}
          >
            <div className="init-header">
              <div className="init-info">
                <span className="init-name">{init.name}</span>
                <span className="init-value">{init.initiative}</span>
                <button 
                  onClick={() => rollInitiative(init.id)}
                  className="roll-init-btn"
                  title="Roll Initiative"
                >
                  🎲
                </button>
              </div>
              <button
                onClick={() => removeInitiative(init.id)}
                className="remove-btn"
                title="Remove"
              >
                ×
              </button>
            </div>

            <div className="init-stats">
              <div className="stat-group">
                <label>HP:</label>
                <input
                  type="number"
                  min="0"
                  max={init.maxHp}
                  value={init.hp}
                  onChange={(e) => updateInitiative(init.id, { hp: parseInt(e.target.value) || 0 })}
                  className={`hp-input ${init.hp <= init.maxHp * 0.25 ? 'critical' : init.hp <= init.maxHp * 0.5 ? 'warning' : ''}`}
                />
                <span className="max-hp">/ {init.maxHp}</span>
              </div>
              <div className="stat-group">
                <label>AC:</label>
                <input
                  type="number"
                  min="1"
                  value={init.ac}
                  onChange={(e) => updateInitiative(init.id, { ac: parseInt(e.target.value) || 10 })}
                  className="ac-input"
                />
              </div>
            </div>

            {init.conditions.length > 0 && (
              <div className="conditions">
                {init.conditions.map((condition, condIndex) => (
                  <span key={condIndex} className="condition-tag">
                    {condition}
                    <button 
                      onClick={() => removeCondition(init.id, condIndex)}
                      className="remove-condition"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="condition-input">
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
              <div className="notes">
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

      <style>{`
        .initiative-tracker {
          background: #1f2937;
          color: white;
          padding: 1rem;
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .tracker-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid #374151;
        }

        .combat-controls {
          display: flex;
          gap: 0.5rem;
        }

        .active-controls {
          display: flex;
          gap: 0.5rem;
        }

        .combat-status {
          display: flex;
          justify-content: space-between;
          padding: 0.5rem;
          background: #374151;
          border-radius: 4px;
          margin-bottom: 1rem;
          font-weight: bold;
        }

        .add-initiative {
          margin-bottom: 1rem;
        }

        .add-form {
          background: #374151;
          padding: 1rem;
          border-radius: 4px;
          margin-bottom: 1rem;
        }

        .form-row {
          display: flex;
          gap: 0.5rem;
          align-items: center;
          margin-bottom: 0.5rem;
        }

        .form-row input[type="text"], .form-row input[type="number"] {
          flex: 1;
          padding: 0.25rem;
          border: 1px solid #4b5563;
          border-radius: 2px;
          background: #4b5563;
          color: white;
        }

        .form-buttons {
          display: flex;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }

        .initiative-list {
          flex: 1;
          overflow-y: auto;
        }

        .initiative-item {
          border: 1px solid #374151;
          border-radius: 4px;
          margin-bottom: 0.5rem;
          padding: 0.75rem;
          background: #374151;
        }

        .initiative-item.active-turn {
          border-color: #10b981;
          background: #065f46;
        }

        .initiative-item.player {
          border-left: 4px solid #3b82f6;
        }

        .initiative-item.npc {
          border-left: 4px solid #ef4444;
        }

        .init-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }

        .init-info {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .init-name {
          font-weight: bold;
        }

        .init-value {
          background: #4b5563;
          padding: 0.2rem 0.5rem;
          border-radius: 3px;
          font-weight: bold;
        }

        .roll-init-btn, .remove-btn, .remove-condition {
          background: none;
          border: none;
          color: #9ca3af;
          cursor: pointer;
          padding: 0.1rem;
        }

        .roll-init-btn:hover, .remove-btn:hover {
          color: white;
        }

        .init-stats {
          display: flex;
          gap: 1rem;
          margin-bottom: 0.5rem;
        }

        .stat-group {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }

        .stat-group label {
          font-size: 0.8rem;
          color: #9ca3af;
        }

        .hp-input, .ac-input {
          width: 50px;
          padding: 0.2rem;
          border: 1px solid #4b5563;
          border-radius: 2px;
          background: #4b5563;
          color: white;
          text-align: center;
        }

        .hp-input.warning {
          border-color: #f59e0b;
          background: #451a03;
        }

        .hp-input.critical {
          border-color: #ef4444;
          background: #450a0a;
        }

        .max-hp {
          font-size: 0.8rem;
          color: #9ca3af;
        }

        .conditions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.25rem;
          margin-bottom: 0.5rem;
        }

        .condition-tag {
          background: #7c3aed;
          color: white;
          padding: 0.2rem 0.4rem;
          border-radius: 12px;
          font-size: 0.7rem;
          display: flex;
          align-items: center;
          gap: 0.2rem;
        }

        .condition-input input {
          width: 100%;
          padding: 0.2rem;
          border: 1px solid #4b5563;
          border-radius: 2px;
          background: #4b5563;
          color: white;
          font-size: 0.8rem;
        }

        .notes textarea {
          width: 100%;
          padding: 0.3rem;
          border: 1px solid #4b5563;
          border-radius: 2px;
          background: #4b5563;
          color: white;
          font-size: 0.8rem;
          resize: vertical;
        }

        .btn-primary {
          background: #3b82f6;
          color: white;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 4px;
          cursor: pointer;
        }

        .btn-secondary {
          background: #6b7280;
          color: white;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 4px;
          cursor: pointer;
        }

        .btn-small {
          padding: 0.25rem 0.5rem;
          font-size: 0.8rem;
        }

        h3 {
          margin: 0;
        }
      `}</style>
    </div>
  );
};

export default InitiativeTracker;
