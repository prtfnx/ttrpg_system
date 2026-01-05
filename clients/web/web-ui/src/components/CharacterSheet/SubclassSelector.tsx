/**
 * Subclass Selector Component
 * Allows selecting a subclass for a character class using WebSocket protocol
 */

import React, { useEffect, useState } from 'react';
import { createMessage, MessageType } from '../../protocol/message';
import { useProtocol } from '../../services/ProtocolContext';
import { showToast } from '../../utils/toast';
import styles from './SubclassSelector.module.css';

interface Subclass {
  name: string;
  description?: string;
  features?: Array<{
    name: string;
    level: number;
    description?: string;
  }>;
}

interface SubclassSelectorProps {
  className: string;
  currentLevel: number;
  selectedSubclass?: string;
  onSelect: (subclassName: string) => void;
}

export const SubclassSelector: React.FC<SubclassSelectorProps> = ({
  className,
  currentLevel,
  selectedSubclass,
  onSelect
}) => {
  const { protocol } = useProtocol();
  const [subclasses, setSubclasses] = useState<Subclass[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedSubclass, setExpandedSubclass] = useState<string | null>(null);

  useEffect(() => {
    if (!className || !protocol) return;
    
    const fetchSubclasses = () => {
      setIsLoading(true);
      
      const handleResponse = (event: Event) => {
        const customEvent = event as CustomEvent;
        const { class_name, subclasses: data } = customEvent.detail;
        
        if (class_name === className) {
          setSubclasses(data || []);
          setIsLoading(false);
        }
      };

      window.addEventListener('compendium-subclasses-response', handleResponse);

      protocol.sendMessage(createMessage(
        MessageType.COMPENDIUM_GET_SUBCLASSES,
        { class_name: className }
      ));

      setTimeout(() => {
        window.removeEventListener('compendium-subclasses-response', handleResponse);
        if (isLoading) {
          setIsLoading(false);
          showToast.error('Failed to load subclasses');
        }
      }, 5000);

      return () => {
        window.removeEventListener('compendium-subclasses-response', handleResponse);
      };
    };

    fetchSubclasses();
  }, [className, protocol]);

  const handleSelect = (subclassName: string) => {
    onSelect(subclassName);
    showToast.success(`Selected ${subclassName}`);
  };

  const toggleExpanded = (subclassName: string) => {
    setExpandedSubclass(expandedSubclass === subclassName ? null : subclassName);
  };

  if (isLoading) {
    return <div className={styles.loading}>Loading subclasses...</div>;
  }

  if (subclasses.length === 0) {
    return <div className={styles.empty}>No subclasses available for {className}</div>;
  }

  return (
    <div className={styles.selector}>
      <h3 className={styles.title}>Choose Your {className} Subclass</h3>
      <div className={styles.subclassList}>
        {subclasses.map((subclass) => (
          <div
            key={subclass.name}
            className={`${styles.subclassCard} ${
              selectedSubclass === subclass.name ? styles.selected : ''
            }`}
          >
            <div className={styles.subclassHeader}>
              <div className={styles.subclassInfo}>
                <h4 className={styles.subclassName}>{subclass.name}</h4>
                {subclass.description && (
                  <p className={styles.subclassDescription}>{subclass.description}</p>
                )}
              </div>
              <div className={styles.subclassActions}>
                <button
                  onClick={() => toggleExpanded(subclass.name)}
                  className={styles.expandBtn}
                  aria-label="Show features"
                >
                  {expandedSubclass === subclass.name ? '▼' : '▶'}
                </button>
                <button
                  onClick={() => handleSelect(subclass.name)}
                  className={styles.selectBtn}
                  disabled={selectedSubclass === subclass.name}
                >
                  {selectedSubclass === subclass.name ? 'Selected' : 'Select'}
                </button>
              </div>
            </div>

            {expandedSubclass === subclass.name && subclass.features && (
              <div className={styles.features}>
                <h5 className={styles.featuresTitle}>Features:</h5>
                <ul className={styles.featureList}>
                  {subclass.features
                    .filter(f => f.level <= currentLevel)
                    .map((feature, idx) => (
                      <li key={idx} className={styles.feature}>
                        <span className={styles.featureName}>{feature.name}</span>
                        <span className={styles.featureLevel}>Level {feature.level}</span>
                        {feature.description && (
                          <p className={styles.featureDescription}>{feature.description}</p>
                        )}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
