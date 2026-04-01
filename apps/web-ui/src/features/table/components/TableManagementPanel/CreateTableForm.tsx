import type { FC } from 'react';
import styles from '../TableManagementPanel.module.css';
import { TABLE_TEMPLATES } from './utils';

interface CreateTableFormProps {
  tableName: string;
  tableWidth: number;
  tableHeight: number;
  onNameChange: (name: string) => void;
  onWidthChange: (width: number) => void;
  onHeightChange: (height: number) => void;
  onApplyTemplate: (key: keyof typeof TABLE_TEMPLATES) => void;
  onCreate: () => void;
  onCancel: () => void;
}

export const CreateTableForm: FC<CreateTableFormProps> = ({
  tableName,
  tableWidth,
  tableHeight,
  onNameChange,
  onWidthChange,
  onHeightChange,
  onApplyTemplate,
  onCreate,
  onCancel
}) => (
  <div className={styles.createTableForm}>
    <h4>Create New Table</h4>
    
    <div className={styles.templateButtons}>
      <span className={styles.templateLabel}>Quick Templates:</span>
      {Object.entries(TABLE_TEMPLATES).map(([key, { label }]) => (
        <button
          key={key}
          onClick={() => onApplyTemplate(key as keyof typeof TABLE_TEMPLATES)}
          className={styles.templateButton}
        >
          {label}
        </button>
      ))}
    </div>

    <div className={styles.formRow}>
      <label>
        Name:
        <input
          type="text"
          value={tableName}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Enter table name"
          maxLength={50}
        />
      </label>
    </div>
    
    <div className={styles.formRow}>
      <label>
        Width:
        <input
          type="number"
          value={tableWidth}
          onChange={(e) => onWidthChange(parseInt(e.target.value) || 2000)}
          min="500"
          max="10000"
          step="100"
        />
      </label>
      <label>
        Height:
        <input
          type="number"
          value={tableHeight}
          onChange={(e) => onHeightChange(parseInt(e.target.value) || 2000)}
          min="500"
          max="10000"
          step="100"
        />
      </label>
    </div>
    
    <div className={styles.formActions}>
      <button onClick={onCreate} className={styles.confirmButton}>
        Create Table
      </button>
      <button onClick={onCancel} className={styles.cancelButton}>
        Cancel
      </button>
    </div>
  </div>
);
