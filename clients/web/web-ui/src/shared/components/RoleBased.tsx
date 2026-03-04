import { useGameStore } from '@/store';
import { canInteract, DM_ROLES, ELEVATED_ROLES, isDM, isElevated, type SessionRole } from '@features/session/types/roles';
import React from 'react';

interface RoleBasedProps {
  children: React.ReactNode;
  allowedRoles: SessionRole[];
  fallback?: React.ReactNode;
}

const RoleBased: React.FC<RoleBasedProps> = ({ children, allowedRoles, fallback = null }) => {
  const sessionRole = useGameStore(s => s.sessionRole);
  if (!sessionRole || !allowedRoles.includes(sessionRole)) return <>{fallback}</>;
  return <>{children}</>;
};

export const DMOnly: React.FC<{ children: React.ReactNode; fallback?: React.ReactNode }> = ({
  children, fallback = null
}) => {
  const sessionRole = useGameStore(s => s.sessionRole);
  if (!isDM(sessionRole)) return <>{fallback}</>;
  return <>{children}</>;
};

export const ElevatedOnly: React.FC<{ children: React.ReactNode; fallback?: React.ReactNode }> = ({
  children, fallback = null
}) => {
  const sessionRole = useGameStore(s => s.sessionRole);
  if (!isElevated(sessionRole)) return <>{fallback}</>;
  return <>{children}</>;
};

export const InteractiveOnly: React.FC<{ children: React.ReactNode; fallback?: React.ReactNode }> = ({
  children, fallback = null
}) => {
  const sessionRole = useGameStore(s => s.sessionRole);
  if (!canInteract(sessionRole)) return <>{fallback}</>;
  return <>{children}</>;
};

// Kept for backward compatibility with any existing code using PlayerOnly
export const PlayerOnly: React.FC<{ children: React.ReactNode; fallback?: React.ReactNode }> = ({
  children, fallback = null
}) => (
  <RoleBased allowedRoles={[...DM_ROLES, ...ELEVATED_ROLES, 'player']} fallback={fallback}>
    {children}
  </RoleBased>
);

export default RoleBased;
