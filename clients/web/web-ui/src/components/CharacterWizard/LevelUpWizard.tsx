/**
 * Level Up Wizard Component
 * Handles character level progression with automatic feature/spell advancement
 */

import { useEffect, useState } from 'react';
import { AdvancementSystemService, type AdvancedCharacter, type LevelProgression, type MulticlassRequirements } from '../../services/advancementSystem.service';

interface LevelUpWizardProps {
  character: AdvancedCharacter;
  onComplete: (updatedCharacter: AdvancedCharacter) => void;
  onCancel: () => void;
}

type LevelUpStep = 'class-choice' | 'hit-points' | 'asi-feat' | 'features' | 'spells' | 'review';

interface LevelUpChoices {
  class: string;
  hitPointMethod: 'average' | 'roll';
  hitPointRoll?: number;
  hitPointIncrease: number;
  asiOrFeat: 'asi' | 'feat';
  asiChoices?: Record<string, number>;
  featChoice?: string;
  featureChoices: Record<string, string>;
  newSpells: string[];
  newCantrips: string[];
}

export function LevelUpWizard({ character, onComplete, onCancel }: LevelUpWizardProps) {
  // DEBUG: Log what character object we receive
  console.log('🎯 LevelUpWizard received character:', character);
  console.log('🎯 character.strength =', character?.strength);
  console.log('🎯 character.classLevels =', character?.classLevels);
  console.log('🎯 character.experiencePoints =', character?.experiencePoints);
  
  // GUARD: Prevent rendering if character is invalid
  if (!character) {
    console.error('🎯 LevelUpWizard: character is undefined!');
    return (
      <div className="level-up-wizard">
        <div className="wizard-header">
          <h2>Error</h2>
          <p>Character data is missing. Please go back and complete the previous steps.</p>
        </div>
        <div className="wizard-actions">
          <button onClick={onCancel} className="btn-secondary">Back</button>
        </div>
      </div>
    );
  }
  
  if (!character.totalLevel || !character.experiencePoints) {
    console.error('🎯 LevelUpWizard: character is missing required properties', character);
    return (
      <div className="level-up-wizard">
        <div className="wizard-header">
          <h2>Error</h2>
          <p>Character data is incomplete. Missing level or experience points.</p>
        </div>
        <div className="wizard-actions">
          <button onClick={onCancel} className="btn-secondary">Back</button>
        </div>
      </div>
    );
  }
  
  const [currentStep, setCurrentStep] = useState<LevelUpStep>('class-choice');
  const [levelProgression, setLevelProgression] = useState<LevelProgression | null>(null);
  const [multiclassOptions, setMulticlassOptions] = useState<MulticlassRequirements[]>([]);
  const [choices, setChoices] = useState<LevelUpChoices>({
    class: character.classLevels[0]?.class || character.class,
    hitPointMethod: 'average',
    hitPointIncrease: 0,
    asiOrFeat: 'asi',
    featureChoices: {},
    newSpells: [],
    newCantrips: []
  });
  
  const nextLevel = character.totalLevel + 1;
  const currentXP = character.experiencePoints.current;
  const requiredXP = AdvancementSystemService.calculateXPForLevel(nextLevel);
  const canLevelUp = currentXP >= requiredXP;
  
  useEffect(() => {
    if (!canLevelUp) return;
    
    // Check multiclass options
    const abilities = {
      strength: character.strength,
      dexterity: character.dexterity,
      constitution: character.constitution,
      intelligence: character.intelligence,
      wisdom: character.wisdom,
      charisma: character.charisma
    };
    
    const allClasses = ['Fighter', 'Wizard', 'Rogue', 'Cleric', 'Barbarian', 'Bard', 'Druid', 'Monk', 'Paladin', 'Ranger', 'Sorcerer', 'Warlock'];
    const multiclassChecks = allClasses
      .filter(cls => !character.classLevels.some(cl => cl.class.toLowerCase() === cls.toLowerCase()))
      .map(cls => AdvancementSystemService.checkMulticlassRequirements(cls, abilities));
    
    setMulticlassOptions(multiclassChecks);
  }, [character, canLevelUp]);
  
  useEffect(() => {
    if (choices.class) {
      const classLevels = character.classLevels.find(cl => cl.class.toLowerCase() === choices.class.toLowerCase());
      const classLevel = (classLevels?.level || 0) + 1;
      
      const progression: LevelProgression = {
        level: nextLevel,
        totalXP: AdvancementSystemService.calculateXPForLevel(nextLevel),
        proficiencyBonus: AdvancementSystemService.getProficiencyBonus(nextLevel),
        newFeatures: AdvancementSystemService.getClassFeaturesForLevel(choices.class, classLevel),
        newSpells: AdvancementSystemService.getSpellProgression(choices.class, classLevel) || undefined,
        hitPointIncrease: AdvancementSystemService.calculateHitPointIncrease(
          choices.class, 
          Math.floor((character.constitution - 10) / 2)
        ),
        asiOrFeatAvailable: AdvancementSystemService.isASILevel(choices.class, classLevel)
      };
      
      setLevelProgression(progression);
      setChoices(prev => ({ ...prev, hitPointIncrease: progression.hitPointIncrease }));
    }
  }, [choices.class, character, nextLevel]);
  
  if (!canLevelUp) {
    return (
      <div className="level-up-wizard">
        <div className="wizard-header">
          <h2>Level Up Not Available</h2>
          <p>Your character does not have enough experience to level up.</p>
        </div>
        <div className="wizard-navigation">
          <button 
            type="button" 
            onClick={onCancel}
            className="nav-button secondary"
          >
            Close
          </button>
        </div>
      </div>
    );
  }
  
  const handleStepNavigation = (direction: 'next' | 'back') => {
    const steps: LevelUpStep[] = ['class-choice', 'hit-points', 'asi-feat', 'features', 'spells', 'review'];
    const currentIndex = steps.indexOf(currentStep);
    
    if (direction === 'next' && currentIndex < steps.length - 1) {
      // Skip steps that don't apply
      let nextStep = steps[currentIndex + 1];
      
      if (nextStep === 'asi-feat' && !levelProgression?.asiOrFeatAvailable) {
        nextStep = steps[currentIndex + 2] || 'review';
      }
      if (nextStep === 'features' && (!levelProgression?.newFeatures.length || !levelProgression.newFeatures.some(f => f.choices))) {
        nextStep = steps[currentIndex + 3] || 'review';
      }
      if (nextStep === 'spells' && !levelProgression?.newSpells) {
        nextStep = 'review';
      }
      
      setCurrentStep(nextStep);
    } else if (direction === 'back' && currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
    }
  };
  
  const handleFinishLevelUp = () => {
    const updatedCharacter = AdvancementSystemService.applyLevelUp(character, {
      class: choices.class,
      hitPointIncrease: choices.hitPointIncrease,
      asiChoices: choices.asiChoices,
      featChoice: choices.featChoice,
      featureChoices: choices.featureChoices,
      newSpells: choices.newSpells,
      newCantrips: choices.newCantrips
    });
    
    onComplete(updatedCharacter);
  };
  
  const renderClassChoice = () => (
    <div className="level-up-step">
      <h3>Choose Class for Level {nextLevel}</h3>
      <div className="class-options">
        {/* Current class option */}
        <div className="class-option primary">
          <label>
            <input
              type="radio"
              value={character.classLevels[0]?.class || character.class}
              checked={choices.class === (character.classLevels[0]?.class || character.class)}
              onChange={(e) => setChoices(prev => ({ ...prev, class: e.target.value }))}
            />
            <div className="class-info">
              <strong>Continue as {character.classLevels[0]?.class || character.class}</strong>
              <span>Level {(character.classLevels[0]?.level || 0) + 1}</span>
            </div>
          </label>
        </div>
        
        {/* Multiclass options */}
        {multiclassOptions.filter(opt => opt.met).map(option => (
          <div key={option.class} className="class-option multiclass">
            <label>
              <input
                type="radio"
                value={option.class}
                checked={choices.class === option.class}
                onChange={(e) => setChoices(prev => ({ ...prev, class: e.target.value }))}
              />
              <div className="class-info">
                <strong>Multiclass into {option.class}</strong>
                <span>Level 1 {option.class}</span>
              </div>
            </label>
          </div>
        ))}
        
        {/* Unavailable multiclass options */}
        {multiclassOptions.filter(opt => !opt.met).map(option => (
          <div key={option.class} className="class-option disabled">
            <div className="class-info">
              <strong>{option.class}</strong>
              <span className="requirements-not-met">
                Requires: {option.missing.join(', ')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
  
  const renderHitPointChoice = () => (
    <div className="level-up-step">
      <h3>Hit Point Increase</h3>
      <div className="hit-point-options">
        <div className="hp-method">
          <label>
            <input
              type="radio"
              value="average"
              checked={choices.hitPointMethod === 'average'}
              onChange={(e) => setChoices(prev => ({
                ...prev,
                hitPointMethod: e.target.value as 'average' | 'roll',
                hitPointIncrease: levelProgression?.hitPointIncrease || 0
              }))}
            />
            <div className="method-info">
              <strong>Take Average</strong>
              <span>Gain {levelProgression?.hitPointIncrease} hit points (recommended)</span>
            </div>
          </label>
        </div>
        
        <div className="hp-method">
          <label>
            <input
              type="radio"
              value="roll"
              checked={choices.hitPointMethod === 'roll'}
              onChange={(e) => setChoices(prev => ({ ...prev, hitPointMethod: e.target.value as 'average' | 'roll' }))}
            />
            <div className="method-info">
              <strong>Roll Hit Die</strong>
              <span>Roll for hit points (minimum 1 + CON modifier)</span>
            </div>
          </label>
        </div>
        
        {choices.hitPointMethod === 'roll' && (
          <div className="hp-roll-section">
            <button 
              type="button" 
              className="roll-button"
              onClick={() => {
                // In a real implementation, this would be a proper dice roll
                const hitDie = choices.class === 'Wizard' ? 6 : choices.class === 'Fighter' ? 10 : 8;
                const roll = Math.floor(Math.random() * hitDie) + 1;
                const conModifier = Math.floor((character.constitution - 10) / 2);
                const increase = Math.max(1, roll + conModifier);
                setChoices(prev => ({ ...prev, hitPointRoll: roll, hitPointIncrease: increase }));
              }}
            >
              Roll Hit Die
            </button>
            {choices.hitPointRoll && (
              <div className="roll-result">
                <span>Rolled: {choices.hitPointRoll}</span>
                <span>+ {Math.floor((character.constitution - 10) / 2)} (CON)</span>
                <span>= {choices.hitPointIncrease} HP gained</span>
              </div>
            )}
          </div>
        )}
      </div>
      
      <div className="hp-preview">
        <div className="hp-current">
          Current HP: {character.hitPoints.maximum}
        </div>
        <div className="hp-new">
          New HP: {character.hitPoints.maximum + choices.hitPointIncrease}
        </div>
      </div>
    </div>
  );
  
  const renderASIFeatChoice = () => {
    if (!levelProgression?.asiOrFeatAvailable) return null;
    
    return (
      <div className="level-up-step">
        <h3>Ability Score Improvement or Feat</h3>
        <div className="asi-feat-options">
          <div className="option-type">
            <label>
              <input
                type="radio"
                value="asi"
                checked={choices.asiOrFeat === 'asi'}
                onChange={(e) => setChoices(prev => ({ ...prev, asiOrFeat: e.target.value as 'asi' | 'feat' }))}
              />
              <div className="choice-info">
                <strong>Ability Score Improvement</strong>
                <span>Increase your ability scores by 2 points total</span>
              </div>
            </label>
          </div>
          
          <div className="option-type">
            <label>
              <input
                type="radio"
                value="feat"
                checked={choices.asiOrFeat === 'feat'}
                onChange={(e) => setChoices(prev => ({ ...prev, asiOrFeat: e.target.value as 'asi' | 'feat' }))}
              />
              <div className="choice-info">
                <strong>Choose a Feat</strong>
                <span>Gain a special ability or training</span>
              </div>
            </label>
          </div>
        </div>
        
        {choices.asiOrFeat === 'asi' && (
          <div className="asi-selection">
            <h4>Allocate 2 points among your abilities:</h4>
            <div className="ability-increases">
              {['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].map(ability => {
                const currentScore = (character as any)[ability];
                const increase = choices.asiChoices?.[ability] || 0;
                const maxIncrease = Math.min(2, 20 - currentScore);
                
                return (
                  <div key={ability} className="ability-increase">
                    <label>{ability.charAt(0).toUpperCase() + ability.slice(1)}</label>
                    <div className="ability-control">
                      <span className="current-score">{currentScore}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const newChoices = { ...choices.asiChoices };
                          const currentIncrease = newChoices[ability] || 0;
                          if (currentIncrease > 0) {
                            newChoices[ability] = currentIncrease - 1;
                            if (newChoices[ability] === 0) delete newChoices[ability];
                            setChoices(prev => ({ ...prev, asiChoices: newChoices }));
                          }
                        }}
                        disabled={increase === 0}
                      >
                        -
                      </button>
                      <span className="increase-amount">+{increase}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const totalIncreases = Object.values(choices.asiChoices || {}).reduce((sum, val) => sum + val, 0);
                          if (totalIncreases < 2 && increase < maxIncrease) {
                            const newChoices = { ...choices.asiChoices, [ability]: increase + 1 };
                            setChoices(prev => ({ ...prev, asiChoices: newChoices }));
                          }
                        }}
                        disabled={increase >= maxIncrease || Object.values(choices.asiChoices || {}).reduce((sum, val) => sum + val, 0) >= 2}
                      >
                        +
                      </button>
                      <span className="new-score">→ {currentScore + increase}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="asi-summary">
              Points remaining: {2 - Object.values(choices.asiChoices || {}).reduce((sum, val) => sum + val, 0)}
            </div>
          </div>
        )}
        
        {choices.asiOrFeat === 'feat' && (
          <div className="feat-selection">
            <h4>Choose a Feat:</h4>
            <select
              value={choices.featChoice || ''}
              onChange={(e) => setChoices(prev => ({ ...prev, featChoice: e.target.value }))}
            >
              <option value="">Select a feat...</option>
              <option value="Alert">Alert</option>
              <option value="Athlete">Athlete</option>
              <option value="Great Weapon Master">Great Weapon Master</option>
              <option value="Lucky">Lucky</option>
              <option value="Magic Initiate">Magic Initiate</option>
              <option value="Sharpshooter">Sharpshooter</option>
              <option value="War Caster">War Caster</option>
            </select>
          </div>
        )}
      </div>
    );
  };
  
  const renderFeatureChoices = () => {
    const featuresWithChoices = levelProgression?.newFeatures.filter(f => f.choices && f.choices.length > 0) || [];
    
    if (featuresWithChoices.length === 0) return null;
    
    return (
      <div className="level-up-step">
        <h3>Feature Choices</h3>
        <div className="feature-choices">
          {featuresWithChoices.map((feature, index) => (
            <div key={index} className="feature-choice">
              <h4>{feature.name}</h4>
              <p>{feature.description}</p>
              {feature.choices?.map((choice, choiceIndex) => (
                <div key={choiceIndex} className="choice-selection">
                  <label>{choice.name}:</label>
                  <select
                    value={choices.featureChoices[`${feature.name}-${choice.name}`] || ''}
                    onChange={(e) => setChoices(prev => ({
                      ...prev,
                      featureChoices: {
                        ...prev.featureChoices,
                        [`${feature.name}-${choice.name}`]: e.target.value
                      }
                    }))}
                  >
                    <option value="">Select...</option>
                    {choice.options.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  };
  
  const renderSpellChoices = () => {
    if (!levelProgression?.newSpells) return null;
    
    return (
      <div className="level-up-step">
        <h3>New Spells</h3>
        <div className="spell-selection">
          {levelProgression.newSpells.newCantrips > 0 && (
            <div className="cantrip-selection">
              <h4>Choose {levelProgression.newSpells.newCantrips} Cantrips:</h4>
              {/* Cantrip selection would go here - simplified for now */}
              <div className="spell-grid">
                {['Mage Hand', 'Prestidigitation', 'Fire Bolt', 'Minor Illusion'].map(cantrip => (
                  <label key={cantrip}>
                    <input
                      type="checkbox"
                      checked={choices.newCantrips.includes(cantrip)}
                      onChange={(e) => {
                        if (e.target.checked && choices.newCantrips.length < levelProgression.newSpells!.newCantrips) {
                          setChoices(prev => ({ ...prev, newCantrips: [...prev.newCantrips, cantrip] }));
                        } else if (!e.target.checked) {
                          setChoices(prev => ({ ...prev, newCantrips: prev.newCantrips.filter(c => c !== cantrip) }));
                        }
                      }}
                    />
                    {cantrip}
                  </label>
                ))}
              </div>
            </div>
          )}
          
          {levelProgression.newSpells.newSpells > 0 && (
            <div className="spell-selection">
              <h4>Choose {levelProgression.newSpells.newSpells} Spells:</h4>
              {/* Spell selection would go here - simplified for now */}
              <div className="spell-grid">
                {['Magic Missile', 'Shield', 'Burning Hands', 'Identify'].map(spell => (
                  <label key={spell}>
                    <input
                      type="checkbox"
                      checked={choices.newSpells.includes(spell)}
                      onChange={(e) => {
                        if (e.target.checked && choices.newSpells.length < levelProgression.newSpells!.newSpells) {
                          setChoices(prev => ({ ...prev, newSpells: [...prev.newSpells, spell] }));
                        } else if (!e.target.checked) {
                          setChoices(prev => ({ ...prev, newSpells: prev.newSpells.filter(s => s !== spell) }));
                        }
                      }}
                    />
                    {spell}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };
  
  const renderReview = () => (
    <div className="level-up-step">
      <h3>Review Level Up</h3>
      <div className="level-up-summary">
        <div className="summary-section">
          <h4>Level Progression</h4>
          <p>Advancing to Level {nextLevel} {choices.class}</p>
          <p>Hit Points: +{choices.hitPointIncrease} ({character.hitPoints.maximum} → {character.hitPoints.maximum + choices.hitPointIncrease})</p>
          <p>Proficiency Bonus: +{levelProgression?.proficiencyBonus}</p>
        </div>
        
        {levelProgression?.asiOrFeatAvailable && (
          <div className="summary-section">
            <h4>Ability Improvement</h4>
            {choices.asiOrFeat === 'asi' && choices.asiChoices && (
              <div>
                <p>Ability Score Increases:</p>
                <ul>
                  {Object.entries(choices.asiChoices).map(([ability, increase]) => (
                    <li key={ability}>
                      {ability.charAt(0).toUpperCase() + ability.slice(1)}: +{increase}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {choices.asiOrFeat === 'feat' && choices.featChoice && (
              <p>Feat: {choices.featChoice}</p>
            )}
          </div>
        )}
        
        {levelProgression?.newFeatures && levelProgression.newFeatures.length > 0 && (
          <div className="summary-section">
            <h4>New Features</h4>
            <ul>
              {levelProgression.newFeatures.map((feature, index) => (
                <li key={index}>{feature.name}</li>
              ))}
            </ul>
          </div>
        )}
        
        {(choices.newSpells.length > 0 || choices.newCantrips.length > 0) && (
          <div className="summary-section">
            <h4>New Spells</h4>
            {choices.newCantrips.length > 0 && (
              <p>Cantrips: {choices.newCantrips.join(', ')}</p>
            )}
            {choices.newSpells.length > 0 && (
              <p>Spells: {choices.newSpells.join(', ')}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
  
  return (
    <div className="level-up-wizard">
      <div className="wizard-header">
        <h2>Level Up to {nextLevel}</h2>
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ 
              width: `${(['class-choice', 'hit-points', 'asi-feat', 'features', 'spells', 'review'].indexOf(currentStep) + 1) / 6 * 100}%` 
            }}
          />
        </div>
      </div>
      
      <div className="wizard-content">
        {currentStep === 'class-choice' && renderClassChoice()}
        {currentStep === 'hit-points' && renderHitPointChoice()}
        {currentStep === 'asi-feat' && renderASIFeatChoice()}
        {currentStep === 'features' && renderFeatureChoices()}
        {currentStep === 'spells' && renderSpellChoices()}
        {currentStep === 'review' && renderReview()}
      </div>
      
      <div className="wizard-navigation">
        <button 
          type="button" 
          onClick={() => handleStepNavigation('back')}
          disabled={currentStep === 'class-choice'}
          className="nav-button secondary"
        >
          Back
        </button>
        
        {currentStep === 'review' ? (
          <button
            type="button"
            onClick={handleFinishLevelUp}
            className="nav-button primary"
          >
            Complete Level Up
          </button>
        ) : (
          <button
            type="button"
            onClick={() => handleStepNavigation('next')}
            className="nav-button primary"
          >
            Next
          </button>
        )}
        
        <button
          type="button"
          onClick={onCancel}
          className="nav-button cancel"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default LevelUpWizard;