/**
 * Template Selection Step for Character Wizard
 * Allows users to choose between PC templates, NPC templates, or start from scratch
 */

import React, { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { ALL_TEMPLATES, getTemplatesByType, type CharacterTemplate } from '../../data/characterTemplates';
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
    <div className="template-selection-step">
      <div className="step-header">
        <h3>Choose a Template</h3>
        <p className="step-description">
          Start with a template or create from scratch. Templates pre-fill common character data.
        </p>
      </div>

      {/* Template Type Selector */}
      <div className="template-type-selector">
        <button
          type="button"
          className={`template-type-btn ${templateType === 'scratch' ? 'active' : ''}`}
          onClick={() => handleTemplateTypeChange('scratch')}
        >
          <div className="template-type-icon">✨</div>
          <div className="template-type-info">
            <div className="template-type-title">Start from Scratch</div>
            <div className="template-type-desc">Build your character step by step</div>
          </div>
        </button>

        <button
          type="button"
          className={`template-type-btn ${templateType === 'pc' ? 'active' : ''}`}
          onClick={() => handleTemplateTypeChange('pc')}
        >
          <div className="template-type-icon">🎭</div>
          <div className="template-type-info">
            <div className="template-type-title">Player Character</div>
            <div className="template-type-desc">Full character sheet for PCs</div>
          </div>
        </button>

        <button
          type="button"
          className={`template-type-btn ${templateType === 'npc' ? 'active' : ''}`}
          onClick={() => handleTemplateTypeChange('npc')}
        >
          <div className="template-type-icon">👥</div>
          <div className="template-type-info">
            <div className="template-type-title">NPC/Monster</div>
            <div className="template-type-desc">Simplified stat block for NPCs</div>
          </div>
        </button>
      </div>

      {/* Template List */}
      {templateType === 'pc' && (
        <div className="template-list">
          <h4>Player Character Templates</h4>
          <div className="template-grid">
            {pcTemplates.map(template => (
              <button
                key={template.id}
                type="button"
                className={`template-card ${selectedTemplate === template.id ? 'selected' : ''}`}
                onClick={() => handleTemplateSelect(template)}
              >
                <div className="template-icon">{template.icon}</div>
                <div className="template-name">{template.name}</div>
                <div className="template-description">{template.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {templateType === 'npc' && (
        <div className="template-list">
          <h4>NPC/Monster Templates</h4>
          <div className="template-grid">
            {npcTemplates.map(template => (
              <button
                key={template.id}
                type="button"
                className={`template-card ${selectedTemplate === template.id ? 'selected' : ''}`}
                onClick={() => handleTemplateSelect(template)}
              >
                <div className="template-icon">{template.icon}</div>
                <div className="template-name">{template.name}</div>
                <div className="template-description">{template.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {templateType === 'scratch' && (
        <div className="template-scratch-info">
          <div className="info-box">
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
      <div className="selection-summary">
        {selectedTemplate ? (
          <div className="summary-box success">
            ✅ Template selected: <strong>{ALL_TEMPLATES.find(t => t.id === selectedTemplate)?.name}</strong>
          </div>
        ) : templateType === 'scratch' ? (
          <div className="summary-box info">
            ℹ️ Starting from scratch - all fields will be empty
          </div>
        ) : (
          <div className="summary-box warning">
            ⚠️ Please select a template from the list above
          </div>
        )}
      </div>
    </div>
  );
};

export default TemplateSelectionStep;
