import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ConditionBadges } from '../ConditionBadges';
import type { ActiveCondition } from '../../stores/combatStore';

const makeCondition = (overrides: Partial<ActiveCondition> = {}): ActiveCondition => ({
  condition_id: 'c1',
  condition_type: 'poisoned',
  source: 's1',
  duration_remaining: null,
  duration_type: 'permanent',
  applied_at_round: 1,
  ...overrides,
});

describe('ConditionBadges', () => {
  it('renders nothing when conditions is empty', () => {
    const { container } = render(<ConditionBadges conditions={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a badge for each condition', () => {
    const conditions = [makeCondition(), makeCondition({ condition_id: 'c2', condition_type: 'stunned' })];
    render(<ConditionBadges conditions={conditions} />);
    expect(screen.getByTitle('poisoned')).toBeTruthy();
    expect(screen.getByTitle('stunned')).toBeTruthy();
  });

  it('shows abbreviated condition type text', () => {
    render(<ConditionBadges conditions={[makeCondition()]} />);
    expect(screen.getByText('POI')).toBeTruthy();
  });

  it('shows duration in title when duration_remaining is set', () => {
    const cond = makeCondition({ duration_remaining: 3 });
    render(<ConditionBadges conditions={[cond]} />);
    expect(screen.getByTitle('poisoned (3r)')).toBeTruthy();
  });
});
