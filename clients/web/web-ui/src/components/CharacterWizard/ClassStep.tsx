import { useFormContext } from 'react-hook-form';
import type { ClassStepData } from './classSchema';

// Class data with features and details
const classData = {
  'fighter': {
    name: 'Fighter',
    hitDie: 'd10',
    features: ['Fighting Style', 'Second Wind'],
    description: 'A master of martial combat, skilled with a variety of weapons and armor.',
    fightingStyles: ['Defense', 'Dueling', 'Great Weapon Fighting', 'Protection']
  },
  'wizard': {
    name: 'Wizard',
    hitDie: 'd6',
    features: ['Spellcasting', 'Arcane Recovery'],
    description: 'A scholarly magic-user capable of manipulating the structures of spellcasting.'
  },
  'rogue': {
    name: 'Rogue',
    hitDie: 'd8',
    features: ['Expertise', 'Sneak Attack', 'Thieves\' Cant'],
    description: 'A scoundrel who uses stealth and trickery to overcome obstacles.'
  },
  'cleric': {
    name: 'Cleric',
    hitDie: 'd8',
    features: ['Divine Domain', 'Spellcasting'],
    description: 'A priestly champion who wields divine magic in service of a higher power.'
  }
};

export function ClassStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { register, formState, watch } = useFormContext<ClassStepData>();
  const selectedClass = watch('class');
  const selectedFightingStyle = watch('fightingStyle');

  const handleClassNext = () => {
    onNext();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Choose your class</div>
      
      <label>
        Select Class:
        <select 
          {...register('class', { required: 'Class is required' })} 
          style={{ marginLeft: 8, padding: '4px 8px' }}
        >
          <option value="">Select...</option>
          {Object.entries(classData).map(([key, classInfo]) => (
            <option key={key} value={key}>{classInfo.name}</option>
          ))}
        </select>
      </label>
      
      {formState.errors.class && <span style={{ color: 'red' }}>{formState.errors.class.message}</span>}
      
      {/* Display class details when selected */}
      {selectedClass && classData[selectedClass as keyof typeof classData] && (
        <div style={{ 
          marginTop: 16, 
          padding: 16, 
          background: '#f8fafc', 
          borderRadius: 8,
          border: '1px solid #e2e8f0'
        }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1em', color: '#1e293b' }}>
            {classData[selectedClass as keyof typeof classData].name} Features
          </h3>
          
          <div style={{ marginBottom: 8 }}>
            <strong>Hit Die:</strong>{' '}
            <span style={{ color: '#dc2626', fontWeight: 500 }}>
              {classData[selectedClass as keyof typeof classData].hitDie}
            </span>
          </div>
          
          <div style={{ marginBottom: 12 }}>
            <strong>Class Features:</strong>
            <ul style={{ margin: '4px 0 0 0', paddingLeft: 20 }}>
              {classData[selectedClass as keyof typeof classData].features.map((feature, index) => (
                <li key={index} style={{ color: '#374151', fontSize: '0.9em' }}>
                  {feature}
                </li>
              ))}
            </ul>
          </div>
          
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.9em', lineHeight: 1.4 }}>
            {classData[selectedClass as keyof typeof classData].description}
          </p>
        </div>
      )}
      
      {/* Fighting Style selection for Fighter */}
      {selectedClass === 'fighter' && (
        <div style={{ 
          marginTop: 16, 
          padding: 16, 
          background: '#fef3c7', 
          borderRadius: 8,
          border: '1px solid #f59e0b'
        }}>
          <label>
            Fighting Style:
            <select 
              {...register('fightingStyle', { required: selectedClass === 'fighter' ? 'Fighting style is required' : false })}
              style={{ marginLeft: 8, padding: '4px 8px' }}
            >
              <option value="">Select Fighting Style...</option>
              {classData.fighter.fightingStyles?.map((style, index) => (
                <option key={index} value={style.toLowerCase().replace(/\s+/g, '-')}>{style}</option>
              ))}
            </select>
          </label>
          {formState.errors.fightingStyle && (
            <div style={{ color: 'red', fontSize: '0.85em', marginTop: 4 }}>
              Fighting style is required
            </div>
          )}
          
          {selectedFightingStyle && (
            <div style={{ marginTop: 8, fontSize: '0.85em', color: '#92400e' }}>
              <strong>Selected:</strong> {selectedFightingStyle.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
            </div>
          )}
        </div>
      )}
      
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button 
          type="button" 
          onClick={onBack} 
          style={{ 
            background: '#e5e7eb', 
            color: '#374151', 
            border: 'none', 
            borderRadius: 4, 
            padding: '8px 16px',
            cursor: 'pointer'
          }}
        >
          Back
        </button>
        <button 
          type="button" 
          onClick={handleClassNext}
          data-testid="class-next-button"
          disabled={!selectedClass || (selectedClass === 'fighter' && !selectedFightingStyle)}
          style={{ 
            background: (selectedClass && (selectedClass !== 'fighter' || selectedFightingStyle)) ? '#6366f1' : '#9ca3af', 
            color: '#fff', 
            border: 'none', 
            borderRadius: 4, 
            padding: '8px 16px', 
            fontWeight: 600,
            cursor: (selectedClass && (selectedClass !== 'fighter' || selectedFightingStyle)) ? 'pointer' : 'not-allowed'
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
