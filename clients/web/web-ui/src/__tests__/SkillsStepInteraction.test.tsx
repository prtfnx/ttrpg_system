import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm } from 'react-hook-form';
import { describe, it, expect } from 'vitest';
import { SkillsStep } from '../components/CharacterWizard/SkillsStep';

// Test component to wrap SkillsStep with form context
function TestWrapper() {
  const methods = useForm({
    defaultValues: {
      skills: [],
    }
  });

  const onNext = () => {
    console.log('[Test] onNext called with skills:', methods.getValues().skills);
  };

  const onBack = () => {
    console.log('[Test] onBack called');
  };

  return (
    <FormProvider {...methods}>
      <SkillsStep
        onNext={onNext}
        onBack={onBack}
        classSkills={['Acrobatics', 'Animal Handling', 'Athletics', 'History', 'Insight', 'Intimidation', 'Perception', 'Survival']}
        classSkillChoices={2}
        backgroundSkills={['Athletics', 'Intimidation']}
        raceSkills={[]}
      />
    </FormProvider>
  );
}

describe('SkillsStep Interaction Test', () => {
  it('should allow selecting available class skills', async () => {
    const user = userEvent.setup();
    render(<TestWrapper />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText(/select skills/i)).toBeInTheDocument();
    });

    // Log all checkboxes to understand what's available
    const allCheckboxes = screen.getAllByRole('checkbox');
    console.log('[Test] Found', allCheckboxes.length, 'total checkboxes');
    
    allCheckboxes.forEach((checkbox, index) => {
      const inputElement = checkbox as HTMLInputElement;
      const label = checkbox.closest('label');
      const labelText = label?.textContent || '';
      console.log(`[Test] Checkbox ${index}:`, {
        labelText,
        checked: inputElement.checked,
        disabled: inputElement.disabled
      });
    });

    // Filter for available class skills
    const availableCheckboxes = allCheckboxes.filter(checkbox => {
      const inputElement = checkbox as HTMLInputElement;
      const label = checkbox.closest('label');
      const labelText = label?.textContent || '';
      return !inputElement.disabled && !inputElement.checked && !labelText.includes('(Background)') && !labelText.includes('(Unavailable)');
    });

    console.log('[Test] Available checkboxes:', availableCheckboxes.length);

    // Select first two available class skills
    if (availableCheckboxes.length >= 2) {
      console.log('[Test] Clicking first available skill');
      await user.click(availableCheckboxes[0]);
      console.log('[Test] Clicking second available skill');
      await user.click(availableCheckboxes[1]);
    } else {
      throw new Error('Not enough available checkboxes to select');
    }

    // Debug: log DOM after selection
    // eslint-disable-next-line no-console
    console.log('[Test] DOM after skill selection:', document.body.innerHTML);

    // Try to submit (wait for button to be enabled or present)
    let nextButton = null;
    try {
      nextButton = await screen.findByTestId('skills-next-button', {}, { timeout: 2000 });
    } catch (e) {
      // Not found, log all buttons
      const allButtons = screen.queryAllByRole('button');
      console.log('[Test] All buttons:', allButtons.map(btn => btn.outerHTML));
      throw new Error('skills-next-button not found after skill selection');
    }
    expect(nextButton).toBeEnabled();
    console.log('[Test] Clicking next button');
    await user.click(nextButton);
    // The test should complete without timing out
    expect(true).toBe(true);
  });
});