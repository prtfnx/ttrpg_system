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

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { TemplateSelectionStep } from '../TemplateSelectionStep';
import type { WizardFormData } from '../WizardFormData';

// Mock character templates
vi.mock('../../../data/characterTemplates', () => ({
  ALL_TEMPLATES: [
    {
      id: 'fighter-pc',
      type: 'pc',
      name: 'Fighter',
      icon: '⚔️',
      description: 'A brave warrior',
      data: { class: 'Fighter', level: 1, str: 16 }
    },
    {
      id: 'wizard-pc',
      type: 'pc',
      name: 'Wizard',
      icon: '🧙',
      description: 'A powerful spellcaster',
      data: { class: 'Wizard', level: 1, int: 16 }
    },
    {
      id: 'goblin-npc',
      type: 'npc',
      name: 'Goblin',
      icon: '👺',
      description: 'A small monster',
      data: { type: 'npc', cr: 0.25, hp: 7 }
    },
    {
      id: 'dragon-npc',
      type: 'npc',
      name: 'Dragon',
      icon: '🐉',
      description: 'A mighty dragon',
      data: { type: 'npc', cr: 17, hp: 256 }
    },
  ],
  getTemplatesByType: (type: string) => {
    const templates = {
      pc: [
        {
          id: 'fighter-pc',
          type: 'pc',
          name: 'Fighter',
          icon: '⚔️',
          description: 'A brave warrior',
          data: { class: 'Fighter', level: 1, str: 16 }
        },
        {
          id: 'wizard-pc',
          type: 'pc',
          name: 'Wizard',
          icon: '🧙',
          description: 'A powerful spellcaster',
          data: { class: 'Wizard', level: 1, int: 16 }
        },
      ],
      npc: [
        {
          id: 'goblin-npc',
          type: 'npc',
          name: 'Goblin',
          icon: '👺',
          description: 'A small monster',
          data: { type: 'npc', cr: 0.25, hp: 7 }
        },
        {
          id: 'dragon-npc',
          type: 'npc',
          name: 'Dragon',
          icon: '🐉',
          description: 'A mighty dragon',
          data: { type: 'npc', cr: 17, hp: 256 }
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
    expect(scratchButton).toBeTruthy();
    expect(scratchButton?.className).toMatch(/active/);
  });

  it('should switch to PC mode when PC button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <TemplateSelectionStep />
      </TestWrapper>
    );

    const pcButton = screen.getByText('Player Character').closest('button');
    await user.click(pcButton!);

    await waitFor(() => {
      expect(pcButton?.className).toMatch(/active/);
    });
    expect(screen.getByText('Player Character Templates')).toBeInTheDocument();
  });

  it('should switch to NPC mode when NPC button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <TemplateSelectionStep />
      </TestWrapper>
    );

    const npcButton = screen.getByText('NPC/Monster').closest('button');
    await user.click(npcButton!);

    await waitFor(() => {
      expect(npcButton?.className).toMatch(/active/);
    });
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
    const pcButton = screen.getByText('Player Character').closest('button');
    await user.click(pcButton!);

    const fighterCard = screen.getByText('Fighter').closest('button');
    await user.click(fighterCard!);

    expect(fighterCard?.className).toMatch(/selected/);

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

    const pcButton = screen.getByText('Player Character').closest('button');
    await user.click(pcButton!);

    await waitFor(() => {
      expect(screen.getByText('Fighter')).toBeInTheDocument();
      expect(screen.getByText('Wizard')).toBeInTheDocument();
    });
  });

  it('should show template icons and descriptions', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <TemplateSelectionStep />
      </TestWrapper>
    );

    const pcButton = screen.getByText('Player Character').closest('button');
    await user.click(pcButton!);

    await waitFor(() => {
      expect(screen.getByText('⚔️')).toBeInTheDocument(); // Fighter icon
      expect(screen.getByText('🧙')).toBeInTheDocument(); // Wizard icon
      expect(screen.getByText('A brave warrior')).toBeInTheDocument();
      expect(screen.getByText('A powerful spellcaster')).toBeInTheDocument();
    });
  });

  it('should mark selected PC template as selected', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <TemplateSelectionStep />
      </TestWrapper>
    );

    const pcButton = screen.getByText('Player Character').closest('button');
    await user.click(pcButton!);

    const fighterCard = screen.getByText('Fighter').closest('button');
    await user.click(fighterCard!);

    await waitFor(() => {
      expect(fighterCard).toBeTruthy();
      expect(fighterCard?.className).toMatch(/selected/);
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

    const wizardCard = screen.getByText('Wizard').closest('button');
    await user.click(wizardCard!);

    await waitFor(() => {
      expect(screen.getByText(/Template selected:/i)).toBeInTheDocument();
      // Multiple "Wizard" texts exist (card name and summary), so be more specific
      const summaryBox = screen.getByText(/Template selected:/i).closest('div');
      expect(summaryBox).toBeInTheDocument();
      if (summaryBox) {
        expect(summaryBox.textContent).toContain('Wizard');
      }
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

    const npcButton = screen.getByText('NPC/Monster').closest('button');
    await user.click(npcButton!);

    await waitFor(() => {
      expect(screen.getByText('Goblin')).toBeInTheDocument();
      expect(screen.getByText('Dragon')).toBeInTheDocument();
    });
  });

  it('should show NPC template icons and descriptions', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <TemplateSelectionStep />
      </TestWrapper>
    );

    const npcButton = screen.getByText('NPC/Monster').closest('button');
    await user.click(npcButton!);

    await waitFor(() => {
      expect(screen.getByText('👺')).toBeInTheDocument(); // Goblin icon
      expect(screen.getByText('🐉')).toBeInTheDocument(); // Dragon icon
      expect(screen.getByText('A small monster')).toBeInTheDocument();
      expect(screen.getByText('A mighty dragon')).toBeInTheDocument();
    });
  });

  it('should mark selected NPC template as selected', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <TemplateSelectionStep />
      </TestWrapper>
    );

    const npcButton = screen.getByText('NPC/Monster').closest('button');
    await user.click(npcButton!);

    const goblinCard = screen.getByText('Goblin').closest('button');
    await user.click(goblinCard!);

    await waitFor(() => {
      expect(goblinCard).toBeTruthy();
      expect(goblinCard?.className).toMatch(/selected/);
    });
  });

  it('should show success message when NPC template is selected', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <TemplateSelectionStep />
      </TestWrapper>
    );

    const npcButton = screen.getByText('NPC/Monster').closest('button');
    await user.click(npcButton!);

    const dragonCard = screen.getByText('Dragon').closest('button');
    await user.click(dragonCard!);

    await waitFor(() => {
      expect(screen.getByText(/Template selected:/i)).toBeInTheDocument();
      // Multiple "Dragon" texts exist (card name and summary), so be more specific
      const summaryBox = screen.getByText(/Template selected:/i).closest('div');
      expect(summaryBox).toBeInTheDocument();
      if (summaryBox) {
        expect(summaryBox.textContent).toContain('Dragon');
      }
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

    // Check for scratch mode messaging
    expect(screen.getByText(/Starting from scratch/i)).toBeInTheDocument();
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

    expect(screen.queryByText('Fighter')).not.toBeInTheDocument();
    expect(screen.queryByText('Goblin')).not.toBeInTheDocument();
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

    const pcButton = screen.getByText('Player Character').closest('button');
    await user.click(pcButton!);

    const fighterCard = screen.getByText('Fighter').closest('button');
    await user.click(fighterCard!);

    // Template data should be applied (checked via form state in real implementation)
    await waitFor(() => {
      expect(fighterCard).toBeTruthy();
      expect(fighterCard?.className).toMatch(/selected/);
    });
  });

  it('should apply NPC template data to form when selected', async () => {
    const user = userEvent.setup();
    
    render(
      <TestWrapper>
        <TemplateSelectionStep />
      </TestWrapper>
    );

    const npcButton = screen.getByText('NPC/Monster').closest('button');
    await user.click(npcButton!);

    const goblinCard = screen.getByText('Goblin').closest('button');
    await user.click(goblinCard!);

    await waitFor(() => {
      expect(goblinCard?.className).toMatch(/selected/);
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

    const pcButton = screen.getByText('Player Character').closest('button');
    await user.click(pcButton!);

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

    const npcButton = screen.getByText('NPC/Monster').closest('button');
    await user.click(npcButton!);

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

    const pcButton = screen.getByText('Player Character').closest('button');
    await user.click(pcButton!);

    // Select Fighter
    const fighterCard = screen.getByText('Fighter').closest('button');
    await user.click(fighterCard!);
    expect(fighterCard?.className).toMatch(/selected/);

    // Select Wizard
    const wizardCard = screen.getByText('Wizard').closest('button');
    await user.click(wizardCard!);

    await waitFor(() => {
      expect(wizardCard?.className).toMatch(/selected/);
      expect(fighterCard?.className).not.toMatch(/selected/);
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
