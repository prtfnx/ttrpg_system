/** Stable terminal-close meanings shared by both protocol owners. */
export function terminalConnectionError(close: {
  lastCloseCode: number | null;
  lastCloseReason: string | null;
}): string | null {
  if (close.lastCloseCode !== 1008 && close.lastCloseCode !== 4003) return null;
  if (close.lastCloseReason === 'Demo expired') return 'Demo expired';
  if (close.lastCloseReason === 'Kicked from session') return 'Kicked from session';
  if (close.lastCloseReason === 'Account disabled') return 'Account disabled';
  if (!close.lastCloseReason || ['Authentication expired', 'Authentication failed', 'Account session revoked']
    .includes(close.lastCloseReason)) return 'Authentication failed. Sign in again to continue.';
  return 'Session access denied';
}
