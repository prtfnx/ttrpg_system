import React, { useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import type { Feat, FeatChoice } from '../services/featSelection.service';
import { featSelectionService } from '../services/featSelection.service';
import styles from './FeatSelectionStep.module.css';

// Character form data interface
interface CharacterFormData {
  character_class: string;
  subclass: string;
  level: number;
  race: string;
  ability_scores: Record<string, number>;
  feats: string[];
  feat_choices: FeatChoice[];
}

interface FeatSelectionStepProps {
  onNext: () => void;
  onBack: () => void;
}

interface FeatDisplayProps {
  feat: Feat;
  isSelected: boolean;
  onSelect: () => void;
  characterAbilityScores: Record<string, number>;
  characterClass: string;
}

const FeatDisplay: React.FC<FeatDisplayProps> = ({ 
  feat, 
  isSelected, 
  onSelect, 
  characterAbilityScores, 
  characterClass 
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

  const analysis = featSelectionService.analyzeFeatVsASI(feat, characterAbilityScores, characterClass);

  return (
    <div className={`feat-card ${isSelected ? 'selected' : ''}`}>
      <div className={styles.featHeader} onClick={onSelect}>
        <div className={styles.featInfo}>
          <h4 className={styles.featName}>{feat.name}</h4>
          <div className={styles.featTags}>
            {feat.tags.map((tag, index) => (
              <span key={index} className={`feat-tag feat-tag-${tag.toLowerCase()}`}>
                {tag}
              </span>
            ))}
            {feat.is_half_feat && (
              <span className="feat-tag feat-tag-half">Half Feat</span>
            )}
          </div>
          <span className={styles.featSource}>Source: {feat.source}</span>
        </div>
        <div className={styles.featControls}>
          <button
            type="button"
            className={styles.detailsToggle}
            onClick={(e) => {
              e.stopPropagation();
              setShowDetails(!showDetails);
            }}
          >
            {showDetails ? 'Hide' : 'Show'} Details
          </button>
        </div>
      </div>

      <p className={styles.featDescription}>{feat.description}</p>

      {feat.prerequisites.length > 0 && (
        <div className={styles.featPrerequisites}>
          <h5>Prerequisites:</h5>
          <ul>
            {feat.prerequisites.map((prereq, index) => (
              <li key={index}>{prereq.description}</li>
            ))}
          </ul>
        </div>
      )}

      {showDetails && (
        <div className={styles.featDetails}>
          <div className={styles.featBenefits}>
            <h5>Benefits:</h5>
            <ul>
              {feat.benefits.map((benefit, index) => (
                <li key={index} className={`benefit-${benefit.type}`}>
                  <strong>{benefit.type.replace('_', ' ').toUpperCase()}:</strong> {benefit.description}
                  {benefit.choices && (
                    <div className={styles.benefitChoices}>
                      Choose from: {benefit.choices.join(', ')}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.featAnalysis}>
            <button
              type="button"
              className={styles.analysisToggle}
              onClick={() => setShowAnalysis(!showAnalysis)}
            >
              {showAnalysis ? 'Hide' : 'Show'} Feat vs ASI Analysis
            </button>

            {showAnalysis && (
              <div className={styles.analysisContent}>
                <div className={styles.recommendation}>
                  <h6>Recommendation: <span className={`rec-${analysis.recommendation}`}>
                    {analysis.recommendation === 'feat' ? 'Take This Feat' : 
                     analysis.recommendation === 'asi' ? 'Take ASI Instead' : 'Either Option'}
                  </span></h6>
                  <p className={styles.reasoning}>{analysis.reasoning}</p>
                </div>
                
                <div className={styles.comparison}>
                  <div className={styles.comparisonColumn}>
                    <h6>Feat Benefits:</h6>
                    <ul>
                      {analysis.featBenefits.map((benefit, index) => (
                        <li key={index}>{benefit}</li>
                      ))}
                    </ul>
                  </div>
                  
                  <div className={styles.comparisonColumn}>
                    <h6>ASI Benefits:</h6>
                    <ul>
                      {analysis.asiBenefits.map((benefit, index) => (
                        <li key={index}>{benefit}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface ASISelectionProps {
  currentScores: Record<string, number>;
  onASIChange: (improvements: Record<string, number>) => void;
  availablePoints: number;
}

const ASISelection: React.FC<ASISelectionProps> = ({ currentScores, onASIChange, availablePoints }) => {
  const [improvements, setImprovements] = useState<Record<string, number>>({});
  const abilities = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'];

  useEffect(() => {
    onASIChange(improvements);
  }, [improvements, onASIChange]);

  const handleImprovement = (ability: string, change: number) => {
    const newImprovements = { ...improvements };
    const current = newImprovements[ability] || 0;
    const newValue = Math.max(0, current + change);
    
    // Check if we have enough points
    const totalUsed = Object.values(newImprovements).reduce((sum, val) => sum + val, 0) - current + newValue;
    if (totalUsed <= availablePoints && newValue <= 1 && (currentScores[ability] || 10) + newValue <= 20) {
      newImprovements[ability] = newValue;
      if (newValue === 0) {
        delete newImprovements[ability];
      }
      setImprovements(newImprovements);
    }
  };

  const usedPoints = Object.values(improvements).reduce((sum, val) => sum + val, 0);

  return (
    <div className={styles.asiSelection}>
      <h3>Ability Score Improvement</h3>
      <p className={styles.asiDescription}>
        You can increase your ability scores. You have {availablePoints} points to distribute, 
        with a maximum of 1 point per ability score.
      </p>
      
      <div className={styles.pointsDisplay}>
        <span className={styles.pointsUsed}>{usedPoints}</span> / <span className={styles.pointsTotal}>{availablePoints}</span> points used
      </div>

      <div className={styles.abilitiesGrid}>
        {abilities.map(ability => {
          const currentScore = currentScores[ability] || 10;
          const improvement = improvements[ability] || 0;
          const newScore = currentScore + improvement;
          const currentModifier = Math.floor((currentScore - 10) / 2);
          const newModifier = Math.floor((newScore - 10) / 2);
          const modifierChange = newModifier - currentModifier;

          return (
            <div key={ability} className={styles.abilityImprovement}>
              <h4 className={styles.abilityName}>{ability}</h4>
              <div className={styles.abilityScores}>
                <div className={styles.currentScore}>
                  Current: {currentScore} ({currentModifier >= 0 ? '+' : ''}{currentModifier})
                </div>
                {improvement > 0 && (
                  <div className={styles.newScore}>
                    New: {newScore} ({newModifier >= 0 ? '+' : ''}{newModifier})
                    {modifierChange > 0 && (
                      <span className={styles.modifierIncrease}> (+{modifierChange} modifier!)</span>
                    )}
                  </div>
                )}
              </div>
              
              <div className={styles.improvementControls}>
                <button
                  type="button"
                  className={styles.improvementBtn}
                  onClick={() => handleImprovement(ability, -1)}
                  disabled={improvement === 0}
                >
                  -
                </button>
                <span className={styles.improvementValue}>{improvement}</span>
                <button
                  type="button"
                  className={styles.improvementBtn}
                  onClick={() => handleImprovement(ability, 1)}
                  disabled={
                    usedPoints >= availablePoints || 
                    improvement >= 1 || 
                    newScore >= 20
                  }
                >
                  +
                </button>
              </div>

              {newScore >= 20 && (
                <div className={styles.abilityWarning}>Maximum ability score reached</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const FeatSelectionStep: React.FC<FeatSelectionStepProps> = ({ onNext, onBack }) => {
  const { watch, setValue, formState: { errors } } = useFormContext<CharacterFormData>();
  
  const characterClass = watch('character_class') || '';
  const characterLevel = watch('level') || 1;
  const race = watch('race') || '';
  const abilityScores = watch('ability_scores') || {};
  const existingFeats = watch('feats') || [];
  const featChoices = watch('feat_choices') || [];

  const [selectionType, setSelectionType] = useState<'asi' | 'feat' | null>(null);
  const [selectedFeat, setSelectedFeat] = useState<string | null>(null);
  const [asiImprovements, setASIImprovements] = useState<Record<string, number>>({});
  const [featFilter, setFeatFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Check if character gets ASI/feat at current level
  const hasASIChoice = featSelectionService.hasASIChoiceAtLevel(characterClass, characterLevel);
  const availableFeats = featSelectionService.getAvailableFeats(
    characterLevel,
    characterClass,
    race,
    abilityScores,
    existingFeats,
    ['Wizard', 'Sorcerer', 'Cleric', 'Bard', 'Druid', 'Warlock'].includes(characterClass)
  );

  // Filter feats based on search and filter
  const filteredFeats = availableFeats.filter(feat => {
    const matchesSearch = searchTerm === '' || 
      feat.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      feat.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = featFilter === 'all' || feat.tags.includes(featFilter);
    
    return matchesSearch && matchesFilter;
  });

  // Get feat recommendations
  const recommendations = featSelectionService.getFeatRecommendations(
    characterClass,
    abilityScores,
    race,
    featFilter === 'all' ? 'combat' : featFilter as any
  );

  useEffect(() => {
    // Load existing choice if any
    const existingChoice = featChoices.find(choice => 
      choice.level === characterLevel && choice.character_class === characterClass
    );
    
    if (existingChoice) {
      setSelectionType(existingChoice.selected_type || null);
      if (existingChoice.selected_feat) {
        setSelectedFeat(existingChoice.selected_feat);
      }
      if (existingChoice.asi_improvements) {
        setASIImprovements(existingChoice.asi_improvements);
      }
    }
  }, [characterLevel, characterClass, featChoices]);

  const handleSelectionTypeChange = (type: 'asi' | 'feat') => {
    setSelectionType(type);
    if (type === 'asi') {
      setSelectedFeat(null);
    } else {
      setASIImprovements({});
    }
  };

  const handleFeatSelect = (featName: string) => {
    setSelectedFeat(selectedFeat === featName ? null : featName);
  };

  const handleASIChange = (improvements: Record<string, number>) => {
    setASIImprovements(improvements);
  };

  const canProceed = (): boolean => {
    if (!hasASIChoice) return true; // No choice needed at this level
    
    if (selectionType === 'feat') {
      return selectedFeat !== null;
    }
    
    if (selectionType === 'asi') {
      const totalPoints = Object.values(asiImprovements).reduce((sum, val) => sum + val, 0);
      return totalPoints === 2; // Must use all ASI points
    }
    
    return false;
  };

  const handleNext = () => {
    if (hasASIChoice) {
      const newFeatChoice: FeatChoice = {
        level: characterLevel,
        character_class: characterClass,
        choice_type: 'both',
        selected_type: selectionType!,
        selected_feat: selectedFeat || undefined,
        asi_improvements: Object.keys(asiImprovements).length > 0 ? asiImprovements : undefined
      };

      // Update feat choices
      const updatedFeatChoices = featChoices.filter(choice => 
        !(choice.level === characterLevel && choice.character_class === characterClass)
      );
      updatedFeatChoices.push(newFeatChoice);
      setValue('feat_choices', updatedFeatChoices);

      // Update feats list if feat was selected
      if (selectedFeat) {
        const updatedFeats = [...existingFeats];
        if (!updatedFeats.includes(selectedFeat)) {
          updatedFeats.push(selectedFeat);
        }
        setValue('feats', updatedFeats);
      }

      // Update ability scores if ASI was selected
      if (selectionType === 'asi') {
        const updatedScores = { ...abilityScores };
        for (const [ability, improvement] of Object.entries(asiImprovements)) {
          updatedScores[ability] = (updatedScores[ability] || 10) + improvement;
        }
        setValue('ability_scores', updatedScores);
      }
    }

    onNext();
  };

  if (!hasASIChoice) {
    return (
      <div className={styles.featSelectionStep}>
        <div className={styles.stepHeader}>
          <h2>Feat Selection</h2>
          <p>Your character doesn't receive an Ability Score Improvement or feat at level {characterLevel}.</p>
        </div>

        <div className={styles.stepNavigation}>
          <button type="button" onClick={onBack} className="btn btn-secondary">
            Back
          </button>
          <button type="button" onClick={onNext} className="btn btn-primary">
            Next: Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.featSelectionStep}>
      <div className={styles.stepHeader}>
        <h2>Ability Score Improvement or Feat</h2>
        <p>At level {characterLevel}, you can choose to either increase your ability scores or take a feat.</p>
      </div>

      <div className={styles.choiceSelector}>
        <button
          type="button"
          className={`choice-btn ${selectionType === 'asi' ? 'selected' : ''}`}
          onClick={() => handleSelectionTypeChange('asi')}
        >
          Ability Score Improvement
        </button>
        <button
          type="button"
          className={`choice-btn ${selectionType === 'feat' ? 'selected' : ''}`}
          onClick={() => handleSelectionTypeChange('feat')}
        >
          Take a Feat
        </button>
      </div>

      {selectionType === 'asi' && (
        <ASISelection
          currentScores={abilityScores}
          onASIChange={handleASIChange}
          availablePoints={2}
        />
      )}

      {selectionType === 'feat' && (
        <div className={styles.featSelection}>
          <div className={styles.featFilters}>
            <div className={styles.searchContainer}>
              <input
                type="text"
                placeholder="Search feats..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={styles.featSearch}
              />
            </div>
            
            <select
              value={featFilter}
              onChange={(e) => setFeatFilter(e.target.value)}
              className={styles.featFilter}
            >
              <option value="all">All Feats</option>
              <option value="Combat">Combat</option>
              <option value="Magic">Magic</option>
              <option value="Utility">Utility</option>
              <option value="Social">Social</option>
            </select>
          </div>

          {recommendations.length > 0 && (
            <div className={styles.featRecommendations}>
              <h3>Recommended Feats</h3>
              <div className={styles.featsGrid}>
                {recommendations.slice(0, 3).map((feat, index) => (
                  <FeatDisplay
                    key={index}
                    feat={feat}
                    isSelected={selectedFeat === feat.name}
                    onSelect={() => handleFeatSelect(feat.name)}
                    characterAbilityScores={abilityScores}
                    characterClass={characterClass}
                  />
                ))}
              </div>
            </div>
          )}

          <div className={styles.allFeats}>
            <h3>All Available Feats ({filteredFeats.length})</h3>
            <div className={styles.featsGrid}>
              {filteredFeats.map((feat, index) => (
                <FeatDisplay
                  key={index}
                  feat={feat}
                  isSelected={selectedFeat === feat.name}
                  onSelect={() => handleFeatSelect(feat.name)}
                  characterAbilityScores={abilityScores}
                  characterClass={characterClass}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {errors.feat_choices && (
        <div className={styles.errorMessage}>
          Please make a selection before proceeding.
        </div>
      )}

      <div className={styles.stepNavigation}>
        <button type="button" onClick={onBack} className="btn btn-secondary">
          Back
        </button>
        <button 
          type="button" 
          onClick={handleNext}
          disabled={!canProceed()}
          className="btn btn-primary"
        >
          Next: Continue
        </button>
      </div>
    </div>
  );
};

export default FeatSelectionStep;
