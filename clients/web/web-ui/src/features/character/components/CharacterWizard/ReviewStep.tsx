
import React from 'react';
import { useFormContext } from 'react-hook-form';
import type { WizardFormData } from './WizardFormData';
import styles from './ReviewStep.module.css';

interface ReviewStepProps {
  data?: WizardFormData;
  onBack?: () => void;
  onConfirm?: () => void;
}

const ReviewStep: React.FC<ReviewStepProps> = () => {
  const { getValues } = useFormContext<WizardFormData>();
  const data = getValues();
  
  return (
    <div className={styles.step}>
      <h3 className={styles.title}>Review Your Character</h3>
      {data.image && (
        <img src={data.image} alt="Character" className={styles.portrait} />
      )}
      <div><b>Name:</b> {data.name}</div>
      {data.bio && <div><b>Bio:</b> {data.bio}</div>}
      <div><b>Race:</b> {data.race}</div>
      <div><b>Class:</b> {data.class}</div>
      <div><b>Background:</b> {data.background}</div>
      <div><b>Abilities:</b></div>
      <ul className={styles['ability-list']}>
        <li>Strength: {data.strength}</li>
        <li>Dexterity: {data.dexterity}</li>
        <li>Constitution: {data.constitution}</li>
        <li>Intelligence: {data.intelligence}</li>
        <li>Wisdom: {data.wisdom}</li>
        <li>Charisma: {data.charisma}</li>
      </ul>
      <div><b>Skills:</b> {Array.isArray(data.skills) ? data.skills.join(', ') : ''}</div>
    </div>
  );
};

export default ReviewStep;
