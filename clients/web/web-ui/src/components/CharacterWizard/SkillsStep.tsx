import { useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';

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

// Example: classSkills and backgroundSkills would come from previous steps or compendium
type SkillsStepProps = {
  onNext: () => void;
  onBack: () => void;
  classSkills: string[]; // e.g. ['Athletics', 'Intimidation', ...]
  classSkillChoices: number; // e.g. 2 for Fighter
  backgroundSkills: string[]; // e.g. ['Insight', 'Religion']
  raceSkills?: string[]; // e.g. ['Perception']
};

export function SkillsStep({ onNext, onBack, classSkills, classSkillChoices, backgroundSkills, raceSkills = [] }: SkillsStepProps) {
  const { setValue, formState, setError, clearErrors } = useFormContext<any>();
  const [selected, setSelected] = useState<string[]>([]);

  // Compute already granted skills (background + race)
  const alreadyGranted = [...backgroundSkills, ...raceSkills];
  // Filter class skills to only those not already granted
  const availableClassSkills = classSkills.filter(skill => !alreadyGranted.includes(skill));

  // Pre-select background and race skills
  useEffect(() => {
    setSelected(alreadyGranted);
  }, [backgroundSkills, raceSkills]);

  // Handle skill selection
  function toggleSkill(skill: string) {
    if (selected.includes(skill)) {
      // Don't allow unselecting background/race skills
      if (alreadyGranted.includes(skill)) return;
      setSelected(selected.filter(s => s !== skill));
    } else {
      // Only allow selecting from availableClassSkills, up to classSkillChoices
      if (!availableClassSkills.includes(skill)) return;
      if (selected.filter(s => availableClassSkills.includes(s)).length >= classSkillChoices) return;
      setSelected([...selected, skill]);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Validate: must have all background/race skills, and exactly classSkillChoices from availableClassSkills
    const classSelected = selected.filter(s => availableClassSkills.includes(s));
    if (classSelected.length !== classSkillChoices) {
      setError('skills', { type: 'manual', message: `Select ${classSkillChoices} class skills (excluding those already granted by background or race).` });
      return;
    }
    // No duplicates
    if (new Set(selected).size !== selected.length) {
      setError('skills', { type: 'manual', message: 'No duplicate skills.' });
      return;
    }
    clearErrors('skills');
    setValue('skills', selected, { shouldValidate: true });
    onNext();
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Select Skills</div>
      <div style={{ marginBottom: 8 }}>
        <b>Background Skills:</b> {backgroundSkills.join(', ')}
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
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onBack} style={{ background: '#eee', color: '#333', border: 'none', borderRadius: 4, padding: '8px 16px' }}>Back</button>
        <button type="submit" style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', fontWeight: 600 }}>Next</button>
      </div>
    </form>
  );
}
