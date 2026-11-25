import { useOptionalProtocol } from '@lib/api';
import { usePlanningStore } from '../stores/planningStore';

export function PlanRecoveryNotice() {
  const phase = usePlanningStore(state => state.recoveryStatus);
  const message = usePlanningStore(state => state.recoveryError);
  const pending = usePlanningStore(state => state.pendingSubmission);
  const protocol = useOptionalProtocol()?.protocol;
  if (!phase) return null;
  return <div role="status" aria-label="Saved combat plan">
    <p>{message ?? 'The saved plan needs review before sending.'}</p>
    {phase === 'review' && !pending && <button disabled={!protocol} onClick={() => protocol?.reviewSavedCombatPlan()}>Review saved plan</button>}
    {phase === 'retry' && pending && <button disabled={!protocol} onClick={() => protocol?.retrySavedCombatStep()}>Retry original saved step</button>}
    {(phase === 'checking' || phase === 'blocked' || phase === 'retry') && <button disabled={!protocol} onClick={() => protocol?.checkSavedCombatPlan()}>Check saved submission</button>}
    {(phase === 'review' || phase === 'stale') && !pending
      && <button disabled={!protocol} onClick={() => protocol?.discardSavedCombatPlan()}>Discard saved plan</button>}
  </div>;
}
