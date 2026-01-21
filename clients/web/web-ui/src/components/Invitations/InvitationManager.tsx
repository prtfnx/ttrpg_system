import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { useInvitations } from '../../hooks/useInvitations';
import type { SessionRole } from '../../types/roles';
import styles from './InvitationManager.module.css';
import { InviteLink } from './InviteLink';

interface InvitationManagerProps {
  sessionCode: string;
  onClose: () => void;
  standalone?: boolean;
}

export const InvitationManager: React.FC<InvitationManagerProps> = ({ sessionCode, onClose, standalone }) => {
  const { invitations, loading, createInvitation, revokeInvitation } = useInvitations(sessionCode);
  const [selectedRole, setSelectedRole] = useState<SessionRole>('player');
  const [expiresHours, setExpiresHours] = useState(24);
  const [maxUses, setMaxUses] = useState(1);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    console.log('Creating invitation with params:', {
      session_code: sessionCode,
      pre_assigned_role: selectedRole,
      expires_hours: expiresHours,
      max_uses: maxUses
    });
    
    const result = await createInvitation({
      session_code: sessionCode,
      pre_assigned_role: selectedRole,
      expires_hours: expiresHours,
      max_uses: maxUses
    });

    console.log('Invitation creation result:', result);
    if (result) {
      console.log('Invitation created successfully:', {
        id: result.id,
        invite_code: result.invite_code,
        invite_url: result.invite_url,
        pre_assigned_role: result.pre_assigned_role
      });
      toast.success('Invitation created!');
    } else {
      console.error('Invitation creation failed - no result returned');
    }
    setCreating(false);
  };

  const handleRevoke = async (id: number) => {
    if (!confirm('Revoke this invitation?')) return;

    const success = await revokeInvitation(id);
    if (success) {
      toast.success('Invitation revoked');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Permanently delete this invitation from the list?')) return;

    console.log('Deleting invitation:', id);
    const success = await revokeInvitation(id);
    if (success) {
      toast.success('Invitation deleted');
    }
  };

  return (
    <div className={styles.overlay} onClick={standalone ? undefined : onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Manage Invitations</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.createSection}>
          <h3>Create New Invitation</h3>
          
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label>Role</label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as SessionRole)}
                className={styles.select}
              >
                <option value="player">Player</option>
                <option value="trusted_player">Trusted Player</option>
                <option value="co_dm">Co-DM</option>
                <option value="spectator">Spectator</option>
              </select>
            </div>

            <div className={styles.field}>
              <label>Expires in (hours)</label>
              <input
                type="number"
                value={expiresHours}
                onChange={(e) => setExpiresHours(Number(e.target.value))}
                min="1"
                max="168"
                className={styles.input}
              />
            </div>

            <div className={styles.field}>
              <label>Max uses</label>
              <input
                type="number"
                value={maxUses}
                onChange={(e) => setMaxUses(Number(e.target.value))}
                min="1"
                max="100"
                className={styles.input}
              />
            </div>
          </div>

          <button
            className={styles.createBtn}
            onClick={handleCreate}
            disabled={creating || loading}
          >
            {creating ? 'Creating...' : 'Create Invitation'}
          </button>
        </div>

        <div className={styles.listSection}>
          <h3>Active Invitations ({invitations.filter(i => i.is_valid).length})</h3>
          
          {loading && <div className={styles.loading}>Loading...</div>}
          
          {!loading && invitations.length === 0 && (
            <div className={styles.empty}>No invitations yet</div>
          )}

          {!loading && invitations.length > 0 && (
            <div className={styles.list}>
              {invitations.map(invite => (
                <InviteLink
                  key={invite.id}
                  invitation={invite}
                  onRevoke={handleRevoke}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
