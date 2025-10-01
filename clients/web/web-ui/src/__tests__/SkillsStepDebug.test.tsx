import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { SkillsStep } from '../components/CharacterWizard/SkillsStep';

describe('SkillsStep Debug', () => {
  function TestWrapper() {
    const methods = useForm({
      defaultValues: {
        skills: []
      }
    });

    return (
      <FormProvider {...methods}>
        <SkillsStep
          onNext={() => console.log('onNext called')}
          onBack={() => console.log('onBack called')}
          classSkills={['Acrobatics', 'Animal Handling', 'Athletics', 'History', 'Insight', 'Intimidation', 'Perception', 'Survival']}
          classSkillChoices={2}
          backgroundSkills={['Athletics', 'Intimidation']}
          raceSkills={[]}
        />
      </FormProvider>
    );
  }

  it('should show available skills correctly', async () => {
    render(<TestWrapper />);
    
    // Check that background skills are shown
    expect(screen.getByText(/Athletics, Intimidation/)).toBeInTheDocument();
    
    // Check that class skills instruction is shown
    expect(screen.getByText(/Choose 2 from:/)).toBeInTheDocument();
    
    // Check available class skills (should exclude Athletics and Intimidation)
    expect(screen.getByText(/Acrobatics, Animal Handling, History, Insight, Perception, Survival/)).toBeInTheDocument();
    
    // Get all checkboxes
    const checkboxes = screen.getAllByRole('checkbox');
    console.log('Total checkboxes found:', checkboxes.length);
    
    // Find Athletics and Intimidation - should be checked and disabled (background skills)
    const athleticsCheckbox = checkboxes.find(cb => {
      const label = cb.closest('label');
      return label?.textContent?.includes('Athletics');
    });
    const intimidationCheckbox = checkboxes.find(cb => {
      const label = cb.closest('label');
      return label?.textContent?.includes('Intimidation');
    });
    
    expect(athleticsCheckbox).toBeChecked();
    expect(athleticsCheckbox).toBeDisabled();
    expect(intimidationCheckbox).toBeChecked();
    expect(intimidationCheckbox).toBeDisabled();
    
    // Find available class skills - should be unchecked and enabled
    const acrobaticsCheckbox = checkboxes.find(cb => {
      const label = cb.closest('label');
      return label?.textContent?.includes('Acrobatics') && !label?.textContent?.includes('(Background)');
    });
    const animalHandlingCheckbox = checkboxes.find(cb => {
      const label = cb.closest('label');
      return label?.textContent?.includes('Animal Handling');
    });
    
    expect(acrobaticsCheckbox).not.toBeChecked();
    expect(acrobaticsCheckbox).not.toBeDisabled();
    expect(animalHandlingCheckbox).not.toBeChecked();
    expect(animalHandlingCheckbox).not.toBeDisabled();
  });

  it('should allow selecting exactly 2 class skills and submit', async () => {
    const user = userEvent.setup();
    render(<TestWrapper />);
    
    // Get all checkboxes
    const checkboxes = screen.getAllByRole('checkbox');
    
    // Find available class skills (not background skills)
    const availableSkills = checkboxes.filter(cb => {
      const label = cb.closest('label');
      const text = label?.textContent || '';
      return !text.includes('(Background)') && !(cb as HTMLInputElement).disabled;
    });
    
    console.log('Available skills count:', availableSkills.length);
    
    // Select first 2 available skills
    if (availableSkills.length >= 2) {
      await user.click(availableSkills[0]);
      await user.click(availableSkills[1]);
      
      // Try to submit
      const submitButton = screen.getByTestId('skills-next-button');
      await user.click(submitButton);
      
      // Should not show any error
      await waitFor(() => {
        const errorText = screen.queryByText(/Select \d+ class skills/);
        expect(errorText).not.toBeInTheDocument();
      });
    }
  });
});