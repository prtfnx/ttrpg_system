import React, { useState } from 'react';
import type { SessionInvitation } from '../../types/invitations';
import styles from './InviteLink.module.css';

interface InviteLinkProps {
  invitation: SessionInvitation;
  onRevoke: (id: number) => void;
}

export const InviteLink: React.FC<InviteLinkProps> = ({ invitation, onRevoke }) => {
  const [copied, setCopied] = useState(false);

  const fullUrl = `${window.location.origin}${invitation.invite_url}`;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString();
  };

  const isExpired = invitation.expires_at && new Date(invitation.expires_at) < new Date();
  const isUsedUp = invitation.max_uses > 0 && invitation.uses_count >= invitation.max_uses;

  return (
    <div className={`${styles.container} ${!invitation.is_valid ? styles.invalid : ''}`}>
      <div className={styles.header}>
        <span className={styles.role}>{invitation.pre_assigned_role}</span>
        <span className={styles.status}>
          {!invitation.is_active ? '🚫 Revoked' : 
           isExpired ? '⌛ Expired' :
           isUsedUp ? '✓ Used up' :
           '✓ Active'}
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
          {copied ? '✓' : '📋'}
        </button>
      </div>

      <div className={styles.details}>
        <div className={styles.detailRow}>
          <span>Uses:</span>
          <span>{invitation.uses_count}/{invitation.max_uses || '∞'}</span>
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
