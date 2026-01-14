import React from 'react';
import './Auth.css';
import { useAuth } from './AuthContext';
import styles from './AuthGuard.module.css';
import LoginModal from './LoginModal';

interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * AuthGuard component that protects routes/components based on authentication status
 * Note: Role-based access control should be done at component level, not here
 */
const AuthGuard: React.FC<AuthGuardProps> = ({ 
  children, 
  fallback
}) => {
  const { isAuthenticated, loading } = useAuth();
  const [showLoginModal, setShowLoginModal] = React.useState(false);

  // Show loading state while auth is being initialized
  if (loading) {
    return (
      <div className={styles.authLoading}>
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
        <div className={styles.authGuardMessage}>
          <h3>Authentication Required</h3>
          <p>You must be logged in to access this content.</p>
          <button 
            onClick={() => setShowLoginModal(true)}
            className={styles.loginButton}
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

  return <>{children}</>;
};

export default AuthGuard;

