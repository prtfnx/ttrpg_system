import clsx from 'clsx';
import React from 'react';
import type { Character } from '../../../../types';
import styles from '../CharacterPanel.module.css';

interface StatsEditFormData {
  hp?: number;
  maxHp?: number;
  ac?: number;
  speed?: number;
  newCondition?: string;
}

interface CharacterStatsProps {
  character: Character;
  isEditing: boolean;
  canEdit: boolean;
  editFormData: StatsEditFormData;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onFormChange: (data: StatsEditFormData) => void;
  onAddCondition: () => void;
  onRemoveCondition: (condition: string) => void;
}

export const CharacterStats: React.FC<CharacterStatsProps> = ({
  character,
  isEditing,
  canEdit,
  editFormData,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onFormChange,
  onAddCondition,
  onRemoveCondition
}) => {
  const stats = character.data?.stats || {};
  const conditions = character.data?.conditions || [];

  return (
    <>
      {/* Stats Section */}
      {isEditing ? (
        <div className={clsx(styles.detailsSection, "editMode")}>
          <h4>Edit Stats</h4>
          <div className={styles.statRow}>
            <label>HP:</label>
            <input
              type="number"
              value={editFormData.hp || 0}
              onChange={e => onFormChange({ ...editFormData, hp: parseInt(e.target.value) || 0 })}
              className={styles.statInput}
            />
            <span>/ {editFormData.maxHp}</span>
          </div>
          <div className={styles.statRow}>
            <label>Max HP:</label>
            <input
              type="number"
              value={editFormData.maxHp || 10}
              onChange={e => onFormChange({ ...editFormData, maxHp: parseInt(e.target.value) || 10 })}
              className={styles.statInput}
            />
          </div>
          <div className={styles.statRow}>
            <label>AC:</label>
            <input
              type="number"
              value={editFormData.ac || 10}
              onChange={e => onFormChange({ ...editFormData, ac: parseInt(e.target.value) || 10 })}
              className={styles.statInput}
            />
          </div>
          <div className={styles.statRow}>
            <label>Speed:</label>
            <input
              type="number"
              value={editFormData.speed || 30}
              onChange={e => onFormChange({ ...editFormData, speed: parseInt(e.target.value) || 30 })}
              className={styles.statInput}
            />
            <span>ft</span>
          </div>
          <div className={styles.editActions}>
            <button className={clsx(styles.actionBtn, "save")} onClick={onSaveEdit}>Save</button>
            <button className={clsx(styles.actionBtn, "cancel")} onClick={onCancelEdit}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className={styles.detailsSection}>
          <h4>Stats</h4>
          <div className={styles.statRow}>
            <span>HP:</span>
            <span>{stats.hp || 0} / {stats.maxHp || 10}</span>
          </div>
          <div className={styles.statRow}>
            <span>AC:</span>
            <span>{stats.ac || 10}</span>
          </div>
          <div className={styles.statRow}>
            <span>Speed:</span>
            <span>{stats.speed || 30} ft</span>
          </div>
          <div className={styles.statRow}>
            <span>Version:</span>
            <span>{character.version}</span>
          </div>
          {canEdit && (
            <button className={clsx(styles.actionBtn, "edit")} onClick={onStartEdit}>
              Edit Stats
            </button>
          )}
        </div>
      )}

      {/* Conditions Section */}
      <div className="details-section conditions-section">
        <h4>Conditions</h4>
        <div className={styles.conditionsList}>
          {conditions.length === 0 && (
            <span className={styles.noConditions}>No active conditions</span>
          )}
          {conditions.map((cond: string) => (
            <div key={cond} className={styles.conditionTag}>
              {cond}
              {canEdit && (
                <button
                  className={styles.removeCondition}
                  onClick={() => onRemoveCondition(cond)}
                  title="Remove condition"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        {canEdit && !isEditing && (
          <div className={styles.addConditionRow}>
            <input
              id={`condition-input-${character.id}`}
              type="text"
              placeholder="Add condition..."
              value={editFormData.newCondition || ''}
              onChange={e => onFormChange({ ...editFormData, newCondition: e.target.value })}
              onKeyPress={e => {
                if (e.key === 'Enter') onAddCondition();
              }}
              className={styles.conditionInput}
              aria-label="Add condition"
            />
            <button
              className={clsx(styles.actionBtn, "addCondition")}
              onClick={onAddCondition}
              aria-label="Add condition"
            >
              +
            </button>
          </div>
        )}
      </div>
    </>
  );
};
