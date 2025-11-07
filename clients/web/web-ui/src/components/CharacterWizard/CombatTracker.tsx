import React, { useEffect, useState } from 'react';
import type { UserInfo } from '../../services/auth.service';
import { CombatSystemService, type CombatStats, type DiceResult } from '../../services/combatSystem.service';
import './CombatTracker.css';
import { InitiativeRoll } from './DiceRoller';
import type { WizardFormData } from './WizardFormData';

interface CombatParticipant {
  id: string;
  name: string;
  character?: WizardFormData;
  combatStats: CombatStats;
  initiative: number;
  conditions: string[];
  notes: string;
  isPlayer: boolean;
  isActive: boolean;
}

interface CombatTrackerProps {
  characters?: WizardFormData[];
  combatants?: any[];
  userInfo?: UserInfo;
  inCombat?: boolean;
  withMap?: boolean;
  onClose?: () => void;
}

export const CombatTracker: React.FC<CombatTrackerProps> = ({
  characters,
  combatants,
  userInfo: _userInfo,
  inCombat,
  withMap: _withMap,
  onClose
}) => {
  const [participants, setParticipants] = useState<CombatParticipant[]>([]);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [round, setRound] = useState(1);
  const [combatStarted, setCombatStarted] = useState(false);
  const [showAddParticipant, setShowAddParticipant] = useState(false);

  // Initialize participants from characters or combatants
  useEffect(() => {
    let initialParticipants: CombatParticipant[] = [];
    
    if (combatants) {
      // Convert combatants to participants
      initialParticipants = combatants.map((combatant, index) => ({
        id: combatant.id || `combatant-${index}`,
        name: combatant.name || `Combatant ${index + 1}`,
        character: combatant,
        combatStats: {
          armorClass: combatant.ac || 10,
          hitPoints: {
            current: combatant.hp || combatant.maxHp || 20,
            maximum: combatant.maxHp || 20,
            temporary: 0
          },
          speed: 30,
          initiative: combatant.initiative || 0,
          proficiencyBonus: Math.max(2, Math.floor((combatant.level || 1) / 4) + 2),
          savingThrows: {
            strength: combatant.stats?.str || 10,
            dexterity: combatant.stats?.dex || 10,
            constitution: combatant.stats?.con || 10,
            intelligence: combatant.stats?.int || 10,
            wisdom: combatant.stats?.wis || 10,
            charisma: combatant.stats?.cha || 10
          },
          skills: [],
          passivePerception: 10 + Math.floor(((combatant.stats?.wis || 10) - 10) / 2)
        },
        initiative: combatant.initiative || 0,
        conditions: combatant.conditions || [],
        notes: '',
        isPlayer: combatant.type === 'player' || combatant.type === 'character',
        isActive: false
      }));
    } else if (characters) {
      // Convert characters to participants
      initialParticipants = characters.map((char, index) => ({
        id: `player-${index}`,
        name: char.name || `Character ${index + 1}`,
        character: char,
        combatStats: CombatSystemService.generateCombatStats(char),
        initiative: 0,
        conditions: [],
        notes: '',
        isPlayer: true,
        isActive: false
      }));
    }
    
    setParticipants(initialParticipants);
    if (inCombat) {
      setCombatStarted(true);
    }
  }, [characters, combatants, inCombat]);

  const sortParticipantsByInitiative = () => {
    const sorted = [...participants].sort((a, b) => b.initiative - a.initiative);
    setParticipants(sorted);
    setCurrentTurn(0);
    if (sorted.length > 0) {
      sorted[0].isActive = true;
    }
  };

  const startCombat = () => {
    sortParticipantsByInitiative();
    setCombatStarted(true);
    setRound(1);
  };

  const nextTurn = () => {
    const newParticipants = [...participants];
    newParticipants[currentTurn].isActive = false;
    
    let nextTurnIndex = (currentTurn + 1) % participants.length;
    
    // If we're back to the first participant, increment round
    if (nextTurnIndex === 0) {
      setRound(prev => prev + 1);
    }
    
    newParticipants[nextTurnIndex].isActive = true;
    setParticipants(newParticipants);
    setCurrentTurn(nextTurnIndex);
  };

  const rollInitiativeForParticipant = (participantId: string, result: DiceResult) => {
    setParticipants(prev => prev.map(p => 
      p.id === participantId 
        ? { ...p, initiative: result.total }
        : p
    ));
  };

  const updateHitPoints = (participantId: string, newCurrent: number, newTemp: number = 0) => {
    setParticipants(prev => prev.map(p => 
      p.id === participantId 
        ? { 
            ...p, 
            combatStats: {
              ...p.combatStats,
              hitPoints: {
                ...p.combatStats.hitPoints,
                current: Math.max(0, Math.min(newCurrent, p.combatStats.hitPoints.maximum)),
                temporary: Math.max(0, newTemp)
              }
            }
          }
        : p
    ));
  };

  const addCondition = (participantId: string, condition: string) => {
    if (!condition.trim()) return;
    
    setParticipants(prev => prev.map(p => 
      p.id === participantId 
        ? { ...p, conditions: [...p.conditions, condition.trim()] }
        : p
    ));
  };

  const removeCondition = (participantId: string, conditionIndex: number) => {
    setParticipants(prev => prev.map(p => 
      p.id === participantId 
        ? { ...p, conditions: p.conditions.filter((_, index) => index !== conditionIndex) }
        : p
    ));
  };

  const addCustomParticipant = (name: string, ac: number, hp: number, initiative: number) => {
    const newParticipant: CombatParticipant = {
      id: `npc-${Date.now()}`,
      name: name.trim() || 'Unknown Creature',
      combatStats: {
        armorClass: ac,
        hitPoints: { current: hp, maximum: hp, temporary: 0 },
        speed: 30,
        initiative: 0,
        proficiencyBonus: 2,
        savingThrows: {
          strength: 0, dexterity: 0, constitution: 0,
          intelligence: 0, wisdom: 0, charisma: 0
        },
        skills: {},
        passivePerception: 10
      },
      initiative,
      conditions: [],
      notes: '',
      isPlayer: false,
      isActive: false
    };
    
    setParticipants(prev => [...prev, newParticipant]);
    setShowAddParticipant(false);
  };

  const removeParticipant = (participantId: string) => {
    setParticipants(prev => prev.filter(p => p.id !== participantId));
  };

  const resetCombat = () => {
    setCombatStarted(false);
    setCurrentTurn(0);
    setRound(1);
    setParticipants(prev => prev.map(p => ({
      ...p,
      initiative: 0,
      isActive: false,
      conditions: [],
      combatStats: {
        ...p.combatStats,
        hitPoints: {
          ...p.combatStats.hitPoints,
          current: p.combatStats.hitPoints.maximum,
          temporary: 0
        }
      }
    })));
  };

  if (!combatStarted) {
    return (
      <div className="combat-tracker setup">
        <div className="combat-header">
          <h2>🎲 Combat Setup</h2>
          {onClose && (
            <button onClick={onClose} className="close-button">✕</button>
          )}
        </div>

        <div className="setup-content">
          <div className="participants-setup">
            <div className="setup-header">
              <h3>Combat Participants</h3>
              <button
                onClick={() => setShowAddParticipant(true)}
                className="add-participant-btn"
              >
                + Add NPC/Monster
              </button>
            </div>

            <div className="participants-list">
              {participants.map(participant => (
                <div key={participant.id} className="participant-setup">
                  <div className="participant-info">
                    <div className="participant-name">
                      <span className={participant.isPlayer ? 'player' : 'npc'}>
                        {participant.isPlayer ? '👤' : '👹'}
                      </span>
                      <strong>{participant.name}</strong>
                    </div>
                    <div className="participant-stats">
                      <span>AC {participant.combatStats.armorClass}</span>
                      <span>HP {participant.combatStats.hitPoints.maximum}</span>
                    </div>
                  </div>
                  
                  <div className="participant-controls">
                    <div className="initiative-section">
                      <InitiativeRoll
                        initiativeBonus={participant.combatStats.initiative}
                        onRoll={(result) => rollInitiativeForParticipant(participant.id, result)}
                      />
                      {participant.initiative > 0 && (
                        <div className="initiative-display">
                          Initiative: <strong>{participant.initiative}</strong>
                        </div>
                      )}
                    </div>
                    
                    {!participant.isPlayer && (
                      <button
                        onClick={() => removeParticipant(participant.id)}
                        className="remove-participant"
                        title="Remove Participant"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {showAddParticipant && (
              <div className="add-participant-form">
                <div className="form-header">
                  <h4>Add NPC/Monster</h4>
                  <button onClick={() => setShowAddParticipant(false)}>✕</button>
                </div>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.target as HTMLFormElement);
                  addCustomParticipant(
                    formData.get('name') as string,
                    parseInt(formData.get('ac') as string) || 10,
                    parseInt(formData.get('hp') as string) || 1,
                    parseInt(formData.get('initiative') as string) || 0
                  );
                }}>
                  <div className="form-row">
                    <input name="name" placeholder="Name" required />
                    <input name="ac" type="number" placeholder="AC" min="1" max="30" required />
                    <input name="hp" type="number" placeholder="HP" min="1" required />
                    <input name="initiative" type="number" placeholder="Initiative" />
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="add-btn">Add</button>
                    <button type="button" onClick={() => setShowAddParticipant(false)}>Cancel</button>
                  </div>
                </form>
              </div>
            )}
          </div>

          <div className="setup-actions">
            <button
              onClick={startCombat}
              disabled={participants.length === 0 || participants.some(p => p.initiative === 0)}
              className="start-combat-btn"
            >
              ⚔️ Start Combat
            </button>
            <p className="setup-note">
              Roll initiative for all participants before starting combat.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const activeParticipant = participants[currentTurn];

  return (
    <div className="combat-tracker active">
      <div className="combat-header">
        <div className="combat-info">
          <h2>⚔️ Combat Tracker</h2>
          <div className="round-info">
            <span>Round {round}</span>
            <span>Turn: {activeParticipant?.name}</span>
          </div>
        </div>
        <div className="combat-controls">
          <button onClick={nextTurn} className="next-turn-btn">
            Next Turn →
          </button>
          <button onClick={resetCombat} className="reset-btn">
            🔄 Reset
          </button>
          {onClose && (
            <button onClick={onClose} className="close-button">✕</button>
          )}
        </div>
      </div>

      <div className="combat-content">
        <div className="initiative-order">
          <h3>Initiative Order</h3>
          <div className="participants-active">
            {participants.map((participant) => (
              <div 
                key={participant.id} 
                className={`participant-active ${participant.isActive ? 'current-turn' : ''} ${participant.combatStats.hitPoints.current <= 0 ? 'unconscious' : ''}`}
              >
                <div className="participant-header">
                  <div className="participant-basic">
                    <span className={participant.isPlayer ? 'player-icon' : 'npc-icon'}>
                      {participant.isPlayer ? '👤' : '👹'}
                    </span>
                    <div className="participant-details">
                      <strong className="participant-name">{participant.name}</strong>
                      <div className="initiative-display">Initiative: {participant.initiative}</div>
                    </div>
                  </div>
                  
                  <div className="participant-vital-stats">
                    <div className="stat-group">
                      <label>AC</label>
                      <span>{participant.combatStats.armorClass}</span>
                    </div>
                    <div className="stat-group hp">
                      <label>HP</label>
                      <div className="hp-controls">
                        <input
                          type="number"
                          value={participant.combatStats.hitPoints.current}
                          onChange={(e) => updateHitPoints(participant.id, parseInt(e.target.value) || 0, participant.combatStats.hitPoints.temporary)}
                          min="0"
                          max={participant.combatStats.hitPoints.maximum}
                          className="hp-input"
                        />
                        <span className="hp-max">/ {participant.combatStats.hitPoints.maximum}</span>
                      </div>
                    </div>
                    {participant.combatStats.hitPoints.temporary > 0 && (
                      <div className="stat-group temp-hp">
                        <label>Temp HP</label>
                        <input
                          type="number"
                          value={participant.combatStats.hitPoints.temporary}
                          onChange={(e) => updateHitPoints(participant.id, participant.combatStats.hitPoints.current, parseInt(e.target.value) || 0)}
                          min="0"
                          className="temp-hp-input"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="participant-status">
                  <div className="conditions-section">
                    <div className="conditions-list">
                      {participant.conditions.map((condition, condIndex) => (
                        <span key={condIndex} className="condition-tag">
                          {condition}
                          <button onClick={() => removeCondition(participant.id, condIndex)}>×</button>
                        </span>
                      ))}
                    </div>
                    <div className="add-condition">
                      <input
                        type="text"
                        placeholder="Add condition..."
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            const input = e.target as HTMLInputElement;
                            addCondition(participant.id, input.value);
                            input.value = '';
                          }
                        }}
                        className="condition-input"
                      />
                    </div>
                  </div>
                  
                  <div className="hp-bar">
                    <div
                      className="hp-fill"
                      style={{
                        width: `${(participant.combatStats.hitPoints.current / participant.combatStats.hitPoints.maximum) * 100}%`
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};