import { useEffect, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useClass, useBackgrounds } from '../../../compendium/hooks/useCompendium';
import type { SkillsStepData } from './schemas';
import styles from './SkillsStep.module.css';

// D&D 5e skills
const SKILLS = [
  'Acrobatics',
  'Animal Handling',
  'Arcana',
  'Athletics',
  'Deception',
  'History',
  'Insight',
  'Intimidation',
  'Investigation',
  'Medicine',
  'Nature',
  'Perception',
  'Performance',
  'Persuasion',
  'Religion',
  'Sleight of Hand',
  'Stealth',
  'Survival',
];

// Helper functions to get skills from class/background/race
// TODO: Replace with compendium data
function getClassSkills(className: string): string[] {
  const classSkillMap: Record<string, string[]> = {
    barbarian: ['Animal Handling', 'Athletics', 'Intimidation', 'Nature', 'Perception', 'Survival'],
    bard: SKILLS, // All skills
    cleric: ['History', 'Insight', 'Medicine', 'Persuasion', 'Religion'],
    druid: ['Arcana', 'Animal Handling', 'Insight', 'Medicine', 'Nature', 'Perception', 'Religion', 'Survival'],
    fighter: ['Acrobatics', 'Animal Handling', 'Athletics', 'History', 'Insight', 'Intimidation', 'Perception', 'Survival'],
    monk: ['Acrobatics', 'Athletics', 'History', 'Insight', 'Religion', 'Stealth'],
    paladin: ['Athletics', 'Insight', 'Intimidation', 'Medicine', 'Persuasion', 'Religion'],
    ranger: ['Animal Handling', 'Athletics', 'Insight', 'Investigation', 'Nature', 'Perception', 'Stealth', 'Survival'],
    rogue: ['Acrobatics', 'Athletics', 'Deception', 'Insight', 'Intimidation', 'Investigation', 'Perception', 'Performance', 'Persuasion', 'Sleight of Hand', 'Stealth'],
    sorcerer: ['Arcana', 'Deception', 'Insight', 'Intimidation', 'Persuasion', 'Religion'],
    warlock: ['Arcana', 'Deception', 'History', 'Intimidation', 'Investigation', 'Nature', 'Religion'],
    wizard: ['Arcana', 'History', 'Insight', 'Investigation', 'Medicine', 'Religion']
  };
  return classSkillMap[className.toLowerCase()] || [];
}

function getBackgroundSkills(background: string): string[] {
  const backgroundSkillMap: Record<string, string[]> = {
    acolyte: ['Insight', 'Religion'],
    charlatan: ['Deception', 'Sleight of Hand'],
    criminal: ['Deception', 'Stealth'],
    entertainer: ['Acrobatics', 'Performance'],
    folk_hero: ['Animal Handling', 'Survival'],
    guild_artisan: ['Insight', 'Persuasion'],
    hermit: ['Medicine', 'Religion'],
    noble: ['History', 'Persuasion'],
    outlander: ['Athletics', 'Survival'],
    sage: ['Arcana', 'History'],
    sailor: ['Athletics', 'Perception'],
    soldier: ['Athletics', 'Intimidation'],
    urchin: ['Sleight of Hand', 'Stealth']
  };
  return backgroundSkillMap[background.toLowerCase()] || [];
}

function getRaceSkills(race: string): string[] {
  const raceSkillMap: Record<string, string[]> = {
    half_elf: ['Persuasion'], // Can choose 2 skills from any
    human: [], // Variant human gets 1 skill
    elf: ['Perception']
  };
  return raceSkillMap[race.toLowerCase()] || [];
}

// Example: classSkills and backgroundSkills would come from previous steps or compendium
type SkillsStepProps = {
  onNext: () => void;
  onBack?: () => void;
  onPrevious?: () => void;
  classSkills?: string[]; // e.g. ['Athletics', 'Intimidation', ...]
  classSkillChoices?: number; // e.g. 2 for Fighter
  backgroundSkills?: string[]; // e.g. ['Insight', 'Religion']
  raceSkills?: string[]; // e.g. ['Perception']
};

export function SkillsStep({ 
  onNext: _onNext, 
  onBack: _onBack, 
  onPrevious: _onPrevious,
  classSkills: propClassSkills, 
  classSkillChoices: propClassSkillChoices, 
  backgroundSkills: propBackgroundSkills, 
  raceSkills: propRaceSkills 
}: SkillsStepProps) {
  const { setValue, formState, setError: _setError, clearErrors: _clearErrors, getValues } = useFormContext<SkillsStepData>();
  
  // Get data from form context if not provided as props
  const formData = getValues() as any; // Cast to any to access other form fields
  const characterClass = formData.class || 'fighter';
  const background = formData.background || 'acolyte';
  const race = formData.race || 'human';
  
  // Fetch compendium data — used as primary source, hardcoded maps as fallback
  const { data: compendiumClass } = useClass(characterClass || null);
  const { data: allBackgrounds } = useBackgrounds();

  const compendiumBackground = useMemo(
    () => allBackgrounds?.find(b => b.name.toLowerCase() === background.toLowerCase()),
    [allBackgrounds, background]
  );

  const classSkills = propClassSkills
    || compendiumClass?.skill_proficiencies
    || getClassSkills(characterClass);
  const classSkillChoices = propClassSkillChoices
    || compendiumClass?.num_skills
    || 2;
  const backgroundSkills = propBackgroundSkills
    || compendiumBackground?.skill_proficiencies
    || getBackgroundSkills(background);

  const raceSkills = propRaceSkills || getRaceSkills(race);
  const alreadyGranted = [...backgroundSkills, ...raceSkills];
  const availableClassSkills = classSkills.filter(s => !alreadyGranted.includes(s));

  // Initialize selected state from form value OR default to granted skills
  const [selected, setSelected] = useState<string[]>(() => {
    const existingSkills = formData.skills;
    if (existingSkills && Array.isArray(existingSkills) && existingSkills.length > 0) {
      return existingSkills;
    }
    return alreadyGranted;
  });

  // Sync selected skills to form whenever they change
  useEffect(() => {
    setValue('skills', selected, { shouldValidate: false });
  }, [selected, setValue]);

  // Handle skill selection
  function toggleSkill(skill: string) {
    if (selected.includes(skill)) {
      // Don't allow unselecting background/race skills
      if (alreadyGranted.includes(skill)) {
        return;
      }
      const newSelected = selected.filter(s => s !== skill);
      setSelected(newSelected);
    } else {
      // Only allow selecting from availableClassSkills, up to classSkillChoices
      if (!availableClassSkills.includes(skill)) {
        return;
      }
      if (selected.filter(s => availableClassSkills.includes(s)).length >= classSkillChoices) {
        return;
      }
      const newSelected = [...selected, skill];
      setSelected(newSelected);
    }
  }

  // Determine if the user has selected the required number of class skills
  const selectedClassSkills = selected.filter(s => availableClassSkills.includes(s));
  const canSubmit = selectedClassSkills.length === classSkillChoices;

  return (
    <div className={styles.container}>
      <div className={styles.title}>Select Skills</div>
      <div className={styles.debugInfo}>
        Debug: Selected: [{selected.join(', ')}] | Background: [{backgroundSkills.join(', ')}] |
        Available Class: [{availableClassSkills.join(', ')}] | Need: {classSkillChoices}
      </div>
      <div className={styles.infoLine}>
        <b>Background Skills:</b> {backgroundSkills.join(', ') || 'None'}
      </div>
      {raceSkills.length > 0 && (
        <div className={styles.infoLine}>
          <b>Racial Skills:</b> {raceSkills.join(', ')}
        </div>
      )}
      <div className={styles.infoLine}>
        <b>Class Skills:</b> Choose {classSkillChoices} from: {availableClassSkills.length > 0 ? availableClassSkills.join(', ') : '(All granted by background/race)'}
        <span className={styles.helpTip} title="If a class skill is already granted by your background or race, you may pick a replacement from the remaining class skills.">[?]</span>
      </div>
      <div className={styles.skillGrid}>
        {SKILLS.map(skill => {
          const isBackground = backgroundSkills.includes(skill);
          const isRace = raceSkills.includes(skill);
          const isClass = availableClassSkills.includes(skill);
          const checked = selected.includes(skill);
          return (
            <label key={skill} className={`${styles.skillLabel} ${!isClass && !isBackground && !isRace ? styles.skillLabelDisabled : ''}`}>
              <input
                type="checkbox"
                checked={checked}
                disabled={isBackground || isRace || (!isClass && !isBackground && !isRace)}
                onChange={() => toggleSkill(skill)}
              />
              {skill}
              {isBackground && <span className={styles.backgroundBadge}>(Background)</span>}
              {isRace && <span className={styles.raceBadge}>(Race)</span>}
              {!isClass && !isBackground && !isRace && <span className={styles.unavailableBadge}>(Unavailable)</span>}
            </label>
          );
        })}
      </div>
      {formState.errors.skills && (
        <span className={styles.errorText}>{formState.errors.skills.message as string}</span>
      )}
      <button
        type="button"
        data-testid="skills-next-button"
        disabled={!canSubmit}
        className={styles.nextBtn}
        onClick={_onNext}
      >
        Next
      </button>
    </div>
  );
}
