

import React from 'react';
import type { WizardFormData } from './WizardFormData';

interface ReviewStepProps {
  data: WizardFormData;
  onBack: () => void;
  onConfirm: () => void;
  onOpenCombat?: () => void;
}

const ReviewStep: React.FC<ReviewStepProps> = ({ data, onBack, onConfirm, onOpenCombat }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h3 style={{ marginBottom: 8 }}>Review Your Character</h3>
      {data.image && (
        <img src={data.image} alt="Character" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #ccc' }} />
      )}
      <div><b>Name:</b> {data.name}</div>
      {data.bio && <div><b>Bio:</b> {data.bio}</div>}
      <div><b>Race:</b> {data.race}</div>
      <div><b>Class:</b> {data.class}</div>
      <div><b>Background:</b> {data.background}</div>
      <div><b>Abilities:</b></div>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        <li>Strength: {data.strength}</li>
        <li>Dexterity: {data.dexterity}</li>
        <li>Constitution: {data.constitution}</li>
        <li>Intelligence: {data.intelligence}</li>
        <li>Wisdom: {data.wisdom}</li>
        <li>Charisma: {data.charisma}</li>
      </ul>
      <div><b>Skills:</b> {Array.isArray(data.skills) ? data.skills.join(', ') : ''}</div>
      
      {/* Combat Preview Section */}
      <div style={{ 
        marginTop: 16, 
        padding: 16, 
        background: 'linear-gradient(135deg, rgba(139, 0, 0, 0.1), rgba(165, 42, 42, 0.05))',
        border: '2px solid #8B0000',
        borderRadius: 8 
      }}>
        <h4 style={{ margin: '0 0 8px 0', color: '#8B0000' }}>Combat Preview</h4>
        <p style={{ margin: '0 0 12px 0', fontSize: '0.9em', color: '#666' }}>
          Test your character's combat abilities, spells, and attacks before finalizing.
        </p>
        {onOpenCombat && (
          <button 
            onClick={onOpenCombat}
            style={{ 
              background: 'linear-gradient(135deg, #8B0000, #A52A2A)',
              color: '#fff', 
              border: 'none', 
              borderRadius: 4, 
              padding: '8px 16px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            🎯 Open Combat Manager
          </button>
        )}
      </div>
      
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button onClick={onBack} style={{ background: '#eee', color: '#333', border: 'none', borderRadius: 4, padding: '8px 16px' }}>Back</button>
        <button onClick={onConfirm} style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', fontWeight: 600 }}>Confirm</button>
      </div>
    </div>
  );
};

export default ReviewStep;
