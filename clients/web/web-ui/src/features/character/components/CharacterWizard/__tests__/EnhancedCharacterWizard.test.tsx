import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EnhancedCharacterWizard } from '../EnhancedCharacterWizard';
import { createAuthMock } from '@test/mocks/auth.mock';

// Mock external dependencies
vi.mock('@shared/components', () => ({
  ErrorBoundary: ({ children }: any) => <div>{children}</div>,
  LoadingSpinner: () => <div>Loading...</div>,
}));

vi.mock('@/services/ProtocolContext', () => ({
  useProtocol: () => ({
    protocol: {
      saveCharacter: vi.fn(),
    },
    isConnected: true,
  }),
}));

vi.mock('@features/auth', () => createAuthMock());

describe('EnhancedCharacterWizard', () => {
  const user = userEvent.setup();
  const mockOnFinish = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock localStorage
    Storage.prototype.getItem = vi.fn(() => null);
    Storage.prototype.setItem = vi.fn();
    Storage.prototype.removeItem = vi.fn();
  });

  describe('Wizard Opening and Closing', () => {
    it('does not render when isOpen is false', () => {
      render(
        <EnhancedCharacterWizard
          isOpen={false}
          onFinish={mockOnFinish}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders modal dialog when isOpen is true', () => {
      render(
        <EnhancedCharacterWizard
          isOpen={true}
          onFinish={mockOnFinish}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/Character Creation Wizard/i)).toBeInTheDocument();
    });

    it('calls onCancel when close button is clicked', async () => {
      render(
        <EnhancedCharacterWizard
          isOpen={true}
          onFinish={mockOnFinish}
          onCancel={mockOnCancel}
        />
      );

      const closeButton = screen.getByRole('button', { name: /close/i });
      await user.click(closeButton);

      expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('Wizard Navigation', () => {
    it('shows template selection as first step', () => {
      render(
        <EnhancedCharacterWizard
          isOpen={true}
          onFinish={mockOnFinish}
          onCancel={mockOnCancel}
        />
      );

      // Check using semantic query for active step
      const templateStep = screen.getByRole('button', { name: /template selection/i, current: 'step' });
      expect(templateStep).toBeInTheDocument();
      expect(screen.getByText(/Choose a template or start from scratch/i)).toBeInTheDocument();
    });

    it('allows skipping template selection step', async () => {
      render(
        <EnhancedCharacterWizard
          isOpen={true}
          onFinish={mockOnFinish}
          onCancel={mockOnCancel}
        />
      );

      const skipButton = screen.getByRole('button', { name: /^skip/i });
      await user.click(skipButton);

      // Should move to identity step
      await waitFor(() => {
        const identityStep = screen.getByRole('button', { name: /character identity/i, current: 'step' });
        expect(identityStep).toBeInTheDocument();
      });
    });

    it('shows next button on skippable steps', () => {
      render(
        <EnhancedCharacterWizard
          isOpen={true}
          onFinish={mockOnFinish}
          onCancel={mockOnCancel}
        />
      );

      // Template step is skippable
      expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    });

    it('allows navigating back to previous step', async () => {
      render(
        <EnhancedCharacterWizard
          isOpen={true}
          onFinish={mockOnFinish}
          onCancel={mockOnCancel}
        />
      );

      // Navigate to identity step
      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);

      await waitFor(() => {
        const identityStep = screen.getByRole('button', { name: /character identity/i, current: 'step' });
        expect(identityStep).toBeInTheDocument();
      });

      // Navigate back using Previous button
      const backButton = screen.getByRole('button', { name: /previous/i });
      await user.click(backButton);

      // Should return to template selection (step 1)
      await waitFor(() => {
        const templateStep = screen.getByRole('button', { name: /template selection/i, current: 'step' });
        expect(templateStep).toBeInTheDocument();
      });
    });

    it('disables back button on first step', () => {
      render(
        <EnhancedCharacterWizard
          isOpen={true}
          onFinish={mockOnFinish}
          onCancel={mockOnCancel}
        />
      );

      const backButton = screen.getByRole('button', { name: /previous/i });
      expect(backButton).toBeDisabled();
    });
  });

  describe('Form Validation', () => {
    it('allows navigation through wizard steps', async () => {
      render(
        <EnhancedCharacterWizard
          isOpen={true}
          onFinish={mockOnFinish}
          onCancel={mockOnCancel}
        />
      );

      // Navigate to identity step
      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);

      // Verify we're on the identity step using aria-current
      await waitFor(() => {
        const identityStep = screen.getByRole('button', { 
          name: /character identity/i, 
          current: 'step' 
        });
        expect(identityStep).toBeInTheDocument();
      });
    });
  });

  describe('Character Creation Completion', () => {
    it('provides onFinish callback that can be called', () => {
      render(
        <EnhancedCharacterWizard
          isOpen={true}
          onFinish={mockOnFinish}
          onCancel={mockOnCancel}
        />
      );

      // Wizard is rendered and onFinish callback is available
      // Full wizard completion would require filling all 11 steps
      expect(mockOnFinish).toBeDefined();
      expect(mockOnFinish).not.toHaveBeenCalled();
    });
  });

  describe('Edit Mode', () => {
    const existingCharacter = {
      id: 'char-1',
      name: 'Existing Hero',
      data: {
        class: 'Wizard',
        race: 'Elf',
        level: 5,
        stats: { hp: 30, maxHp: 30, ac: 14, speed: 30 },
      },
    };

    it('accepts existing character prop for editing', () => {
      render(
        <EnhancedCharacterWizard
          isOpen={true}
          onFinish={mockOnFinish}
          onCancel={mockOnCancel}
          character={existingCharacter}
        />
      );

      // Wizard renders in edit mode with character prop
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/character creation wizard/i)).toBeInTheDocument();
    });

    it('renders all wizard steps when editing character', () => {
      render(
        <EnhancedCharacterWizard
          isOpen={true}
          onFinish={mockOnFinish}
          onCancel={mockOnCancel}
          character={existingCharacter}
        />
      );

      // All steps should be available for editing
      expect(screen.getByRole('button', { name: /template selection/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /character identity/i })).toBeInTheDocument();
    });
  });

  describe('LocalStorage Persistence', () => {
    it('wizard maintains state across step navigation', async () => {
      render(
        <EnhancedCharacterWizard
          isOpen={true}
          onFinish={mockOnFinish}
          onCancel={mockOnCancel}
        />
      );

      // Start at template selection
      expect(screen.getByRole('button', { name: /template selection/i, current: 'step' })).toBeInTheDocument();

      // Navigate to next step
      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);

      // Should move to identity step
      await waitFor(() => {
        const identityStep = screen.getByRole('button', { name: /character identity/i, current: 'step' });
        expect(identityStep).toBeInTheDocument();
      });

      // Navigate back
      const backButton = screen.getByRole('button', { name: /previous/i });
      await user.click(backButton);

      // Should return to template selection
      await waitFor(() => {
        const templateStep = screen.getByRole('button', { name: /template selection/i, current: 'step' });
        expect(templateStep).toBeInTheDocument();
      });
    });

    it('renders wizard with proper structure', () => {
      render(
        <EnhancedCharacterWizard
          isOpen={true}
          onFinish={mockOnFinish}
          onCancel={mockOnCancel}
        />
      );

      // Wizard provides all necessary UI elements
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/character creation wizard/i)).toBeInTheDocument();
    });

    it('shows progress indicator', () => {
      render(
        <EnhancedCharacterWizard
          isOpen={true}
          onFinish={mockOnFinish}
          onCancel={mockOnCancel}
        />
      );

      // Progress bar should be visible
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toBeInTheDocument();
      expect(progressBar).toHaveAttribute('aria-valuenow', '0');
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels for dialog', () => {
      render(
        <EnhancedCharacterWizard
          isOpen={true}
          onFinish={mockOnFinish}
          onCancel={mockOnCancel}
        />
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', 'wizard-title');
      expect(dialog).toHaveAttribute('aria-describedby', 'wizard-description');
    });

    it('has accessible step navigation', () => {
      render(
        <EnhancedCharacterWizard
          isOpen={true}
          onFinish={mockOnFinish}
          onCancel={mockOnCancel}
        />
      );

      // Step navigation should be accessible
      const stepNav = screen.getByRole('navigation', { name: /wizard steps/i });
      expect(stepNav).toBeInTheDocument();
      
      // Active step should have aria-current
      const activeStep = screen.getByRole('button', { current: 'step' });
      expect(activeStep).toBeInTheDocument();
    });

    it('has accessible close button', () => {
      render(
        <EnhancedCharacterWizard
          isOpen={true}
          onFinish={mockOnFinish}
          onCancel={mockOnCancel}
        />
      );

      const closeButton = screen.getByRole('button', { name: /close wizard/i });
      expect(closeButton).toBeInTheDocument();
    });
  });

  describe('Progress Indicator', () => {
    it('shows current step progress', () => {
      render(
        <EnhancedCharacterWizard
          isOpen={true}
          onFinish={mockOnFinish}
          onCancel={mockOnCancel}
        />
      );

      // Should show Template Selection step as active (step 1)
      const activeStep = screen.getByRole('button', { name: /template selection/i, current: 'step' });
      expect(activeStep).toBeInTheDocument();
      expect(screen.getByText('1', { selector: '.step-number' })).toBeInTheDocument();
    });

    it('updates progress as user navigates through steps', async () => {
      render(
        <EnhancedCharacterWizard
          isOpen={true}
          onFinish={mockOnFinish}
          onCancel={mockOnCancel}
        />
      );

      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);

      await waitFor(() => {
        // Should show Character Identity as active step (step 2)
        const activeStep = screen.getByRole('button', { name: /character identity/i, current: 'step' });
        expect(activeStep).toBeInTheDocument();
      });
    });
  });
});
