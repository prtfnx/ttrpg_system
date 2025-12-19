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
    <div className={isSelected ? styles.classCardSelected : styles.classCard}>
      <div className={styles.classHeader} onClick={onSelect}>
        <div className={styles.classNameContainer}>
          <h3 className={styles.className}>{characterClass.name}</h3>
          <span className={styles.hitDie}>Hit Die: d{characterClass.hit_dice}</span>
        </div>
        <button 
          type="button"
          className={styles.detailsToggle}
          onClick={(e) => {
            e.stopPropagation();
            setShowDetails(!showDetails);
          }}
        >
          {showDetails ? 'Hide Details' : 'Show Details'}
        </button>
      </div>
      
      <div className={styles.classSummary}>
        <p className={styles.classDescription}>{characterClass.description}</p>
        <div className={styles.classBasics}>
          <div className={styles.primaryAbilities}>
            <strong>Primary Abilities:</strong> {characterClass.primary_abilities.join(', ')}
          </div>
          <div className={styles.savingThrows}>
            <strong>Saving Throw Proficiencies:</strong> {characterClass.saving_throw_proficiencies.join(', ')}
          </div>
        </div>
      </div>

      {showDetails && (
        <div className={styles.classDetails}>
          <div className={styles.proficienciesSection}>
            <div className={styles.proficiencyGroup}>
              <h4>Skill Proficiencies</h4>
              <p>Choose {characterClass.skill_proficiencies.choose} from: {characterClass.skill_proficiencies.available.join(', ')}</p>
            </div>
            
            {characterClass.armor_proficiencies.length > 0 && (
              <div className={styles.proficiencyGroup}>
                <h4>Armor Proficiencies</h4>
                <p>{characterClass.armor_proficiencies.join(', ')}</p>
              </div>
            )}
            
            <div className={styles.proficiencyGroup}>
              <h4>Weapon Proficiencies</h4>
              <p>{characterClass.weapon_proficiencies.join(', ')}</p>
            </div>

            {characterClass.tool_proficiencies.length > 0 && (
              <div className={styles.proficiencyGroup}>
                <h4>Tool Proficiencies</h4>
                <p>{characterClass.tool_proficiencies.join(', ')}</p>
              </div>
            )}
          </div>

          {characterClass.spellcasting && (
            <div className={styles.spellcastingSection}>
              <h4>Spellcasting</h4>
              <p><strong>Spellcasting Ability:</strong> {characterClass.spellcasting.ability}</p>
              <p><strong>Ritual Casting:</strong> {characterClass.spellcasting.ritual_casting ? 'Yes' : 'No'}</p>
              {characterClass.spellcasting.spellcasting_focus && (
                <p><strong>Spellcasting Focus:</strong> {characterClass.spellcasting.spellcasting_focus}</p>
              )}
            </div>
          )}

          <div className={styles.featuresPreview}>
            <h4>Level 1 Features</h4>
            {characterClass.features
              .filter(feature => feature.level === 1)
              .map((feature, index) => (
                <div key={index} className={styles.featurePreview}>
                  <h5>{feature.name}</h5>
                  <p>{feature.description}</p>
                  {feature.usage && (
                    <p className={styles.featureUsage}>
                      <strong>Usage:</strong> {feature.usage.amount} per {feature.usage.type.replace('_', ' ')}
                    </p>
                  )}
                </div>
              ))}
          </div>

          <div className={styles.subclassesPreview}>
            <h4>Available {characterClass.name === 'Wizard' ? 'Schools' : 'Archetypes'} (Level {characterClass.archetype_level})</h4>
            <div className={styles.subclassesGrid}>
              {characterClass.subclasses.map((subclass, index) => (
                <div key={index} className={styles.subclassPreview}>
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
    <div className={styles.subclassSelection}>
      <h3>Choose your {characterClass.name === 'Wizard' ? 'Arcane Tradition' : 'Archetype'}</h3>
      <p className={styles.subclassDescription}>
        At level {characterClass.archetype_level}, you must choose a specialization that defines your character's advanced abilities.
      </p>

      <div className={styles.subclassesList}>
        {characterClass.subclasses.map((subclass, index) => (
          <div key={index} className={selectedSubclass === subclass.name ? styles.subclassCardSelected : styles.subclassCard}>
            <div className={styles.subclassHeader}>
              <div className={styles.subclassInfo} onClick={() => onSubclassSelect(subclass.name)}>
                <h4>{subclass.name}</h4>
                <span className={styles.subclassSource}>Source: {subclass.source}</span>
              </div>
              <button 
                type="button"
                className={styles.detailsToggle}
                onClick={() => setShowSubclassDetails(showSubclassDetails === subclass.name ? null : subclass.name)}
              >
                {showSubclassDetails === subclass.name ? 'Hide' : 'Show'} Features
              </button>
            </div>
            
            <p className={styles.subclassDescription}>{subclass.description}</p>

            {showSubclassDetails === subclass.name && (
              <div className={styles.subclassFeatures}>
                <h5>Subclass Features</h5>
                {subclass.features.map((feature, featureIndex) => (
                  <div key={featureIndex} className={styles.featureDetail}>
                    <div className={styles.featureHeader}>
                      <span className={styles.featureName}>{feature.name}</span>
                      <span className={styles.featureLevel}>Level {feature.level}</span>
                    </div>
                    <p className={styles.featureDescription}>{feature.description}</p>
                    {feature.usage && (
                      <p className={styles.featureUsage}>
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
    <div className={styles.classSelectionStep}>
      <div className={styles.stepHeader}>
        <h2>Choose Your Class</h2>
        <p>Your class determines your character's primary abilities, proficiencies, and special features.</p>
      </div>

      {!showSubclassSelection ? (
        <div className={styles.classesSelection}>
          <div className={styles.classesGrid}>
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
            <div className={styles.selectedClassSummary}>
              <h3>Selected: {selectedClassInfo.name}</h3>
              <div className={styles.classBenefits}>
                <div className={styles.benefitItem}>
                  <strong>Hit Points:</strong> {selectedClassInfo.hit_dice} + CON modifier per level
                </div>
                <div className={styles.benefitItem}>
                  <strong>Proficiency Bonus:</strong> +{classProgressionService.getProficiencyBonus(characterLevel)}
                </div>
                {selectedClassInfo.spellcasting && (
                  <div className={styles.benefitItem}>
                    <strong>Spellcasting:</strong> Uses {selectedClassInfo.spellcasting.ability}
                  </div>
                )}
              </div>
            </div>
          )}

          {errors.character_class && (
            <div className={styles.errorMessage}>
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

      <div className={styles.stepNavigation}>
        <button type="button" onClick={onBack} className={styles.btn}>
          Back
        </button>
        
        {showSubclassSelection && selectedClassInfo && (
          <button 
            type="button" 
            onClick={() => setShowSubclassSelection(false)}
            className={styles.btn}
          >
            Back to Classes
          </button>
        )}
        
        <button 
          type="button" 
          onClick={onNext} 
          disabled={!canProceed()}
          className={styles.btnPrimary}
        >
          Next: {showSubclassSelection ? 'Continue' : 'Ability Scores'}
        </button>
      </div>
    </div>
  );
};

export default ClassSelectionStep;