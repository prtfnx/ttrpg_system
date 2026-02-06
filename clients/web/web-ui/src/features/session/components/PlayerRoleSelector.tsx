import React, { useEffect, useRef, useState } from 'react';
import type { SessionRole } from '../types';
import styles from './PlayerRoleSelector.module.css';

interface PlayerRoleSelectorProps {
  currentRole: SessionRole;
  canEdit: boolean;
  onChange: (newRole: SessionRole) => void;
  disabled?: boolean;
}

const ROLE_OPTIONS: { value: SessionRole; label: string; description: string }[] = [
  { value: 'owner', label: 'Owner', description: 'Session owner with full control' },
  { value: 'co_dm', label: 'Co-DM', description: 'Can control most game elements' },
  { value: 'trusted_player', label: 'Trusted Player', description: 'Extended permissions' },
  { value: 'player', label: 'Player', description: 'Standard player permissions' },
  { value: 'spectator', label: 'Spectator', description: 'Read-only access' }
];

export const PlayerRoleSelector: React.FC<PlayerRoleSelectorProps> = ({
  currentRole,
  canEdit,
  onChange,
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownStyle({
        top: `${rect.bottom + 4}px`,
        left: `${rect.left}px`,
        minWidth: `${rect.width}px`
      });
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  if (!canEdit) {
    const roleLabel = ROLE_OPTIONS.find(r => r.value === currentRole)?.label || currentRole;
    return <span className={styles.roleLabel}>{roleLabel}</span>;
  }

  return (
    <div className={styles.selector}>
      <button
        ref={triggerRef}
        className={styles.trigger}
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
      >
        {ROLE_OPTIONS.find(r => r.value === currentRole)?.label || currentRole}
      </button>

      {isOpen && (
        <div ref={dropdownRef} className={styles.dropdown} style={dropdownStyle}>
          {ROLE_OPTIONS.map(option => (
            <button
              key={option.value}
              className={`${styles.option} ${currentRole === option.value ? styles.active : ''}`}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              disabled={disabled}
            >
              <span className={styles.optionLabel}>{option.label}</span>
              <span className={styles.optionDesc}>{option.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};