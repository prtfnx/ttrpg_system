import React from 'react';
import styles from './SessionManagementPanel.module.css';

interface CollapsedViewProps {
  sessionCode: string;
  onToggle: () => void;
}

export const CollapsedView: React.FC<CollapsedViewProps> = ({ sessionCode, onToggle }) => {
  return (
    <div className={styles.collapsed}>
      <button className={styles.toggle} onClick={onToggle}>
        👥 Manage Players
      </button>
      <a 
        href={`/game/session/${sessionCode}/admin`} 
        className={styles.adminLink} 
        target="_blank" 
        rel="noopener noreferrer"
      >
        ⚙️ Admin Panel
      </a>
    </div>
  );
};