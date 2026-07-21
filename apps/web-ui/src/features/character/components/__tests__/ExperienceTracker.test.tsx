import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExperienceTracker } from '../ExperienceTracker';

const defaults = {
  currentLevel: 1,
  currentExperience: 0,
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

    it('keeps XP read-only for non-DMs', () => {
      render(<ExperienceTracker {...defaults} isDM={false} />);
      expect(screen.getByText('Only a DM can award XP.')).toBeInTheDocument();
      expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
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

    it('calls onAwardXP callback when provided', () => {
      const onAwardXP = vi.fn();
      render(<ExperienceTracker {...defaults} isDM onAwardXP={onAwardXP} />);
      fireEvent.click(screen.getByRole('button', { name: 'Award XP' }));
      const inputs = screen.getAllByRole('spinbutton');
      fireEvent.change(inputs[0], { target: { value: '200' } });
      fireEvent.click(screen.getByRole('button', { name: 'Confirm Award' }));
      expect(onAwardXP).toHaveBeenCalledWith(200, 'quest', '');
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
