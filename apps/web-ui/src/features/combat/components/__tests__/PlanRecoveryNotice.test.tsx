import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { usePlanningStore } from '../../stores/planningStore';
import { PlanRecoveryNotice } from '../PlanRecoveryNotice';
const calls = vi.hoisted(() => ({ retrySavedCombatStep: vi.fn(), reviewSavedCombatPlan: vi.fn(), checkSavedCombatPlan: vi.fn(), discardSavedCombatPlan: vi.fn() }));
vi.mock('@lib/api', () => ({ useOptionalProtocol: () => ({ protocol: calls }) }));
beforeEach(() => { vi.clearAllMocks(); usePlanningStore.setState({ recoveryStatus: null, recoveryError: null, pendingSubmission: null }); });
it('requires review rather than automatically sending a restored plan', () => {
  usePlanningStore.setState({ recoveryStatus: 'review', recoveryError: 'Saved plan restored.' });
  render(<PlanRecoveryNotice />);
  expect(calls.reviewSavedCombatPlan).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Review saved plan'));
  expect(calls.reviewSavedCombatPlan).toHaveBeenCalledOnce();
});
it('retains uncertain submissions and offers only a status check', () => {
  usePlanningStore.setState({ recoveryStatus: 'blocked', pendingSubmission: { sequenceId: 42, actionIds: ['a'] } });
  render(<PlanRecoveryNotice />);
  expect(screen.queryByText('Discard saved plan')).toBeNull();
  expect(screen.queryByText('Review saved plan')).toBeNull();
  fireEvent.click(screen.getByText('Check saved submission'));
  expect(calls.checkSavedCombatPlan).toHaveBeenCalledOnce();
});
it('allows stale unsent drafts to be discarded', () => {
  usePlanningStore.setState({ recoveryStatus: 'stale' }); render(<PlanRecoveryNotice />);
  fireEvent.click(screen.getByText('Discard saved plan'));
  expect(calls.discardSavedCombatPlan).toHaveBeenCalledOnce();
});

it('offers an explicit original-identity retry while keeping discard unavailable', () => {
  usePlanningStore.setState({ recoveryStatus: 'retry', pendingSubmission: { sequenceId: 42, actionIds: ['a'] } });
  render(<PlanRecoveryNotice />);
  expect(screen.queryByText('Discard saved plan')).toBeNull();
  fireEvent.click(screen.getByText('Retry original saved step'));
  expect(calls.retrySavedCombatStep).toHaveBeenCalledOnce();
});
