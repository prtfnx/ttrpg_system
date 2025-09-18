import React from 'react';
import { useAuth } from './AuthContext';
import './Auth.css';

interface RoleBasedProps {
  children: React.ReactNode;
  allowedRoles: ('dm' | 'player')[];
  fallback?: React.ReactNode;
}

/**
 * Component that shows content based on user role
 */
const RoleBased: React.FC<RoleBasedProps> = ({ 
  children, 
  allowedRoles, 
  fallback = null 
}) => {
  const { user } = useAuth();

  if (!user || !allowedRoles.includes(user.role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

// Convenience components for common role checks
export const DMOnly: React.FC<{ children: React.ReactNode; fallback?: React.ReactNode }> = ({ 
  children, 
  fallback = null 
}) => (
  <RoleBased allowedRoles={['dm']} fallback={fallback}>
    {children}
  </RoleBased>
);

export const PlayerOnly: React.FC<{ children: React.ReactNode; fallback?: React.ReactNode }> = ({ 
  children, 
  fallback = null 
}) => (
  <RoleBased allowedRoles={['player']} fallback={fallback}>
    {children}
  </RoleBased>
);

export default RoleBased;