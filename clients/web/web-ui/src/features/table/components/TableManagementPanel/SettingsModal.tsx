import type { FC } from 'react';
import styles from '../TableManagementPanel.module.css';

interface SettingsModalProps {
  settingsName: string;
  settingsWidth: number;
  settingsHeight: number;
  settingsGridSize: number;
  settingsGridEnabled: boolean;
  onNameChange: (name: string) => void;
  onWidthChange: (width: number) => void;
  onHeightChange: (height: number) => void;
  onGridSizeChange: (size: number) => void;
  onGridEnabledChange: (enabled: boolean) => void;
  onSave: () => void;
  onCancel: () => void;
}

export const SettingsModal: FC<SettingsModalProps> = ({
  settingsName,
  settingsWidth,
  settingsHeight,
  settingsGridSize,
  settingsGridEnabled,
  onNameChange,
  onWidthChange,
  onHeightChange,
  onGridSizeChange,
  onGridEnabledChange,
  onSave,
  onCancel
}) => (
  <div className={styles.settingsModal}>
    <div 
      className={`${styles.modalContent} ${styles.settingsModalContent}`}
      style={{ background: '#2a2a2a', color: '#e0e0e0' }}
    >
      <h4 style={{ color: '#fff' }}>Table Settings</h4>
      
      <div className={styles.settingsSection} style={{ background: 'transparent' }}>
        <label style={{ color: '#e0e0e0' }}>
          Table Name:
          <input
            type="text"
            value={settingsName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Enter table name"
            maxLength={50}
          />
        </label>
      </div>

      <div className={styles.settingsSection} style={{ background: 'transparent' }}>
        <h5 style={{ color: '#fff' }}>Resolution</h5>
        <div className={styles.formRow}>
          <label style={{ color: '#e0e0e0' }}>
            Width (px):
            <input
              type="number"
              value={settingsWidth}
              onChange={(e) => onWidthChange(parseInt(e.target.value) || 2000)}
              min="500"
              max="10000"
              step="100"
            />
          </label>
          <label style={{ color: '#e0e0e0' }}>
            Height (px):
            <input
              type="number"
              value={settingsHeight}
              onChange={(e) => onHeightChange(parseInt(e.target.value) || 2000)}
              min="500"
              max="10000"
              step="100"
            />
          </label>
        </div>
      </div>

      <div className={styles.settingsSection} style={{ background: 'transparent' }}>
        <h5 style={{ color: '#fff' }}>Grid</h5>
        <label className={styles.checkboxLabel} style={{ color: '#e0e0e0' }}>
          <input
            type="checkbox"
            checked={settingsGridEnabled}
            onChange={(e) => onGridEnabledChange(e.target.checked)}
          />
          <span>Enable Grid</span>
        </label>
        {settingsGridEnabled && (
          <label style={{ color: '#e0e0e0' }}>
            Grid Size (px):
            <input
              type="number"
              value={settingsGridSize}
              onChange={(e) => onGridSizeChange(parseInt(e.target.value) || 50)}
              min="10"
              max="200"
              step="5"
            />
          </label>
        )}
      </div>

      <div className={styles.modalActions}>
        <button onClick={onSave} className={styles.confirmButton}>
          Save Changes
        </button>
        <button onClick={onCancel} className={styles.cancelButton}>
          Cancel
        </button>
      </div>
    </div>
  </div>
);
