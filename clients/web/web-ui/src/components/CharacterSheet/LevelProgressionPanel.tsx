/**
 * Level Progression Panel Component
 * Displays class features available at character's current level
 */

import React, { useEffect, useState } from 'react';
import { createMessage, MessageType } from '../../protocol/message';
import { useProtocol } from '../../services/ProtocolContext';
import styles from './LevelProgressionPanel.module.css';

interface ClassFeature {
  name: string;
  level: number;
  description?: string;
}

interface LevelProgressionPanelProps {
  className: string;
  currentLevel: number;
  subclass?: string;
}

export const LevelProgressionPanel: React.FC<LevelProgressionPanelProps> = ({
  className,
  currentLevel,
  subclass
}) => {
  const { protocol } = useProtocol();
  const [features, setFeatures] = useState<ClassFeature[]>([]);
  const [proficiencyBonus, setProficiencyBonus] = useState(2);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!className || currentLevel < 1 || !protocol) return;

    setIsLoading(true);

    const handleResponse = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { features: featureData, proficiency_bonus } = customEvent.detail;
      
      setFeatures(featureData || []);
      setProficiencyBonus(proficiency_bonus || 2);
      setIsLoading(false);
    };

    window.addEventListener('compendium-class-features-response', handleResponse);

    protocol.sendMessage(createMessage(
      MessageType.COMPENDIUM_GET_CLASS_FEATURES,
      {
        class_name: className,
        level: currentLevel,
        subclass_name: subclass
      }
    ));

    setTimeout(() => {
      window.removeEventListener('compendium-class-features-response', handleResponse);
      if (isLoading) {
        setIsLoading(false);
      }
    }, 5000);

    return () => {
      window.removeEventListener('compendium-class-features-response', handleResponse);
    };
  }, [className, currentLevel, subclass, protocol]);

  if (isLoading) {
    return <div className={styles.loading}>Loading features...</div>;
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>
          {className} {subclass && `(${subclass})`} - Level {currentLevel}
        </h3>
        <div className={styles.profBonus}>
          <span className={styles.profLabel}>Proficiency Bonus</span>
          <span className={styles.profValue}>+{proficiencyBonus}</span>
        </div>
      </div>

      <div className={styles.features}>
        {features.length === 0 ? (
          <p className={styles.empty}>No features unlocked yet</p>
        ) : (
          <div className={styles.featureGrid}>
            {features.map((feature, idx) => (
              <div key={idx} className={styles.feature}>
                <div className={styles.featureHeader}>
                  <span className={styles.featureName}>{feature.name}</span>
                  <span className={styles.featureLevel}>Lv {feature.level}</span>
                </div>
                {feature.description && (
                  <p className={styles.featureDescription}>{feature.description}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
