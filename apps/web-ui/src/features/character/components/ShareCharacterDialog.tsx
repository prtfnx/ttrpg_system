import React, { useState } from 'react';
import styles from './ShareCharacterDialog.module.css';

interface ShareCharacterDialogProps {
  characterId: string;
  characterName: string;
  ownerId: number;
  currentControlledBy: number[];
  availableUsers: Array<{ id: number; name: string }>;
  onClose: () => void;
  onSave: (characterId: string, controlledBy: number[]) => void;
}

export const ShareCharacterDialog: React.FC<ShareCharacterDialogProps> = ({
  characterId,
  characterName,
  ownerId,
  currentControlledBy,
  availableUsers,
  onClose,
  onSave
}) => {
  const [selectedUsers, setSelectedUsers] = useState<Set<number>>(
    new Set(currentControlledBy)
  );

  const handleToggleUser = (userId: number) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
  };

  const handleSelectAll = () => {
    setSelectedUsers(new Set(availableUsers.map(u => u.id)));
  };

  const handleDeselectAll = () => {
    setSelectedUsers(new Set());
  };

  const handleSave = () => {
    onSave(characterId, Array.from(selectedUsers));
    onClose();
  };

  return (
    <div className={styles.shareDialogOverlay} onClick={onClose}>
      <div className={styles.shareDialog} onClick={e => e.stopPropagation()}>
        <div className="share-dialog-header">
          <h3>Share Character</h3>
          <button className={styles.closeBtn} onClick={onClose} title="Close">
            ×
          </button>
        </div>

        <div className="share-dialog-content">
          <div className="character-info">
            <div className="info-row">
              <span className="label">Character:</span>
              <span className="value">{characterName}</span>
            </div>
            <div className="info-row">
              <span className="label">Owner:</span>
              <span className="value">User {ownerId}</span>
            </div>
          </div>

          <div className={styles.permissionsSection}>
            <div className="section-header">
              <h4>Grant Control To:</h4>
              <div className="bulk-actions">
                <button className="link-btn" onClick={handleSelectAll}>
                  Select All
                </button>
                <button className="link-btn" onClick={handleDeselectAll}>
                  Deselect All
                </button>
              </div>
            </div>

            <div className="user-list">
              {availableUsers.length === 0 && (
                <div className="no-users">
                  No other users in this session
                </div>
              )}
              {availableUsers.map(user => (
                <label
                  key={user.id}
                  className={`user-checkbox ${
                    selectedUsers.has(user.id) ? 'checked' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedUsers.has(user.id)}
                    onChange={() => handleToggleUser(user.id)}
                  />
                  <span className="user-name">{user.name}</span>
                  {user.id === ownerId && (
                    <span className="owner-badge">Owner</span>
                  )}
                </label>
              ))}
            </div>
          </div>

          <div className="permission-note">
            <strong>Note:</strong> Users with control can edit stats, add conditions,
            and manage tokens for this character.
          </div>
        </div>

        <div className="share-dialog-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
