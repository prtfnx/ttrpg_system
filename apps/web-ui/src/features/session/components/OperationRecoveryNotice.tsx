import { useEffect, useState } from 'react';
import type { WebClientProtocol } from '@lib/websocket/clientProtocol';
import type { OperationRecoveryStatus } from '@lib/websocket/operationRecoveryController';
import { onProtocolEvent } from '@lib/websocket/protocolEvents';
import styles from './OperationRecoveryNotice.module.css';

type RecoveryPort = Pick<WebClientProtocol, 'getOperationRecoveryStatus' | 'retrySavedOperations' | 'discardSavedOperations'>;
const empty: OperationRecoveryStatus = { pending: 0, blocked: 0, error: null };

export function OperationRecoveryNotice({ protocol }: { protocol: RecoveryPort | null }) {
  const [snapshot, setSnapshot] = useState({ owner: protocol, status: empty });
  const [confirmForget, setConfirmForget] = useState(false);
  useEffect(() => {
    setSnapshot({ owner: protocol, status: protocol?.getOperationRecoveryStatus() ?? empty });
    setConfirmForget(false);
    return onProtocolEvent('operation-recovery-changed', () => setSnapshot({ owner: protocol,
      status: protocol?.getOperationRecoveryStatus() ?? empty }));
  }, [protocol]);
  const status = snapshot.status;
  if (!protocol || snapshot.owner !== protocol || !status.pending && !status.blocked && !status.error) return null;
  return (
    <aside className={styles.notice} aria-label="Saved changes" role="status">
      <strong>Unconfirmed saved changes</strong>
      <p>{status.error ?? `${status.pending + status.blocked} saved request(s) await confirmation.`}</p>
      {status.blocked > 0 && <p>Some requests need review. Retrying keeps their original identity.</p>}
      <p>Keep this tab open to retain recovery records.</p>
      {confirmForget ? (
        <>
          <p>Forgetting removes this tab’s recovery records. It does not cancel or undo a change, and its outcome may still be unknown.</p>
          <button type="button" onClick={() => { protocol.discardSavedOperations(); setConfirmForget(false); }}>Forget saved requests</button>
          <button type="button" onClick={() => setConfirmForget(false)}>Keep records</button>
        </>
      ) : (
        <>
          <button type="button" onClick={() => protocol.retrySavedOperations()}>Retry saved requests</button>
          <button type="button" onClick={() => setConfirmForget(true)}>Review forgetting records</button>
        </>
      )}
    </aside>
  );
}
