/**
 * Enhanced Character Creation Wizard with production-ready features
 * - React Portal-based modal management
 * - Comprehensive form validation with Zod schemas
 * - Error boundaries for each step
 * - Loading states and skeleton UI
 * - LocalStorage persistence
 * - Accessibility (ARIA) support
 */

import { zodResolver } from '@hookform/resolvers/zod';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { z } from 'zod';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { AbilitiesStep } from './AbilitiesStep';
import { BackgroundStep } from './BackgroundStep';
import { CharacterAdvancementStep } from './CharacterAdvancementStep';
import { CharacterExportStep } from './CharacterExportStep';
import { ClassStep } from './ClassStep';
import './EnhancedCharacterWizard.css';
import { EquipmentSelectionStep } from './EquipmentSelectionStep';
import { IdentityStep } from './IdentityStep';
import { RaceStep } from './RaceStepImproved';
import ReviewStep from './ReviewStep';
import { SkillsStep } from './SkillsStep';
import { SpellSelectionStep } from './SpellSelectionStep';
import { TemplateSelectionStep } from './TemplateSelectionStep';
import { enhancedWizardSchema, type WizardFormData } from './WizardFormData';

// Step definitions with metadata
interface WizardStep {
  id: string;
  title: string;
  description: string;
  component: React.ComponentType<any>;
  validation?: z.ZodSchema<any>;
  canSkip?: boolean;
  requirements?: string[];
}

const WIZARD_STEPS: WizardStep[] = [
  {
    id: 'template',
    title: 'Template Selection',
    description: 'Choose a template or start from scratch',
    component: TemplateSelectionStep,
    canSkip: true
  },
  {
    id: 'identity',
    title: 'Character Identity',
    description: 'Choose your character\'s name and background',
    component: IdentityStep,
    canSkip: false
  },
  {
    id: 'race',
    title: 'Race Selection',
    description: 'Select your character\'s race from the compendium',
    component: RaceStep,
    canSkip: false,
    requirements: ['Compendium API connection']
  },
  {
    id: 'class',
    title: 'Class Selection',
    description: 'Choose your character\'s class and archetype',
    component: ClassStep,
    canSkip: false
  },
  {
    id: 'abilities',
    title: 'Ability Scores',
    description: 'Assign your character\'s ability scores',
    component: AbilitiesStep,
    canSkip: false
  },
  {
    id: 'background',
    title: 'Background',
    description: 'Select your character\'s background and traits',
    component: BackgroundStep,
    canSkip: false
  },
  {
    id: 'skills',
    title: 'Skills',
    description: 'Choose your character\'s proficient skills',
    component: SkillsStep,
    canSkip: false
  },
  {
    id: 'spells',
    title: 'Spells',
    description: 'Select spells for spellcasting classes',
    component: SpellSelectionStep,
    canSkip: true,
    requirements: ['Spellcasting class selected']
  },
  {
    id: 'equipment',
    title: 'Equipment',
    description: 'Choose your starting equipment and gear',
    component: EquipmentSelectionStep,
    canSkip: false
  },
  {
    id: 'advancement',
    title: 'Advancement',
    description: 'Set initial experience and level progression',
    component: CharacterAdvancementStep,
    canSkip: true
  },
  {
    id: 'review',
    title: 'Review',
    description: 'Review and finalize your character',
    component: ReviewStep,
    canSkip: false
  },
  {
    id: 'export',
    title: 'Export',
    description: 'Export or save your character',
    component: CharacterExportStep,
    canSkip: false
  }
];

// Local storage key for wizard persistence
const WIZARD_STORAGE_KEY = 'characterWizard_draft';

interface EnhancedCharacterWizardProps {
  isOpen: boolean;
  onFinish: (character: WizardFormData) => void;
  onCancel: () => void;
  initialData?: Partial<WizardFormData>;
  className?: string;
}

export const EnhancedCharacterWizard: React.FC<EnhancedCharacterWizardProps> = ({
  isOpen,
  onFinish,
  onCancel,
  initialData,
  className = ''
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [stepErrors, setStepErrors] = useState<Record<number, string>>({});
  const [isInitializing, setIsInitializing] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Form setup with enhanced validation
  const form = useForm<WizardFormData>({
    resolver: zodResolver(enhancedWizardSchema),
    defaultValues: {
      name: '',
      race: '',
      class: '',
      background: '',
      strength: 8,
      dexterity: 8,
      constitution: 8,
      intelligence: 8,
      wisdom: 8,
      charisma: 8,
      skills: [],
      spells: {
        cantrips: [],
        knownSpells: [],
        preparedSpells: []
      },
      equipment: {
        items: [],
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
        carrying_capacity: {
          current_weight: 0,
          max_weight: 0,
          encumbered_at: 0,
          heavily_encumbered_at: 0
        }
      },
      advancement: {
        experiencePoints: 0,
        currentLevel: 1,
        levelHistory: []
      },
      ...initialData
    },
    mode: 'onChange'
  });

  const { reset, getValues, formState } = form;
  
  // DON'T watch fields here - it causes infinite re-renders!
  // Child components will watch what they need via useFormContext

  // Current step data
  const currentStep = WIZARD_STEPS[currentStepIndex];
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === WIZARD_STEPS.length - 1;

  // Load persisted data on mount
  useEffect(() => {
    const loadPersistedData = () => {
      try {
        const stored = localStorage.getItem(WIZARD_STORAGE_KEY);
        if (stored && !initialData) {
          const parsedData = JSON.parse(stored);
          reset(parsedData);
          setHasUnsavedChanges(true);
        }
      } catch (error) {
        console.warn('Failed to load persisted wizard data:', error);
      } finally {
        setIsInitializing(false);
      }
    };

    if (isOpen) {
      loadPersistedData();
    }
  }, [isOpen, reset, initialData]);

  // Persist data to localStorage on changes
  const persistData = useCallback(() => {
    try {
      const currentData = getValues();
      localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(currentData));
    } catch (error) {
      console.warn('Failed to persist wizard data:', error);
    }
  }, [getValues]);

  // Auto-save on data changes (use formState.isDirty to avoid infinite loops)
  useEffect(() => {
    if (!isInitializing && isOpen && formState.isDirty) {
      const timeoutId = setTimeout(() => {
        persistData();
        setHasUnsavedChanges(true);
      }, 1000);

      return () => clearTimeout(timeoutId);
    }
  }, [formState.isDirty, persistData, isInitializing, isOpen]);

  // Check if step can be navigated to
  const canNavigateToStep = useCallback((stepIndex: number): boolean => {
    if (stepIndex <= currentStepIndex) return true; // Can always go back
    if (stepIndex === 0) return true; // Can always go to first step
    
    // Check if previous steps are completed
    for (let i = 0; i < stepIndex; i++) {
      const step = WIZARD_STEPS[i];
      if (!step.canSkip && !completedSteps.has(i)) {
        return false;
      }
    }
    return true;
  }, [currentStepIndex, completedSteps]);

  // Validate current step
  const validateCurrentStep = useCallback(async (): Promise<boolean> => {
    try {
      const currentData = getValues();
      const step = WIZARD_STEPS[currentStepIndex];
      
      if (step.validation) {
        await step.validation.parseAsync(currentData);
      }
      
      // Remove any existing error for this step
      setStepErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[currentStepIndex];
        return newErrors;
      });
      
      return true;
    } catch (error) {
      const errorMessage = error instanceof z.ZodError 
        ? error.errors.map(e => e.message).join(', ')
        : 'Validation failed';
      
      setStepErrors(prev => ({
        ...prev,
        [currentStepIndex]: errorMessage
      }));
      
      return false;
    }
  }, [getValues, currentStepIndex]);

  // Navigation handlers
  const handleNext = useCallback(async () => {
    const isValid = await validateCurrentStep();
    if (!isValid && !currentStep.canSkip) return;

    // Mark step as completed
    setCompletedSteps(prev => new Set([...prev, currentStepIndex]));
    
    if (isLastStep) {
      // Final submission
      try {
        const finalData = getValues();
        await enhancedWizardSchema.parseAsync(finalData);
        
        // Clear persisted data on successful completion
        localStorage.removeItem(WIZARD_STORAGE_KEY);
        onFinish(finalData);
      } catch (error) {
        console.error('Final validation failed:', error);
        setStepErrors(prev => ({
          ...prev,
          [currentStepIndex]: 'Please complete all required fields'
        }));
      }
    } else {
      // Move to next step
      let nextStepIndex = currentStepIndex + 1;
      
      // Skip steps that don't apply
      while (nextStepIndex < WIZARD_STEPS.length) {
        const nextStep = WIZARD_STEPS[nextStepIndex];
        if (shouldShowStep(nextStep, getValues())) break;
        nextStepIndex++;
      }
      
      if (nextStepIndex < WIZARD_STEPS.length) {
        setCurrentStepIndex(nextStepIndex);
      }
    }
  }, [validateCurrentStep, currentStep.canSkip, isLastStep, currentStepIndex, getValues, onFinish]);

  const handlePrevious = useCallback(() => {
    if (!isFirstStep) {
      let prevStepIndex = currentStepIndex - 1;
      
      // Find the previous applicable step
      while (prevStepIndex >= 0) {
        const prevStep = WIZARD_STEPS[prevStepIndex];
        if (shouldShowStep(prevStep, getValues())) break;
        prevStepIndex--;
      }
      
      if (prevStepIndex >= 0) {
        setCurrentStepIndex(prevStepIndex);
      }
    }
  }, [isFirstStep, currentStepIndex, getValues]);

  const handleStepClick = useCallback((stepIndex: number) => {
    if (canNavigateToStep(stepIndex)) {
      setCurrentStepIndex(stepIndex);
    }
  }, [canNavigateToStep]);

  // Determine if step should be shown based on character data
  const shouldShowStep = useCallback((step: WizardStep, data: WizardFormData): boolean => {
    switch (step.id) {
      case 'spells':
        // Only show spells step for spellcasting classes (case-insensitive)
        const spellcastingClasses = ['wizard', 'sorcerer', 'warlock', 'bard', 'cleric', 'druid', 'paladin', 'ranger'];
        return spellcastingClasses.includes(data.class?.toLowerCase() || '');
      case 'advancement':
        // Optional step, always show but allow skipping
        return true;
      default:
        return true;
    }
  }, []);

  // Handle wizard close
  const handleClose = useCallback(() => {
    if (hasUnsavedChanges) {
      const confirmClose = window.confirm(
        'You have unsaved changes. Are you sure you want to close the wizard? Your progress will be saved automatically.'
      );
      if (!confirmClose) return;
    }
    
    onCancel();
  }, [hasUnsavedChanges, onCancel]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;
      
      switch (event.key) {
        case 'Escape':
          handleClose();
          break;
        case 'ArrowLeft':
          if (event.ctrlKey) {
            handlePrevious();
            event.preventDefault();
          }
          break;
        case 'ArrowRight':
          if (event.ctrlKey) {
            handleNext();
            event.preventDefault();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose, handlePrevious, handleNext]);

  // Progress calculation (simplified to avoid infinite loops)
  // Just use current step position as progress, not completed steps filter
  const progress = useMemo(() => {
    return Math.round((currentStepIndex / (WIZARD_STEPS.length - 1)) * 100);
  }, [currentStepIndex]);

  // Render current step component
  const renderCurrentStep = () => {
    const StepComponent = currentStep.component;
    
    console.log('🎭 Rendering step:', {
      index: currentStepIndex,
      id: currentStep.id,
      title: currentStep.title,
      componentName: StepComponent.name
    });
    
    return (
      <ErrorBoundary
        fallback={
          <div className="step-error">
            <h3>⚠️ Step Error</h3>
            <p>There was an error loading this step. Please try refreshing or contact support.</p>
            <button onClick={() => window.location.reload()}>Refresh Page</button>
          </div>
        }
      >
        <StepComponent
          onNext={handleNext}
          onPrevious={handlePrevious}
          // Don't pass watched values - child components access via useFormContext
          {...(currentStep.id === 'equipment' ? {
            onBack: handlePrevious
          } : {})}
        />
      </ErrorBoundary>
    );
  };

  if (!isOpen) return null;

  const modalContent = (
    <div 
      className={`enhanced-wizard-overlay ${className}`}
      role="dialog" 
      aria-modal="true"
      aria-labelledby="wizard-title"
      aria-describedby="wizard-description"
    >
      <div className="enhanced-wizard-modal">
        {isInitializing ? (
          <div className="wizard-initializing">
            <LoadingSpinner size="large" />
            <p>Initializing character wizard...</p>
          </div>
        ) : (
          <FormProvider {...form}>
            {/* Header */}
            <div className="wizard-header">
              <div className="wizard-title-section">
                <h1 id="wizard-title">Character Creation Wizard</h1>
                <p id="wizard-description">Create your D&D 5e character</p>
                <button
                  className="wizard-close"
                  onClick={handleClose}
                  aria-label="Close wizard"
                  type="button"
                >
                  ✕
                </button>
              </div>
              
              {/* Progress Bar */}
              <div className="wizard-progress">
                <div className="progress-bar">
                  <div 
                    className="progress-fill"
                    style={{ width: `${progress}%` }}
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${progress}% complete`}
                  />
                </div>
                <span className="progress-text">{progress}% Complete</span>
              </div>

              {/* Step Navigation */}
              <nav className="wizard-steps" aria-label="Wizard steps">
                {WIZARD_STEPS.map((step, originalIndex) => {
                  // Skip steps that shouldn't be shown
                  if (!shouldShowStep(step, getValues())) {
                    return null;
                  }
                  
                  return (
                    <button
                      key={step.id}
                      className={`step-button ${
                        originalIndex === currentStepIndex ? 'active' : ''
                      } ${
                        completedSteps.has(originalIndex) ? 'completed' : ''
                      } ${
                        !canNavigateToStep(originalIndex) ? 'disabled' : ''
                      }`}
                      onClick={() => handleStepClick(originalIndex)}
                      disabled={!canNavigateToStep(originalIndex)}
                      aria-current={originalIndex === currentStepIndex ? 'step' : undefined}
                      title={step.description}
                    >
                      <span className="step-number">
                        {WIZARD_STEPS.filter((s, i) => i <= originalIndex && shouldShowStep(s, getValues())).length}
                      </span>
                      <span className="step-title">{step.title}</span>
                      {completedSteps.has(originalIndex) && (
                        <span className="step-check" aria-label="Completed">✓</span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Current Step Content */}
            <div className="wizard-content">
              <div className="step-header">
                <h2>{currentStep.title}</h2>
                <p>{currentStep.description}</p>
                {stepErrors[currentStepIndex] && (
                  <div className="step-error-message" role="alert">
                    {stepErrors[currentStepIndex]}
                  </div>
                )}
              </div>
              
              <div className="step-content">
                {renderCurrentStep()}
              </div>
            </div>

            {/* Footer with navigation */}
            <div className="wizard-footer">
              <div className="wizard-actions">
                <button
                  type="button"
                  className="wizard-btn wizard-btn-secondary"
                  onClick={handlePrevious}
                  disabled={isFirstStep}
                >
                  ← Previous
                </button>
                
                <div className="wizard-actions-right">
                  {currentStep.canSkip && (
                    <button
                      type="button"
                      className="wizard-btn wizard-btn-tertiary"
                      onClick={handleNext}
                    >
                      Skip →
                    </button>
                  )}
                  
                  <button
                    type="button"
                    className="wizard-btn wizard-btn-primary"
                    onClick={handleNext}
                  >
                    {isLastStep ? 'Create Character' : 'Next →'}
                  </button>
                </div>
              </div>
              
              {hasUnsavedChanges && (
                <div className="auto-save-indicator">
                  💾 Changes saved automatically
                </div>
              )}
            </div>
          </FormProvider>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default EnhancedCharacterWizard;