import React, { useState } from 'react';
import { InvitationManager } from '../../components/Invitations/InvitationManager';
import type { UserInfo } from '../../services/auth.service';
import type { SessionRole } from '../../types/roles';
import styles from './AdminPanel.module.css';
import { AuditLogTab } from './tabs/AuditLogTab';
import { PlayersTab } from './tabs/PlayersTab';
import { SessionSettingsTab } from './tabs/SessionSettingsTab';

interface AdminPanelProps {
  sessionCode: string;
  sessionName: string;
  userRole: SessionRole;
  userInfo: UserInfo;
}

type TabType = 'players' | 'invitations' | 'settings' | 'audit';

export const AdminPanel: React.FC<AdminPanelProps> = ({
  sessionCode,
  sessionName,
  userRole,
  userInfo,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('players');

  const isOwner = userRole === 'owner';
  const canManage = userRole === 'owner' || userRole === 'co_dm';

  if (!canManage) {
    return (
      <div className={styles.error}>
        <h1>Access Denied</h1>
        <p>You need to be a session owner or co-DM to access this page.</p>
        <a href={`/game/session/${sessionCode}`}>← Back to Game</a>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <h1 className={styles.title}>🏰 {sessionName} - Admin Panel</h1>
          <div className={styles.headerRight}>
            <span className={styles.role}>{userRole === 'owner' ? '👑 Owner' : '🎩 Co-DM'}</span>
            <a href={`/game/session/${sessionCode}`} className={styles.backButton}>
              ← Back to Game
            </a>
          </div>
        </div>

        <nav className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'players' ? styles.active : ''}`}
            onClick={() => setActiveTab('players')}
          >
            👥 Players & Roles
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'invitations' ? styles.active : ''}`}
            onClick={() => setActiveTab('invitations')}
          >
            📧 Invitations
          </button>
          {isOwner && (
            <button
              className={`${styles.tab} ${activeTab === 'settings' ? styles.active : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              ⚙️ Settings
            </button>
          )}
          <button
            className={`${styles.tab} ${activeTab === 'audit' ? styles.active : ''}`}
            onClick={() => setActiveTab('audit')}
          >
            📋 Audit Log
          </button>
        </nav>
      </header>

      <main className={styles.main}>
        {activeTab === 'players' && (
          <PlayersTab sessionCode={sessionCode} userInfo={userInfo} userRole={userRole} />
        )}
        {activeTab === 'invitations' && (
          <div className={styles.tabContent}>
            <InvitationManager sessionCode={sessionCode} onClose={() => setActiveTab('players')} />
          </div>
        )}
        {activeTab === 'settings' && isOwner && (
          <SessionSettingsTab sessionCode={sessionCode} />
        )}
        {activeTab === 'audit' && (
          <AuditLogTab sessionCode={sessionCode} />
        )}
      </main>
    </div>
  );
};
