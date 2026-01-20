import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { adminService } from '../../../services/admin.service';
import type { SessionSettings, SessionSettingsUpdate } from '../../../types/admin';
import styles from './SessionSettingsTab.module.css';

interface SessionSettingsTabProps {
  sessionCode: string;
}

export const SessionSettingsTab: React.FC<SessionSettingsTabProps> = ({ sessionCode }) => {
  const [settings, setSettings] = useState<SessionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [formData, setFormData] = useState<SessionSettingsUpdate>({
    name: '',
    description: '',
    max_players: 8,
    visibility: 'private',
    join_policy: 'invite_only',
  });

  useEffect(() => {
    loadSettings();
  }, [sessionCode]);

  const loadSettings = async () => {
    try {
      const data = await adminService.getSettings(sessionCode);
      setSettings(data);
      setFormData({
        name: data.name,
        description: data.description || '',
        max_players: data.max_players,
        visibility: data.visibility,
        join_policy: data.join_policy,
      });
    } catch (err) {
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminService.updateSettings(sessionCode, formData);
      toast.success('Settings updated successfully');
      loadSettings();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!settings || deleteConfirm !== settings.name) {
      toast.error('Type the exact session name to confirm');
      return;
    }

    try {
      await adminService.deleteSession(sessionCode, deleteConfirm);
      toast.success('Session deleted');
      setTimeout(() => {
        window.location.href = '/users/dashboard';
      }, 1500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete session');
    }
  };

  if (loading) return <div className={styles.loading}>Loading settings...</div>;
  if (!settings) return <div className={styles.error}>Failed to load settings</div>;

  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <h2>Basic Information</h2>
        <div className={styles.field}>
          <label>Session Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className={styles.input}
          />
        </div>

        <div className={styles.field}>
          <label>Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Optional session description..."
            className={styles.textarea}
            rows={4}
          />
        </div>

        <div className={styles.field}>
          <label>Maximum Players</label>
          <input
            type="number"
            min={1}
            max={50}
            value={formData.max_players}
            onChange={(e) => setFormData({ ...formData, max_players: parseInt(e.target.value) })}
            className={styles.input}
          />
          <span className={styles.hint}>Limit: 1-50 players</span>
        </div>
      </div>

      <div className={styles.section}>
        <h2>Privacy & Access</h2>
        <div className={styles.field}>
          <label>Visibility</label>
          <select
            value={formData.visibility}
            onChange={(e) => setFormData({ ...formData, visibility: e.target.value as any })}
            className={styles.select}
          >
            <option value="public">Public - Listed in session browser</option>
            <option value="private">Private - Invite only, not listed</option>
            <option value="unlisted">Unlisted - Join via link, not listed</option>
          </select>
        </div>

        <div className={styles.field}>
          <label>Join Policy</label>
          <select
            value={formData.join_policy}
            onChange={(e) => setFormData({ ...formData, join_policy: e.target.value as any })}
            className={styles.select}
          >
            <option value="open">Open - Anyone can join</option>
            <option value="invite_only">Invite Only - Requires invitation</option>
            <option value="closed">Closed - No new players allowed</option>
          </select>
        </div>
      </div>

      <div className={styles.section}>
        <h2>Session Info</h2>
        <div className={styles.infoGrid}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Owner</span>
            <span className={styles.infoValue}>{settings.owner_username}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Created</span>
            <span className={styles.infoValue}>
              {new Date(settings.created_at).toLocaleDateString()}
            </span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Session Code</span>
            <span className={styles.infoValue}>{sessionCode}</span>
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <button onClick={handleSave} disabled={saving} className={styles.saveButton}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className={styles.dangerZone}>
        <h2>⚠️ Danger Zone</h2>
        <p>Once you delete a session, there is no going back. Please be certain.</p>
        <button onClick={() => setShowDeleteModal(true)} className={styles.deleteButton}>
          Delete Session
        </button>
      </div>

      {showDeleteModal && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h3>Delete Session</h3>
            <p>This action cannot be undone. Type <strong>{settings.name}</strong> to confirm:</p>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="Type session name..."
              className={styles.input}
            />
            <div className={styles.modalActions}>
              <button onClick={() => setShowDeleteModal(false)} className={styles.cancelButton}>
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteConfirm !== settings.name}
                className={styles.confirmDeleteButton}
              >
                Delete Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
