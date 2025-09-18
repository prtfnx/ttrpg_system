import React from 'react';
import './Auth.css';
import { useAuth } from './AuthContext';
import LoginModal from './LoginModal';

interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  requireRole?: 'dm' | 'player';
}

/**
 * AuthGuard component that protects routes/components based on authentication status
 * and optionally role requirements
 */
const AuthGuard: React.FC<AuthGuardProps> = ({ 
  children, 
  fallback, 
  requireRole 
}) => {
  const { user, isAuthenticated, loading } = useAuth();
  const [showLoginModal, setShowLoginModal] = React.useState(false);

  // Show loading state while auth is being initialized
  if (loading) {
    return (
      <div className="auth-loading">
        Authenticating...
      </div>
    );
  }

  // If not authenticated, show fallback or login modal
  if (!isAuthenticated) {
    if (fallback) {
      return <>{fallback}</>;
    }
    
    return (
      <>
        <div className="auth-guard-message">
          <h3>Authentication Required</h3>
          <p>You must be logged in to access this content.</p>
          <button 
            onClick={() => setShowLoginModal(true)}
            className="login-button"
          >
            Login
          </button>
        </div>
        <LoginModal 
          isOpen={showLoginModal} 
          onClose={() => setShowLoginModal(false)} 
        />
      </>
    );
  }

  // If role is required and user doesn't have it
  if (requireRole && user?.role !== requireRole) {
    return (
      <div className="auth-guard-message">
        <h3>Access Denied</h3>
        <p>
          You need {requireRole === 'dm' ? 'Dungeon Master' : 'Player'} 
          {' '}permissions to access this content.
        </p>
        <p>Your current role: <span className={`role-indicator ${user?.role}`}>{user?.role}</span></p>
      </div>
    );
  }

  // User is authenticated and has required role (if any)
  return <>{children}</>;
};

export default AuthGuard;