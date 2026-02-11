import type { SessionInvitation } from '@features/session/types/invitations';
import React, { useState } from 'react';
import styles from './InviteLink.module.css';

interface InviteLinkProps {
  invitation: SessionInvitation;
  onRevoke: (id: number) => void;
  onDelete?: (id: number) => void;
}

export const InviteLink: React.FC<InviteLinkProps> = ({ invitation, onRevoke, onDelete }) => {
  const [copied, setCopied] = useState(false);

  // Check if invite_url is already a full URL (starts with http:// or https://)
  const fullUrl = invitation.invite_url.startsWith('http://') || invitation.invite_url.startsWith('https://')
    ? invitation.invite_url
    : `${window.location.origin}${invitation.invite_url}`;

  // Log to console for debugging
  console.log('InviteLink render:', {
    inviteCode: invitation.invite_code,
    rawInviteUrl: invitation.invite_url,
    fullUrl: fullUrl,
    origin: window.location.origin,
    isFullUrl: invitation.invite_url.startsWith('http://') || invitation.invite_url.startsWith('https://')
  });

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

      {onDelete && (
        <button
          className={styles.deleteBtn}
          onClick={() => onDelete(invitation.id)}
        >
          🗑️ Delete
        </button>
      )}
    </div>
  );
};