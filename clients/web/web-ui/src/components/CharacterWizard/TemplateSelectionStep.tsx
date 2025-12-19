/**
 * Template Selection Step for Character Wizard
 * Allows users to choose between PC templates, NPC templates, or start from scratch
 */

import clsx from 'clsx';
import React, { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { ALL_TEMPLATES, getTemplatesByType, type CharacterTemplate } from '../../data/characterTemplates';
import styles from './TemplateSelectionStep.module.css';
import type { WizardFormData } from './WizardFormData';

export const TemplateSelectionStep: React.FC = () => {
  const { setValue } = useFormContext<WizardFormData>();
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [templateType, setTemplateType] = useState<'pc' | 'npc' | 'scratch'>('scratch');

  const handleTemplateTypeChange = (type: 'pc' | 'npc' | 'scratch') => {
    setTemplateType(type);
    setSelectedTemplate(null);
  };

  const handleTemplateSelect = (template: CharacterTemplate) => {
    setSelectedTemplate(template.id);
    
    // Apply template data to form
    Object.entries(template.data).forEach(([key, value]) => {
      setValue(key as any, value, { shouldValidate: true });
    });
  };

  const pcTemplates = getTemplatesByType('pc');
  const npcTemplates = getTemplatesByType('npc');

  return (
    <div className={styles.templateSelectionStep}>
      <div className={styles.stepHeader}>
        <h3>Choose a Template</h3>
        <p className={styles.stepDescription}>
          Start with a template or create from scratch. Templates pre-fill common character data.
        </p>
      </div>

      {/* Template Type Selector */}
      <div className={styles.templateTypeSelector}>
        <button
          type="button"
          className={clsx(styles.templateTypeBtn, templateType === 'scratch' && styles.active)}
          onClick={() => handleTemplateTypeChange('scratch')}
        >
          <div className={styles.templateTypeIcon}>✨</div>
          <div className={styles.templateTypeInfo}>
            <div className={styles.templateTypeTitle}>Start from Scratch</div>
            <div className={styles.templateTypeDesc}>Build your character step by step</div>
          </div>
        </button>

        <button
          type="button"
          className={clsx(styles.templateTypeBtn, templateType === 'pc' && styles.active)}
          onClick={() => handleTemplateTypeChange('pc')}
        >
          <div className={styles.templateTypeIcon}>🎭</div>
          <div className={styles.templateTypeInfo}>
            <div className={styles.templateTypeTitle}>Player Character</div>
            <div className={styles.templateTypeDesc}>Full character sheet for PCs</div>
          </div>
        </button>

        <button
          type="button"
          className={clsx(styles.templateTypeBtn, templateType === 'npc' && styles.active)}
          onClick={() => handleTemplateTypeChange('npc')}
        >
          <div className={styles.templateTypeIcon}>👥</div>
          <div className={styles.templateTypeInfo}>
            <div className={styles.templateTypeTitle}>NPC/Monster</div>
            <div className={styles.templateTypeDesc}>Simplified stat block for NPCs</div>
          </div>
        </button>
      </div>

      {/* Template List */}
      {templateType === 'pc' && (
        <div className={styles.templateList}>
          <h4>Player Character Templates</h4>
          <div className={styles.templateGrid}>
            {pcTemplates.map(template => (
              <button
                key={template.id}
                type="button"
                className={clsx(styles.templateCard, selectedTemplate === template.id && styles.selected)}
                onClick={() => handleTemplateSelect(template)}
              >
                <div className={styles.templateIcon}>{template.icon}</div>
                <div className={styles.templateName}>{template.name}</div>
                <div className={styles.templateDescription}>{template.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {templateType === 'npc' && (
        <div className={styles.templateList}>
          <h4>NPC/Monster Templates</h4>
          <div className={styles.templateGrid}>
            {npcTemplates.map(template => (
              <button
                key={template.id}
                type="button"
                className={clsx(styles.templateCard, selectedTemplate === template.id && styles.selected)}
                onClick={() => handleTemplateSelect(template)}
              >
                <div className={styles.templateIcon}>{template.icon}</div>
                <div className={styles.templateName}>{template.name}</div>
                <div className={styles.templateDescription}>{template.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {templateType === 'scratch' && (
        <div className={styles.templateScratchInfo}>
          <div className={styles.infoBox}>
            <p>
              <strong>Starting from scratch</strong> will guide you through each step of character creation
              with empty fields. This gives you complete control but takes more time.
            </p>
            <p>
              You can always switch to a template later or import character data.
            </p>
          </div>
        </div>
      )}

      {/* Selection Summary */}
      <div className={styles.selectionSummary}>
        {selectedTemplate ? (
          <div className={clsx(styles.summaryBox, styles.success)}>
            ✅ Template selected: <strong>{ALL_TEMPLATES.find(t => t.id === selectedTemplate)?.name}</strong>
          </div>
        ) : templateType === 'scratch' ? (
          <div className={clsx(styles.summaryBox, styles.info)}>
            ℹ️ Starting from scratch - all fields will be empty
          </div>
        ) : (
          <div className={clsx(styles.summaryBox, styles.warning)}>
            ⚠️ Please select a template from the list above
          </div>
        )}
      </div>
    </div>
  );
};

export default TemplateSelectionStep;
