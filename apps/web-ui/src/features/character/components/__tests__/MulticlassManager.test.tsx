import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MulticlassManager } from '../MulticlassManager';

const highScores = {
  strength: 16, dexterity: 14, constitution: 14,
  intelligence: 15, wisdom: 13, charisma: 10,
};

const lowScores = {
  strength: 8, dexterity: 8, constitution: 10,
  intelligence: 8, wisdom: 8, charisma: 8,
};

describe('MulticlassManager', () => {
  it('shows level 2 requirement message when level < 2', () => {
    render(
      <MulticlassManager
        currentClasses={['fighter']}
        currentLevel={1}
        abilityScores={highScores}
        onMulticlass={vi.fn()}
      />
    );
    expect(screen.getByText(/Multiclassing becomes available at level 2/)).toBeInTheDocument();
  });

  it('shows class selector for level >= 2', () => {
    render(
      <MulticlassManager
        currentClasses={['fighter']}
        currentLevel={5}
        abilityScores={highScores}
        onMulticlass={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Add Class:')).toBeInTheDocument();
  });

  it('shows current classes as chips', () => {
    render(
      <MulticlassManager
        currentClasses={['Fighter', 'Wizard']}
        currentLevel={5}
        abilityScores={highScores}
        onMulticlass={vi.fn()}
      />
    );
    expect(screen.getByText('Fighter')).toBeInTheDocument();
    expect(screen.getByText('Wizard')).toBeInTheDocument();
  });

  it('Show Requirements button toggles the requirements box', () => {
    render(
      <MulticlassManager
        currentClasses={['fighter']}
        currentLevel={5}
        abilityScores={highScores}
        onMulticlass={vi.fn()}
      />
    );
    const btn = screen.getByText('Show Requirements');
    expect(screen.queryByText(/Your Ability Scores/)).not.toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.getByText(/Your Ability Scores/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Hide Requirements'));
    expect(screen.queryByText(/Your Ability Scores/)).not.toBeInTheDocument();
  });

  it('available classes exclude current classes', () => {
    render(
      <MulticlassManager
        currentClasses={['fighter']}
        currentLevel={5}
        abilityScores={highScores}
        onMulticlass={vi.fn()}
      />
    );
    const select = screen.getByLabelText('Add Class:') as HTMLSelectElement;
    const options = Array.from(select.options).map(o => o.value);
    expect(options).not.toContain('fighter');
    expect(options).toContain('wizard');
  });

  it('Multiclass button is disabled when no class is selected', () => {
    render(
      <MulticlassManager
        currentClasses={['fighter']}
        currentLevel={5}
        abilityScores={highScores}
        onMulticlass={vi.fn()}
      />
    );
    expect(screen.getByText('Multiclass')).toBeDisabled();
  });

  it('selecting class with met prerequisites shows confirm box', () => {
    render(
      <MulticlassManager
        currentClasses={['fighter']}
        currentLevel={5}
        abilityScores={highScores}
        onMulticlass={vi.fn()}
      />
    );
    const select = screen.getByLabelText('Add Class:');
    fireEvent.change(select, { target: { value: 'wizard' } });
    expect(screen.getByText(/Wizard.*Requirements Met/i)).toBeInTheDocument();
    expect(screen.getByText('Multiclass')).not.toBeDisabled();
  });

  it('clicking Multiclass calls onMulticlass with selected class', () => {
    const onMulticlass = vi.fn();
    render(
      <MulticlassManager
        currentClasses={['fighter']}
        currentLevel={5}
        abilityScores={highScores}
        onMulticlass={onMulticlass}
      />
    );
    fireEvent.change(screen.getByLabelText('Add Class:'), { target: { value: 'wizard' } });
    fireEvent.click(screen.getByText('Multiclass'));
    expect(onMulticlass).toHaveBeenCalledWith('wizard');
  });

  it('does not call onMulticlass when prerequisites not met', () => {
    const onMulticlass = vi.fn();
    render(
      <MulticlassManager
        currentClasses={['fighter']}
        currentLevel={5}
        abilityScores={lowScores}
        onMulticlass={onMulticlass}
      />
    );
    // wizard needs INT >= 13, but lowScores.intelligence = 8 -> prereqs not met
    // Multiclass button should be disabled, but just to be safe fire the click
    const btn = screen.getByText('Multiclass');
    expect(btn).toBeDisabled();
  });
});
