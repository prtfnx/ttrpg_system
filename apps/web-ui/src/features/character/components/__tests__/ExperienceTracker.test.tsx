import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExperienceTracker } from '../ExperienceTracker';

const defaults = {
  currentLevel: 1,
  currentExperience: 0,
  onExperienceChange: vi.fn(),
  onLevelUp: vi.fn(),
};

describe('ExperienceTracker', () => {
  describe('rendering', () => {
    it('shows level and XP', () => {
      render(<ExperienceTracker {...defaults} currentLevel={3} currentExperience={1200} />);
      expect(screen.getByText('Level 3')).toBeInTheDocument();
      expect(screen.getByText(/1.?200/)).toBeInTheDocument();
    });

    it('shows XP needed message when not max level', () => {
      render(<ExperienceTracker {...defaults} currentLevel={1} currentExperience={0} />);
      expect(screen.getByText(/XP needed for level 2/)).toBeInTheDocument();
    });

    it('shows max level message at level 20', () => {
      render(<ExperienceTracker {...defaults} currentLevel={20} currentExperience={355000} />);
      expect(screen.getByText('Maximum level reached!')).toBeInTheDocument();
    });

    it('shows Add Experience input for non-DM', () => {
      render(<ExperienceTracker {...defaults} isDM={false} />);
      expect(screen.getByLabelText('Add Experience:')).toBeInTheDocument();
    });
  });

  describe('adding experience', () => {
    it('calls onExperienceChange when XP is added', () => {
      const onExperienceChange = vi.fn();
      render(
        <ExperienceTracker
          {...defaults}
          currentExperience={0}
          onExperienceChange={onExperienceChange}
        />
      );
      const input = screen.getByLabelText('Add Experience:');
      fireEvent.change(input, { target: { value: '100' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add Experience' }));
      expect(onExperienceChange).toHaveBeenCalledWith(100);
    });

    it('calls onLevelUp when XP crosses threshold', () => {
      const onLevelUp = vi.fn();
      const onExperienceChange = vi.fn();
      render(
        <ExperienceTracker
          {...defaults}
          currentLevel={1}
          currentExperience={200}
          onExperienceChange={onExperienceChange}
          onLevelUp={onLevelUp}
        />
      );
      const input = screen.getByLabelText('Add Experience:');
      fireEvent.change(input, { target: { value: '200' } }); // 200+200=400 > 300 threshold
      fireEvent.click(screen.getByRole('button', { name: 'Add Experience' }));
      expect(onLevelUp).toHaveBeenCalledWith(2);
    });

    it('does not call onExperienceChange for invalid input', () => {
      const onExperienceChange = vi.fn();
      render(
        <ExperienceTracker
          {...defaults}
          onExperienceChange={onExperienceChange}
        />
      );
      const input = screen.getByLabelText('Add Experience:');
      fireEvent.change(input, { target: { value: 'abc' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add Experience' }));
      expect(onExperienceChange).not.toHaveBeenCalled();
    });

    it('shows Level Up button when XP threshold met', () => {
      render(
        <ExperienceTracker
          {...defaults}
          currentLevel={1}
          currentExperience={300} // exactly at level 2 threshold
        />
      );
      expect(screen.getByRole('button', { name: 'Level Up' })).toBeInTheDocument();
    });

    it('calls onLevelUp when Level Up button clicked', () => {
      const onLevelUp = vi.fn();
      render(
        <ExperienceTracker
          {...defaults}
          currentLevel={1}
          currentExperience={300}
          onLevelUp={onLevelUp}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Level Up' }));
      expect(onLevelUp).toHaveBeenCalledWith(2);
    });
  });

  describe('DM mode', () => {
    it('shows Award XP button', () => {
      render(<ExperienceTracker {...defaults} isDM />);
      expect(screen.getByRole('button', { name: 'Award XP' })).toBeInTheDocument();
    });

    it('toggles award dialog on button click', () => {
      render(<ExperienceTracker {...defaults} isDM />);
      fireEvent.click(screen.getByRole('button', { name: 'Award XP' }));
      expect(screen.getByText('Award XP', { selector: 'strong' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel Award' }));
      expect(screen.queryByText('Award XP', { selector: 'strong' })).not.toBeInTheDocument();
    });

    it('calls onExperienceChange when awarding XP (no onAwardXP)', () => {
      const onExperienceChange = vi.fn();
      render(
        <ExperienceTracker
          {...defaults}
          isDM
          currentExperience={50}
          onExperienceChange={onExperienceChange}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Award XP' }));
      const inputs = screen.getAllByRole('spinbutton');
      fireEvent.change(inputs[0], { target: { value: '100' } });
      fireEvent.click(screen.getByRole('button', { name: 'Confirm Award' }));
      expect(onExperienceChange).toHaveBeenCalledWith(150);
    });

    it('calls onAwardXP callback when provided', () => {
      const onAwardXP = vi.fn();
      render(<ExperienceTracker {...defaults} isDM onAwardXP={onAwardXP} />);
      fireEvent.click(screen.getByRole('button', { name: 'Award XP' }));
      const inputs = screen.getAllByRole('spinbutton');
      fireEvent.change(inputs[0], { target: { value: '200' } });
      fireEvent.click(screen.getByRole('button', { name: 'Confirm Award' }));
      expect(onAwardXP).toHaveBeenCalledWith(200, 'quest', '');
    });

    it('shows Level Up button for DM when XP threshold met', () => {
      render(
        <ExperienceTracker
          {...defaults}
          isDM
          currentLevel={1}
          currentExperience={300}
        />
      );
      expect(screen.getByRole('button', { name: 'Level Up' })).toBeInTheDocument();
    });
  });

  describe('custom advancement config', () => {
    it('uses custom XP table', () => {
      const advancementConfig = { xp_table: [0, 100, 300, 600] };
      render(
        <ExperienceTracker
          {...defaults}
          currentLevel={1}
          currentExperience={50}
          advancementConfig={advancementConfig as never}
        />
      );
      expect(screen.getByText(/100/)).toBeInTheDocument();
    });
  });
});
