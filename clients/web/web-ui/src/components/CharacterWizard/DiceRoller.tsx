import React, { useState } from 'react';
import { CombatSystemService, type DiceResult } from '../../services/combatSystem.service';

interface DiceRollerProps {
  formula?: string;
  label?: string;
  onRoll?: (result: DiceResult) => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'attack' | 'damage' | 'save';
  showHistory?: boolean;
}

export const DiceRoller: React.FC<DiceRollerProps> = ({
  formula = '1d20',
  label,
  onRoll,
  disabled = false,
  variant = 'primary',
  showHistory = true
}) => {
  const [result, setResult] = useState<DiceResult | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [rollHistory, setRollHistory] = useState<DiceResult[]>([]);
  const [showDetails, setShowDetails] = useState(false);

  const handleRoll = async () => {
    if (disabled || isRolling) return;

    setIsRolling(true);
    
    // Add rolling animation delay
    setTimeout(() => {
      try {
        const rollResult = CombatSystemService.rollDice(formula);
        setResult(rollResult);
        
        if (showHistory) {
          setRollHistory(prev => [rollResult, ...prev.slice(0, 9)]); // Keep last 10 rolls
        }
        
        if (onRoll) {
          onRoll(rollResult);
        }
        
        setShowDetails(true);
        setTimeout(() => setShowDetails(false), 3000); // Auto-hide details after 3s
      } catch (error) {
        console.error('Dice roll error:', error);
      } finally {
        setIsRolling(false);
      }
    }, 500);
  };

  const getRollQuality = (result: DiceResult): 'critical' | 'high' | 'normal' | 'low' => {
    if (!result.rolls.length) return 'normal';
    
    const maxRoll = result.rolls[0]; // Assuming d20 for now
    if (maxRoll === 20) return 'critical';
    if (maxRoll >= 15) return 'high';
    if (maxRoll <= 5) return 'low';
    return 'normal';
  };

  const formatRollDetails = (result: DiceResult): string => {
    if (result.rolls.length === 0) return result.formula;
    
    const rollsText = result.rolls.join(' + ');
    const modifierText = result.modifier !== 0 ? ` ${result.modifier >= 0 ? '+' : ''}${result.modifier}` : '';
    return `${rollsText}${modifierText}`;
  };

  return (
    <div className={`dice-roller ${variant} ${disabled ? 'disabled' : ''}`}>
      <div className="dice-roller-main">
        <button
          type="button"
          onClick={handleRoll}
          disabled={disabled || isRolling}
          className={`dice-button ${isRolling ? 'rolling' : ''}`}
          title={`Roll ${formula}`}
        >
          <div className="dice-icon">
            {isRolling ? '🎲' : '🎲'}
          </div>
          <div className="dice-info">
            {label && <span className="dice-label">{label}</span>}
            <span className="dice-formula">{formula}</span>
          </div>
          {result && !isRolling && (
            <div className={`dice-result ${getRollQuality(result)}`}>
              {result.total}
            </div>
          )}
        </button>

        {result && showDetails && (
          <div className={`roll-details ${getRollQuality(result)}`}>
            <div className="roll-breakdown">
              <span className="formula-text">{formatRollDetails(result)}</span>
              <span className="equals">=</span>
              <span className="total">{result.total}</span>
            </div>
            
            {getRollQuality(result) === 'critical' && (
              <div className="critical-indicator">
                🌟 Critical Success!
              </div>
            )}
            
            {getRollQuality(result) === 'low' && result.rolls[0] === 1 && (
              <div className="fumble-indicator">
                💥 Critical Failure!
              </div>
            )}
          </div>
        )}
      </div>

      {showHistory && rollHistory.length > 0 && (
        <div className="dice-history">
          <div className="history-header">
            <span>Recent Rolls</span>
            <button
              type="button"
              onClick={() => setRollHistory([])}
              className="clear-history"
              title="Clear History"
            >
              ✕
            </button>
          </div>
          <div className="history-list">
            {rollHistory.slice(0, 5).map((historyResult, index) => (
              <div key={index} className={`history-item ${getRollQuality(historyResult)}`}>
                <span className="history-formula">{historyResult.formula}</span>
                <span className="history-result">{historyResult.total}</span>
                <span className="history-time">
                  {historyResult.timestamp.toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Pre-configured dice roller components
export const AttackRoll: React.FC<{ attackBonus: number; label?: string; onRoll?: (result: DiceResult) => void }> = ({
  attackBonus,
  label = 'Attack Roll',
  onRoll
}) => (
  <DiceRoller
    formula={`1d20${attackBonus >= 0 ? '+' : ''}${attackBonus}`}
    label={label}
    variant="attack"
    onRoll={onRoll}
  />
);

export const DamageRoll: React.FC<{ 
  dice: string; 
  bonus?: number; 
  damageType?: string; 
  label?: string; 
  onRoll?: (result: DiceResult) => void;
}> = ({
  dice,
  bonus = 0,
  damageType,
  label,
  onRoll
}) => {
  const formula = bonus !== 0 ? `${dice}${bonus >= 0 ? '+' : ''}${bonus}` : dice;
  const displayLabel = label || `${formula} ${damageType || 'damage'}`;
  
  return (
    <DiceRoller
      formula={formula}
      label={displayLabel}
      variant="damage"
      onRoll={onRoll}
    />
  );
};

export const SavingThrowRoll: React.FC<{ 
  saveBonus: number; 
  saveName: string; 
  onRoll?: (result: DiceResult) => void;
}> = ({
  saveBonus,
  saveName,
  onRoll
}) => (
  <DiceRoller
    formula={`1d20${saveBonus >= 0 ? '+' : ''}${saveBonus}`}
    label={`${saveName} Save`}
    variant="save"
    onRoll={onRoll}
  />
);

export const AbilityCheckRoll: React.FC<{ 
  modifier: number; 
  skillName: string; 
  onRoll?: (result: DiceResult) => void;
}> = ({
  modifier,
  skillName,
  onRoll
}) => (
  <DiceRoller
    formula={`1d20${modifier >= 0 ? '+' : ''}${modifier}`}
    label={`${skillName} Check`}
    variant="secondary"
    onRoll={onRoll}
  />
);

export const InitiativeRoll: React.FC<{ 
  initiativeBonus: number; 
  onRoll?: (result: DiceResult) => void;
}> = ({
  initiativeBonus,
  onRoll
}) => (
  <DiceRoller
    formula={`1d20${initiativeBonus >= 0 ? '+' : ''}${initiativeBonus}`}
    label="Initiative"
    variant="primary"
    onRoll={onRoll}
    showHistory={false}
  />
);

// Utility component for custom dice expressions
export const CustomDiceRoll: React.FC<{
  children: React.ReactNode;
  onRollRequest: () => string; // Returns formula to roll
  onResult?: (result: DiceResult) => void;
}> = ({ children, onRollRequest, onResult }) => {
  const [pendingFormula, setPendingFormula] = useState<string | null>(null);

  const handleClick = () => {
    const formula = onRollRequest();
    setPendingFormula(formula);
  };

  const handleRoll = (result: DiceResult) => {
    setPendingFormula(null);
    if (onResult) {
      onResult(result);
    }
  };

  if (pendingFormula) {
    return (
      <DiceRoller
        formula={pendingFormula}
        onRoll={handleRoll}
        variant="primary"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="dice-trigger"
    >
      {children}
    </button>
  );
};