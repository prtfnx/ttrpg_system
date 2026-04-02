import React from 'react';
import { Settings, Users } from 'lucide-react';
import styles from './SessionManagementPanel.module.css';

interface CollapsedViewProps {
  sessionCode: string;
  onToggle: () => void;
}

export const CollapsedView: React.FC<CollapsedViewProps> = ({ sessionCode, onToggle }) => {
  return (
    <div className={styles.collapsed}>
      <button className={styles.toggle} onClick={onToggle}>
        <Users size={14} aria-hidden /> Manage Players
      </button>
      <a 
        href={`/game/session/${sessionCode}/admin`} 
        className={styles.adminLink} 
        target="_blank" 
        rel="noopener noreferrer"
      >
        <Settings size={14} aria-hidden /> Admin Panel
      </a>
    </div>
  );
};