// Auth component exports
export { AuthGuard, AuthContext as AuthProvider, LoginModal, UserMenu, useAuth } from '@features/auth';
export { RoleBased as DMOnly, RoleBased as PlayerOnly, RoleBased } from '@shared/components';

// Re-export everything from features/auth
export * from '@features/auth';
