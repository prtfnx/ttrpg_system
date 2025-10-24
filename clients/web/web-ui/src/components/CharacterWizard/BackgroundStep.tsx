import { useFormContext } from 'react-hook-form';
import type { BackgroundStepData } from './schemas';

// Background data with skills and tool proficiencies
const backgroundData = {
  'soldier': {
    name: 'Soldier',
    skillProficiencies: ['Athletics', 'Intimidation'],
    toolProficiencies: ['Vehicles (land)', 'Gaming set'],
    languages: ['One of your choice'],
    description: 'You had a military career and are experienced in combat and tactics.'
  },
  'acolyte': {
    name: 'Acolyte',
    skillProficiencies: ['Insight', 'Religion'],
    toolProficiencies: [],
    languages: ['Two of your choice'],
    description: 'You have spent your life in service to a temple and its deity.'
  },
  'criminal': {
    name: 'Criminal',
    skillProficiencies: ['Deception', 'Stealth'],
    toolProficiencies: ['Thieves\' tools', 'Gaming set'],
    languages: [],
    description: 'You are an experienced criminal with a history of breaking the law.'
  },
  'folk-hero': {
    name: 'Folk Hero',
    skillProficiencies: ['Animal Handling', 'Survival'],
    toolProficiencies: ['Artisan\'s tools', 'Vehicles (land)'],
    languages: [],
    description: 'You come from a humble background, but you are destined for so much more.'
  },
  'noble': {
    name: 'Noble',
    skillProficiencies: ['History', 'Persuasion'],
    toolProficiencies: ['Gaming set'],
    languages: ['One of your choice'],
    description: 'You were born into privilege and wealth, with all the advantages that entails.'
  },
  'sage': {
    name: 'Sage',
    skillProficiencies: ['Arcana', 'History'],
    toolProficiencies: [],
    languages: ['Two of your choice'],
    description: 'You spent years learning the lore of the multiverse in libraries and universities.'
  }
};

export function BackgroundStep({ onNext: _onNext, onBack: _onBack }: { onNext?: () => void; onBack?: () => void } = {}) {
  const { register, formState, watch } = useFormContext<BackgroundStepData>();
  const selectedBackground = watch('background');
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Choose background</div>
      
      <label>
        Background:
        <select 
          {...register('background', { required: 'Select a background' })} 
          style={{ marginLeft: 8, padding: '4px 8px' }}
        >
          <option value="">Select...</option>
          {Object.entries(backgroundData).map(([key, bg]) => (
            <option key={key} value={key}>{bg.name}</option>
          ))}
        </select>
      </label>
      
      {formState.errors.background && typeof formState.errors.background === 'object' && 'message' in formState.errors.background && (
        <span style={{ color: 'red' }}>{formState.errors.background.message as string}</span>
      )}
      
      {/* Display background details when selected */}
      {selectedBackground && backgroundData[selectedBackground as keyof typeof backgroundData] && (
        <div style={{ 
          marginTop: 16, 
          padding: 16, 
          background: '#f8fafc', 
          borderRadius: 8,
          border: '1px solid #e2e8f0'
        }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1em', color: '#1e293b' }}>
            {backgroundData[selectedBackground as keyof typeof backgroundData].name} Benefits
          </h3>
          
          <div style={{ marginBottom: 8 }}>
            <strong>Skill Proficiencies:</strong>{' '}
            <span style={{ color: '#059669', fontWeight: 500 }}>
              {backgroundData[selectedBackground as keyof typeof backgroundData].skillProficiencies.join(', ')}
            </span>
          </div>
          
          {backgroundData[selectedBackground as keyof typeof backgroundData].toolProficiencies.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <strong>Tool Proficiencies:</strong>{' '}
              <span style={{ color: '#7c3aed', fontWeight: 500 }}>
                {backgroundData[selectedBackground as keyof typeof backgroundData].toolProficiencies.join(', ')}
              </span>
            </div>
          )}
          
          {backgroundData[selectedBackground as keyof typeof backgroundData].languages.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <strong>Languages:</strong>{' '}
              <span style={{ color: '#0369a1', fontWeight: 500 }}>
                {backgroundData[selectedBackground as keyof typeof backgroundData].languages.join(', ')}
              </span>
            </div>
          )}
          
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.9em', lineHeight: 1.4 }}>
            {backgroundData[selectedBackground as keyof typeof backgroundData].description}
          </p>
        </div>
      )}
    </div>
  );
}
