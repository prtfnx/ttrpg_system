import React, { useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import type { ExtendedCharacterClass } from '../services/classProgression.service';
import { classProgressionService } from '../services/classProgression.service';
import styles from './ClassSelectionStep.module.css';

// Character form data interface
interface CharacterFormData {
  character_class: string;
  subclass: string;
  level: number;
  ability_scores: Record<string, number>;
  // Add other form fields as needed
}

interface ClassSelectionStepProps {
  onNext: () => void;
  onBack: () => void;
}

interface ClassDisplayProps {
  characterClass: ExtendedCharacterClass;
  isSelected: boolean;
  onSelect: () => void;
}

const ClassDisplay: React.FC<ClassDisplayProps> = ({ characterClass, isSelected, onSelect }) => {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className={`class-card ${isSelected ? 'selected' : ''}`}>
      <div className="class-header" onClick={onSelect}>
        <div className="class-name-container">
          <h3 className={styles.className}>{characterClass.name}</h3>
          <span className="hit-die">Hit Die: d{characterClass.hit_dice}</span>
        </div>
        <button 
          type="button"
          className="details-toggle"
          onClick={(e) => {
            e.stopPropagation();
            setShowDetails(!showDetails);
          }}
        >
          {showDetails ? 'Hide Details' : 'Show Details'}
        </button>
      </div>
      
      <div className="class-summary">
        <p className={styles.classDescription}>{characterClass.description}</p>
        <div className="class-basics">
          <div className="primary-abilities">
            <strong>Primary Abilities:</strong> {characterClass.primary_abilities.join(', ')}
          </div>
          <div className="saving-throws">
            <strong>Saving Throw Proficiencies:</strong> {characterClass.saving_throw_proficiencies.join(', ')}
          </div>
        </div>
      </div>

      {showDetails && (
        <div className="class-details">
          <div className="proficiencies-section">
            <div className="proficiency-group">
              <h4>Skill Proficiencies</h4>
              <p>Choose {characterClass.skill_proficiencies.choose} from: {characterClass.skill_proficiencies.available.join(', ')}</p>
            </div>
            
            {characterClass.armor_proficiencies.length > 0 && (
              <div className="proficiency-group">
                <h4>Armor Proficiencies</h4>
                <p>{characterClass.armor_proficiencies.join(', ')}</p>
              </div>
            )}
            
            <div className="proficiency-group">
              <h4>Weapon Proficiencies</h4>
              <p>{characterClass.weapon_proficiencies.join(', ')}</p>
            </div>

            {characterClass.tool_proficiencies.length > 0 && (
              <div className="proficiency-group">
                <h4>Tool Proficiencies</h4>
                <p>{characterClass.tool_proficiencies.join(', ')}</p>
              </div>
            )}
          </div>

          {characterClass.spellcasting && (
            <div className="spellcasting-section">
              <h4>Spellcasting</h4>
              <p><strong>Spellcasting Ability:</strong> {characterClass.spellcasting.ability}</p>
              <p><strong>Ritual Casting:</strong> {characterClass.spellcasting.ritual_casting ? 'Yes' : 'No'}</p>
              {characterClass.spellcasting.spellcasting_focus && (
                <p><strong>Spellcasting Focus:</strong> {characterClass.spellcasting.spellcasting_focus}</p>
              )}
            </div>
          )}

          <div className="features-preview">
            <h4>Level 1 Features</h4>
            {characterClass.features
              .filter(feature => feature.level === 1)
              .map((feature, index) => (
                <div key={index} className="feature-preview">
                  <h5>{feature.name}</h5>
                  <p>{feature.description}</p>
                  {feature.usage && (
                    <p className="feature-usage">
                      <strong>Usage:</strong> {feature.usage.amount} per {feature.usage.type.replace('_', ' ')}
                    </p>
                  )}
                </div>
              ))}
          </div>

          <div className="subclasses-preview">
            <h4>Available {characterClass.name === 'Wizard' ? 'Schools' : 'Archetypes'} (Level {characterClass.archetype_level})</h4>
            <div className="subclasses-grid">
              {characterClass.subclasses.map((subclass, index) => (
                <div key={index} className="subclass-preview">
                  <h5>{subclass.name}</h5>
                  <p>{subclass.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface SubclassSelectionProps {
  characterClass: ExtendedCharacterClass;
  selectedSubclass: string | null;
  onSubclassSelect: (subclass: string) => void;
}

const SubclassSelection: React.FC<SubclassSelectionProps> = ({ 
  characterClass, 
  selectedSubclass, 
  onSubclassSelect 
}) => {
  const [showSubclassDetails, setShowSubclassDetails] = useState<string | null>(null);

  return (
    <div className="subclass-selection">
      <h3>Choose your {characterClass.name === 'Wizard' ? 'Arcane Tradition' : 'Archetype'}</h3>
      <p className="subclass-description">
        At level {characterClass.archetype_level}, you must choose a specialization that defines your character's advanced abilities.
      </p>

      <div className="subclasses-list">
        {characterClass.subclasses.map((subclass, index) => (
          <div key={index} className={`subclass-card ${selectedSubclass === subclass.name ? 'selected' : ''}`}>
            <div className="subclass-header">
              <div className="subclass-info" onClick={() => onSubclassSelect(subclass.name)}>
                <h4>{subclass.name}</h4>
                <span className="subclass-source">Source: {subclass.source}</span>
              </div>
              <button 
                type="button"
                className="details-toggle"
                onClick={() => setShowSubclassDetails(showSubclassDetails === subclass.name ? null : subclass.name)}
              >
                {showSubclassDetails === subclass.name ? 'Hide' : 'Show'} Features
              </button>
            </div>
            
            <p className="subclass-description">{subclass.description}</p>

            {showSubclassDetails === subclass.name && (
              <div className="subclass-features">
                <h5>Subclass Features</h5>
                {subclass.features.map((feature, featureIndex) => (
                  <div key={featureIndex} className="feature-detail">
                    <div className="feature-header">
                      <span className="feature-name">{feature.name}</span>
                      <span className="feature-level">Level {feature.level}</span>
                    </div>
                    <p className="feature-description">{feature.description}</p>
                    {feature.usage && (
                      <p className="feature-usage">
                        <strong>Usage:</strong> {feature.usage.amount} per {feature.usage.type.replace('_', ' ')}
                        {feature.usage.scaling && feature.usage.scaling.length > 0 && (
                          <span> (scales at levels: {feature.usage.scaling.map(s => s.level).join(', ')})</span>
                        )}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const ClassSelectionStep: React.FC<ClassSelectionStepProps> = ({ onNext, onBack }) => {
  const { watch, setValue, formState: { errors } } = useFormContext<CharacterFormData>();
  const [availableClasses] = useState<ExtendedCharacterClass[]>(classProgressionService.getAllClasses());
  const [showSubclassSelection, setShowSubclassSelection] = useState(false);

  const selectedClass = watch('character_class');
  const selectedSubclass = watch('subclass');
  const characterLevel = watch('level') || 1;

  useEffect(() => {
    // Show subclass selection if level is high enough and class is selected
    if (selectedClass && characterLevel >= getSelectedClassInfo()?.archetype_level!) {
      setShowSubclassSelection(true);
    } else {
      setShowSubclassSelection(false);
      if (selectedSubclass) {
        setValue('subclass', '');
      }
    }
  }, [selectedClass, characterLevel, setValue, selectedSubclass]);

  const getSelectedClassInfo = (): ExtendedCharacterClass | null => {
    return selectedClass ? classProgressionService.getClass(selectedClass) : null;
  };

  const handleClassSelect = (className: string) => {
    setValue('character_class', className);
    
    // Clear subclass if changing classes
    if (selectedSubclass) {
      setValue('subclass', '');
    }

    // Auto-set primary ability scores as suggested values if not already set
    const characterClass = classProgressionService.getClass(className);
    if (characterClass) {
      const currentAbilityScores = watch('ability_scores') || {};
      const hasSetScores = Object.values(currentAbilityScores).some(score => typeof score === 'number' && score > 0);
      
      if (!hasSetScores) {
        // Suggest focusing on primary abilities
        const suggestedScores = { ...currentAbilityScores };
        characterClass.primary_abilities.forEach(ability => {
          suggestedScores[ability] = 15; // Suggested high value
        });
        setValue('ability_scores', suggestedScores);
      }
    }
  };

  const handleSubclassSelect = (subclassName: string) => {
    setValue('subclass', subclassName);
  };

  const canProceed = (): boolean => {
    if (!selectedClass) return false;
    
    const classInfo = getSelectedClassInfo();
    if (!classInfo) return false;

    // If character level requires subclass selection, ensure one is selected
    if (characterLevel >= classInfo.archetype_level && !selectedSubclass) {
      return false;
    }

    return true;
  };

  const selectedClassInfo = getSelectedClassInfo();

  return (
    <div className="class-selection-step">
      <div className="step-header">
        <h2>Choose Your Class</h2>
        <p>Your class determines your character's primary abilities, proficiencies, and special features.</p>
      </div>

      {!showSubclassSelection ? (
        <div className="classes-selection">
          <div className="classes-grid">
            {availableClasses.map((characterClass, index) => (
              <ClassDisplay
                key={index}
                characterClass={characterClass}
                isSelected={selectedClass === characterClass.name}
                onSelect={() => handleClassSelect(characterClass.name)}
              />
            ))}
          </div>

          {selectedClassInfo && (
            <div className="selected-class-summary">
              <h3>Selected: {selectedClassInfo.name}</h3>
              <div className="class-benefits">
                <div className="benefit-item">
                  <strong>Hit Points:</strong> {selectedClassInfo.hit_dice} + CON modifier per level
                </div>
                <div className="benefit-item">
                  <strong>Proficiency Bonus:</strong> +{classProgressionService.getProficiencyBonus(characterLevel)}
                </div>
                {selectedClassInfo.spellcasting && (
                  <div className="benefit-item">
                    <strong>Spellcasting:</strong> Uses {selectedClassInfo.spellcasting.ability}
                  </div>
                )}
              </div>
            </div>
          )}

          {errors.character_class && (
            <div className="error-message">
              Please select a class before proceeding.
            </div>
          )}
        </div>
      ) : (
        selectedClassInfo && (
          <SubclassSelection
            characterClass={selectedClassInfo}
            selectedSubclass={selectedSubclass}
            onSubclassSelect={handleSubclassSelect}
          />
        )
      )}

      <div className="step-navigation">
        <button type="button" onClick={onBack} className="btn btn-secondary">
          Back
        </button>
        
        {showSubclassSelection && selectedClassInfo && (
          <button 
            type="button" 
            onClick={() => setShowSubclassSelection(false)}
            className="btn btn-secondary"
          >
            Back to Classes
          </button>
        )}
        
        <button 
          type="button" 
          onClick={onNext} 
          disabled={!canProceed()}
          className="btn btn-primary"
        >
          Next: {showSubclassSelection ? 'Continue' : 'Ability Scores'}
        </button>
      </div>
    </div>
  );
};

export default ClassSelectionStep;