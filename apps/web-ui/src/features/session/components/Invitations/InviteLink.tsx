import type { SessionInvitation } from '@features/session/types/invitations';
import { logger } from '@shared/utils/logger';
import React, { useEffect, useRef, useState } from 'react';
import styles from './InviteLink.module.css';

interface InviteLinkProps {
  invitation: SessionInvitation;
  onRevoke: (id: number) => void;
}

export const InviteLink: React.FC<InviteLinkProps> = ({ invitation, onRevoke }) => {
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);

  const fullUrl = /^https?:\/\//i.test(invitation.invite_url)
    ? invitation.invite_url
    : new URL(invitation.invite_url, `${window.location.origin}/`).toString();

  useEffect(() => () => {
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
  }, []);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = window.setTimeout(() => {
        copiedTimerRef.current = null;
        setCopied(false);
      }, 2000);
    } catch (err) {
      logger.error('Failed to copy invitation link', err);
    }
  };

  const formatDate = (date: string) => {
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? 'Unknown' : parsed.toLocaleString();
  };

  const expirationTime = invitation.expires_at ? new Date(invitation.expires_at).getTime() : Number.NaN;
  const isExpired = Number.isFinite(expirationTime) && expirationTime < Date.now();
  const isUsedUp = invitation.max_uses > 0 && invitation.uses_count >= invitation.max_uses;

  return (
    <div className={`${styles.container} ${!invitation.is_valid ? styles.invalid : ''}`}>
      <div className={styles.header}>
        <span className={styles.role}>{invitation.pre_assigned_role}</span>
        <span className={styles.status}>
          {!invitation.is_active ? 'Revoked' :
           isExpired ? 'Expired' :
           isUsedUp ? 'Used' :
           'Active'}
        </span>
      </div>

      <div className={styles.linkBox}>
        <input
          type="text"
          value={fullUrl}
          readOnly
          className={styles.linkInput}
          onClick={(e) => e.currentTarget.select()}
        />
        <button
          className={styles.copyBtn}
          onClick={copyToClipboard}
          disabled={!invitation.is_valid}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div className={styles.details}>
        <div className={styles.detailRow}>
          <span>Uses:</span>
          <span>{invitation.uses_count}/{invitation.max_uses || 'Unlimited'}</span>
        </div>
        {invitation.expires_at && (
          <div className={styles.detailRow}>
            <span>Expires:</span>
            <span>{formatDate(invitation.expires_at)}</span>
          </div>
        )}
        <div className={styles.detailRow}>
          <span>Created:</span>
          <span>{formatDate(invitation.created_at)}</span>
        </div>
      </div>

      {invitation.is_valid && (
        <button
          className={styles.revokeBtn}
          onClick={() => onRevoke(invitation.id)}
        >
          Revoke
        </button>
      )}

    </div>
  );
};
