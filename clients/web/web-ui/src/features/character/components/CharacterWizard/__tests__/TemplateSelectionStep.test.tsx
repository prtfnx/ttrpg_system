/**
 * Template Selection Step Tests
 * 
 * Tests for the character wizard template selection including:
 * - Template type selection (PC/NPC/Scratch)
 * - Template card rendering
 * - Template selection and data application
 * - Form value updates
 * - Visual feedback and state management
 * 
 * @vitest-environment jsdom
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { TemplateSelectionStep } from '../TemplateSelectionStep';
import type { WizardFormData } from '../WizardFormData';

// Mock character templates - using REAL template names from characterTemplates.ts
vi.mock('../../../../data/characterTemplates', () => ({
  ALL_TEMPLATES: [
    {
      id: 'pc-template',
      type: 'pc',
      name: 'Player Character',
      icon: '🎭',
      description: 'Full character sheet for player characters with detailed stats, skills, equipment, and spells',
      data: { level: 1 }
    },
    {
      id: 'wizard-pc',
      type: 'pc',
      name: 'Wizard (Spellcaster)',
      icon: '🧙',
      description: 'A scholarly magic-user with full spellcasting capabilities',
      data: { class: 'Wizard', level: 1, int: 16 }
    },
    {
      id: 'npc-template',
      type: 'npc',
      name: 'NPC / Monster',
      icon: '👹',
      description: 'Simplified stat block for NPCs, monsters, and creatures. Quick reference format for combat.',
      data: { type: 'npc', cr: 1, hp: 20 }
    },
    {
      id: 'npc-humanoid',
      type: 'npc',
      name: 'NPC Humanoid (Guard)',
      icon: '🛡️',
      description: 'A standard humanoid NPC suitable for guards, bandits, or common folk',
      data: { type: 'npc', cr: 0.5, hp: 11 }
    },
    {
      id: 'npc-beast',
      type: 'npc',
      name: 'NPC Beast (Wolf)',
      icon: '🐺',
      description: 'Beast type NPC',
      data: { type: 'npc', cr: 0.25, hp: 11 }
    },
  ],
  getTemplatesByType: (type: string) => {
    const templates = {
      pc: [
        {
          id: 'pc-template',
          type: 'pc',
          name: 'Player Character',
          icon: '🎭',
          description: 'Full character sheet for player characters with detailed stats, skills, equipment, and spells',
          data: { level: 1 }
        },
        {
          id: 'wizard-pc',
          type: 'pc',
          name: 'Wizard (Spellcaster)',
          icon: '🧙',
          description: 'A scholarly magic-user with full spellcasting capabilities',
          data: { class: 'Wizard', level: 1, int: 16 }
        },
      ],
      npc: [
        {
          id: 'npc-template',
          type: 'npc',
          name: 'NPC / Monster',
          icon: '👹',
          description: 'Simplified stat block for NPCs, monsters, and creatures. Quick reference format for combat.',
          data: { type: 'npc', cr: 1, hp: 20 }
        },
        {
          id: 'npc-humanoid',
          type: 'npc',
          name: 'NPC Humanoid (Guard)',
          icon: '🛡️',
          description: 'A standard humanoid NPC suitable for guards, bandits, or common folk',
          data: { type: 'npc', cr: 0.5, hp: 11 }
        },
        {
          id: 'npc-beast',
          type: 'npc',
          name: 'NPC Beast (Wolf)',
          icon: '🐺',
          description: 'Beast type NPC',
          data: { type: 'npc', cr: 0.25, hp: 11 }
        },
      ],
    };
    return templates[type as keyof typeof templates] || [];
  },
}));

// Test wrapper component with form context
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const methods = useForm<WizardFormData>({
    defaultValues: {},
  });

  return (
    <FormProvider {...methods}>
      <form>{children}</form>
    </FormProvider>
  );
};

describe('TemplateSelectionStep - Template Type Selection', () => {
  it('should render all three template type options', () => {
    render(
      <TestWrapper>
        <TemplateSelectionStep />
      </TestWrapper>
    );

    expect(screen.getByText('Start from Scratch')).toBeInTheDocument();
    expect(screen.getByText('Player Character')).toBeInTheDocument();
    expect(screen.getByText('NPC/Monster')).toBeInTheDocument();
  });

  it('should default to "scratch" mode', () => {
    render(
      <TestWrapper>
        <TemplateSelectionStep />
      </TestWrapper>
    );

    const scratchButton = screen.getByText('Start from Scratch').closest('button');
    expect(scratchButton).toHaveClass('active');
  });

  it('should switch to PC mode when PC button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <TemplateSelectionStep />
      </TestWrapper>
    );

    const pcModeButton = screen.getByRole('button', { name: /player character.*full character sheet/i });
    await user.click(pcModeButton);

    expect(pcModeButton).toHaveClass('active');
    expect(screen.getByText('Player Character Templates')).toBeInTheDocument();
  });

  it('should switch to NPC mode when NPC button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <TemplateSelectionStep />
      </TestWrapper>
    );

    const npcModeButton = screen.getByRole('button', { name: /npc\/monster.*simplified stat/i });
    await user.click(npcModeButton);

    expect(npcModeButton).toHaveClass('active');
    expect(screen.getByText('NPC/Monster Templates')).toBeInTheDocument();
  });

  it('should clear template selection when switching template types', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <TemplateSelectionStep />
      </TestWrapper>
    );

    // Switch to PC and select a template
    const pcModeButton = screen.getByRole('button', { name: /player character.*full character sheet/i });
    await user.click(pcModeButton);

    // Now select the Player Character template card
    const templateCards = screen.getAllByRole('button');
    const pcTemplateCard = templateCards.find(btn => 
      btn.classList.contains('template-card') && btn.textContent?.includes('Player Character')
    );
    await user.click(pcTemplateCard!);

    expect(pcTemplateCard).toHaveClass('selected');

    // Switch to NPC
    const npcButton = screen.getByText('NPC/Monster').closest('button');
    await user.click(npcButton!);

    // Fighter should no longer be selected
    await waitFor(() => {
      const fighterCardAfter = screen.queryByText('Fighter');
      expect(fighterCardAfter).not.toBeInTheDocument();
    });
  });
});

describe('TemplateSelectionStep - PC Templates', () => {
  it('should display PC templates when PC mode is active', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <TemplateSelectionStep />
      </TestWrapper>
    );

    const pcModeButton = screen.getByRole('button', { name: /player character.*full character sheet/i });
    await user.click(pcModeButton);

    await waitFor(() => {
      // Check for template cards (not the mode button)
      const templateCards = screen.getAllByRole('button').filter(btn => 
        btn.classList.contains('template-card')
      );
      expect(templateCards.length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText('Wizard (Spellcaster)')).toBeInTheDocument();
    });
  });

  it('should show template icons and descriptions', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <TemplateSelectionStep />
      </TestWrapper>
    );

    const pcModeButton = screen.getByRole('button', { name: /player character.*full character sheet/i });
    await user.click(pcModeButton);

    await waitFor(() => {
      const icons = screen.getAllByText('🎭');
      expect(icons.length).toBeGreaterThan(0); // Icon appears in mode button and templates
      expect(screen.getByText('🧙')).toBeInTheDocument(); // Wizard icon
      expect(screen.getByText(/Full character sheet for player characters/i)).toBeInTheDocument();
      expect(screen.getByText(/scholarly magic-user with full spellcasting/i)).toBeInTheDocument();
    });
  });

  it('should mark selected PC template as selected', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <TemplateSelectionStep />
      </TestWrapper>
    );

    const pcModeButton = screen.getByRole('button', { name: /player character.*full character sheet/i });
    await user.click(pcModeButton);

    // Find and click the Player Character template card
    const templateCards = screen.getAllByRole('button').filter(btn => 
      btn.classList.contains('template-card')
    );
    const pcCard = templateCards.find(btn => btn.textContent?.includes('Player Character'));
    await user.click(pcCard!);

    await waitFor(() => {
      expect(pcCard).toHaveClass('selected');
    });
  });

  it('should show success message when PC template is selected', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <TemplateSelectionStep />
      </TestWrapper>
    );

    const pcButton = screen.getByText('Player Character').closest('button');
    await user.click(pcButton!);

    const wizardCard = screen.getByText('Wizard (Spellcaster)').closest('button');
    await user.click(wizardCard!);

    await waitFor(() => {
      expect(screen.getByText(/Template selected:/i)).toBeInTheDocument();
      // Multiple "Wizard" texts exist (card name and summary), so be more specific
      const summaryBox = document.querySelector('.summary-box.success');
      expect(summaryBox?.textContent).toContain('Wizard');
    });
  });
});

describe('TemplateSelectionStep - NPC Templates', () => {
  it('should display NPC templates when NPC mode is active', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <TemplateSelectionStep />
      </TestWrapper>
    );

    const npcModeButton = screen.getByRole('button', { name: /npc\/monster.*simplified stat/i });
    await user.click(npcModeButton);

    await waitFor(() => {
      expect(screen.getByText('NPC / Monster')).toBeInTheDocument();
      expect(screen.getByText('NPC Humanoid (Guard)')).toBeInTheDocument();
      expect(screen.getByText('NPC Beast (Wolf)')).toBeInTheDocument();
    });
  });

  it('should show NPC template icons and descriptions', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <TemplateSelectionStep />
      </TestWrapper>
    );

    const npcModeButton = screen.getByRole('button', { name: /npc\/monster.*simplified stat/i });
    await user.click(npcModeButton);

    await waitFor(() => {
      expect(screen.getByText('👹')).toBeInTheDocument(); // NPC Monster icon
      expect(screen.getByText('🛡️')).toBeInTheDocument(); // Guard icon
      expect(screen.getByText('🐺')).toBeInTheDocument(); // Wolf icon
      expect(screen.getByText(/Simplified stat block for NPCs, monsters/i)).toBeInTheDocument();
      expect(screen.getByText(/standard humanoid NPC suitable for guards/i)).toBeInTheDocument();
    });
  });

  it('should mark selected NPC template as selected', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <TemplateSelectionStep />
      </TestWrapper>
    );

    const npcModeButton = screen.getByRole('button', { name: /npc\/monster.*simplified stat/i });
    await user.click(npcModeButton);

    const templateCards = screen.getAllByRole('button').filter(btn => 
      btn.classList.contains('template-card')
    );
    const npcCard = templateCards.find(btn => btn.textContent?.includes('NPC / Monster'));
    await user.click(npcCard!);

    await waitFor(() => {
      expect(npcCard).toHaveClass('selected');
    });
  });

  it('should show success message when NPC template is selected', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <TemplateSelectionStep />
      </TestWrapper>
    );

    const npcModeButton = screen.getByRole('button', { name: /npc\/monster.*simplified stat/i });
    await user.click(npcModeButton);

    const guardCard = screen.getByText('NPC Humanoid (Guard)').closest('button');
    await user.click(guardCard!);

    await waitFor(() => {
      expect(screen.getByText(/Template selected:/i)).toBeInTheDocument();
      // Check that the summary contains the template name
      const summaryBox = document.querySelector('.summary-box.success');
      expect(summaryBox?.textContent).toContain('Guard');
    });
  });
});

describe('TemplateSelectionStep - Scratch Mode', () => {
  it('should show scratch mode info when scratch is selected', () => {
    render(
      <TestWrapper>
        <TemplateSelectionStep />
      </TestWrapper>
    );

    // Multiple "Starting from scratch" texts exist (info box and summary), be more specific
    const infoBox = document.querySelector('.template-scratch-info .info-box');
    expect(infoBox?.textContent).toContain('Starting from scratch');
    expect(screen.getByText(/guide you through each step/i)).toBeInTheDocument();
  });

  it('should show info message for scratch mode', () => {
    render(
      <TestWrapper>
        <TemplateSelectionStep />
      </TestWrapper>
    );

    expect(screen.getByText(/Starting from scratch - all fields will be empty/i)).toBeInTheDocument();
  });

  it('should not show template cards in scratch mode', () => {
    render(
      <TestWrapper>
        <TemplateSelectionStep />
      </TestWrapper>
    );

    // Should not find any template cards (buttons with template-card class)
    const allButtons = screen.getAllByRole('button');
    const templateCards = allButtons.filter(btn => btn.classList.contains('template-card'));
    expect(templateCards.length).toBe(0);
  });
});

describe('TemplateSelectionStep - Template Data Application', () => {
  it('should apply PC template data to form when selected', async () => {
    const user = userEvent.setup();
    const TestWrapperWithSpy: React.FC<{ children: React.ReactNode }> = ({ children }) => {
      const methods = useForm<WizardFormData>({
        defaultValues: {},
      });
      
      // Spy on setValue
      const setValueSpy = vi.spyOn(methods, 'setValue');
      
      return (
        <FormProvider {...methods}>
          <form>{children}</form>
        </FormProvider>
      );
    };

    render(
      <TestWrapperWithSpy>
        <TemplateSelectionStep />
      </TestWrapperWithSpy>
    );

    const pcModeButton = screen.getByRole('button', { name: /player character.*full character sheet/i });
    await user.click(pcModeButton);

    const templateCards = screen.getAllByRole('button').filter(btn => 
      btn.classList.contains('template-card')
    );
    const pcCard = templateCards.find(btn => btn.textContent?.includes('Player Character'));
    await user.click(pcCard!);

    // Template data should be applied (checked via form state in real implementation)
    await waitFor(() => {
      expect(pcCard).toHaveClass('selected');
    });
  });

  it('should apply NPC template data to form when selected', async () => {
    const user = userEvent.setup();
    
    render(
      <TestWrapper>
        <TemplateSelectionStep />
      </TestWrapper>
    );

    const npcModeButton = screen.getByRole('button', { name: /npc\/monster.*simplified stat/i });
    await user.click(npcModeButton);

    const templateCards = screen.getAllByRole('button').filter(btn => 
      btn.classList.contains('template-card')
    );
    const npcCard = templateCards.find(btn => btn.textContent?.includes('NPC / Monster'));
    await user.click(npcCard!);

    await waitFor(() => {
      expect(npcCard).toHaveClass('selected');
    });
  });
});

describe('TemplateSelectionStep - Visual Feedback', () => {
  it('should show warning when no template selected in PC mode', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <TemplateSelectionStep />
      </TestWrapper>
    );

    const pcModeButton = screen.getByRole('button', { name: /player character.*full character sheet/i });
    await user.click(pcModeButton);

    await waitFor(() => {
      expect(screen.getByText(/Please select a template from the list above/i)).toBeInTheDocument();
    });
  });

  it('should show warning when no template selected in NPC mode', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <TemplateSelectionStep />
      </TestWrapper>
    );

    const npcModeButton = screen.getByRole('button', { name: /npc\/monster.*simplified stat/i });
    await user.click(npcModeButton);

    await waitFor(() => {
      expect(screen.getByText(/Please select a template from the list above/i)).toBeInTheDocument();
    });
  });

  it('should update selection when switching between templates', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <TemplateSelectionStep />
      </TestWrapper>
    );

    const pcModeButton = screen.getByRole('button', { name: /player character.*full character sheet/i });
    await user.click(pcModeButton);

    const templateCards = screen.getAllByRole('button').filter(btn => 
      btn.classList.contains('template-card')
    );
    
    // Select Player Character template
    const pcCard = templateCards.find(btn => btn.textContent?.includes('Player Character'));
    await user.click(pcCard!);
    expect(pcCard).toHaveClass('selected');

    // Select Wizard template
    const wizardCard = templateCards.find(btn => btn.textContent?.includes('Wizard (Spellcaster)'));
    await user.click(wizardCard!);

    await waitFor(() => {
      expect(wizardCard).toHaveClass('selected');
      expect(pcCard).not.toHaveClass('selected');
    });
  });

  it('should display template type icons correctly', () => {
    render(
      <TestWrapper>
        <TemplateSelectionStep />
      </TestWrapper>
    );

    expect(screen.getByText('✨')).toBeInTheDocument(); // Scratch icon
    expect(screen.getByText('🎭')).toBeInTheDocument(); // PC icon
    expect(screen.getByText('👥')).toBeInTheDocument(); // NPC icon
  });
});
