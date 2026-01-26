import React from 'react';
import './Auth.css';
import { useAuth } from './AuthContext';

const UserMenu: React.FC = () => {
  const { user, logout } = useAuth();
  
  if (!user) return null;
  
  return (
    <div className="user-menu" data-user-role={user.role}>
      <div className="user-info">
        <span className="username">{user.username}</span>
        <span className={`role-indicator ${user.role}`}>
          {user.role}
        </span>
      </div>
      <button onClick={logout} className="logout-button">
        Logout
      </button>
    </div>
  );
};

export default UserMenu;
