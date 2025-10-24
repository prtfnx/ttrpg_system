import { useEffect, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import type { SkillsStepData } from './schemas';

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
  
  // TODO: Get from compendium data based on class/background/race
  // For now, use props or provide sensible defaults
  const classSkills = propClassSkills || getClassSkills(characterClass);
  const classSkillChoices = propClassSkillChoices || 2;
  const backgroundSkills = propBackgroundSkills || getBackgroundSkills(background);
  const raceSkills = propRaceSkills || getRaceSkills(race);

  // Compute already granted skills (background + race)
  const alreadyGranted = useMemo(() => [...backgroundSkills, ...raceSkills], [backgroundSkills, raceSkills]);
  // Filter class skills to only those not already granted
  const availableClassSkills = classSkills.filter(skill => !alreadyGranted.includes(skill));

  // Initialize selected state from form value OR default to granted skills
  const [selected, setSelected] = useState<string[]>(() => {
    const existingSkills = formData.skills;
    if (existingSkills && Array.isArray(existingSkills) && existingSkills.length > 0) {
      console.log('[SkillsStep] Initializing from existing form skills:', existingSkills);
      return existingSkills;
    }
    console.log('[SkillsStep] Initializing with granted skills:', alreadyGranted);
    return alreadyGranted;
  });

  // Sync selected skills to form whenever they change
  useEffect(() => {
    console.log('[SkillsStep] Syncing to form:', selected);
    setValue('skills', selected, { shouldValidate: false });
  }, [selected, setValue]);

  // Handle skill selection
  function toggleSkill(skill: string) {
    console.log('[SkillsStep] Toggle skill:', skill, 'currently selected:', selected);
    if (selected.includes(skill)) {
      // Don't allow unselecting background/race skills
      if (alreadyGranted.includes(skill)) {
        console.log('[SkillsStep] Cannot unselect granted skill:', skill);
        return;
      }
      const newSelected = selected.filter(s => s !== skill);
      console.log('[SkillsStep] Removing skill, new selection:', newSelected);
      setSelected(newSelected);
    } else {
      // Only allow selecting from availableClassSkills, up to classSkillChoices
      if (!availableClassSkills.includes(skill)) {
        console.log('[SkillsStep] Skill not available for class:', skill);
        return;
      }
      if (selected.filter(s => availableClassSkills.includes(s)).length >= classSkillChoices) {
        console.log('[SkillsStep] Already selected max class skills');
        return;
      }
      const newSelected = [...selected, skill];
      console.log('[SkillsStep] Adding skill, new selection:', newSelected);
      setSelected(newSelected);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Select Skills</div>
      <div style={{ fontSize: 12, marginBottom: 8 }}>
        Debug: Selected: [{selected.join(', ')}] | Background: [{backgroundSkills.join(', ')}] | 
        Available Class: [{availableClassSkills.join(', ')}] | Need: {classSkillChoices}
      </div>
      <div style={{ marginBottom: 8 }}>
        <b>Background Skills:</b> {backgroundSkills.join(', ') || 'None'}
      </div>
      {raceSkills.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <b>Racial Skills:</b> {raceSkills.join(', ')}
        </div>
      )}
      <div style={{ marginBottom: 8 }}>
        <b>Class Skills:</b> Choose {classSkillChoices} from: {availableClassSkills.length > 0 ? availableClassSkills.join(', ') : '(All granted by background/race)'}
        <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }} title="If a class skill is already granted by your background or race, you may pick a replacement from the remaining class skills.">[?]</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {SKILLS.map(skill => {
          const isBackground = backgroundSkills.includes(skill);
          const isRace = raceSkills.includes(skill);
          const isClass = availableClassSkills.includes(skill);
          const checked = selected.includes(skill);
          return (
            <label key={skill} style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: isClass || isBackground || isRace ? 1 : 0.5 }}>
              <input
                type="checkbox"
                checked={checked}
                disabled={isBackground || isRace || (!isClass && !isBackground && !isRace)}
                onChange={() => toggleSkill(skill)}
              />
              {skill}
              {isBackground && <span style={{ fontSize: 10, color: '#6366f1' }}>(Background)</span>}
              {isRace && <span style={{ fontSize: 10, color: '#059669' }}>(Race)</span>}
              {!isClass && !isBackground && !isRace && <span style={{ fontSize: 10, color: '#aaa' }}>(Unavailable)</span>}
            </label>
          );
        })}
      </div>
      {formState.errors.skills && (
        <span style={{ color: 'red' }}>{formState.errors.skills.message as string}</span>
      )}
    </div>
  );
}
