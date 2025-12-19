import clsx from 'clsx';
import React from 'react';
import './Auth.css';
import { useAuth } from './AuthContext';
import styles from './UserMenu.module.css';

const UserMenu: React.FC = () => {
  const { user, logout } = useAuth();
  
  if (!user) return null;
  
  return (
    <div className={styles.userMenu} data-user-role={user.role}>
      <div className={styles.userInfo}>
        <span className={styles.username}>{user.username}</span>
        <span className={clsx(styles.roleIndicator, styles[user.role])}>
          {user.role}
        </span>
      </div>
      <button onClick={logout} className={styles.logoutButton}>
        Logout
      </button>
    </div>
  );
};

export default UserMenu;
