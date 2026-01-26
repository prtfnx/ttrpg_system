// Auth component exports
export { AuthContext as AuthProvider, useAuth, AuthGuard, LoginModal, UserMenu } from '@features/auth';
export { RoleBased, RoleBased as DMOnly, RoleBased as PlayerOnly } from '@shared/components';

// Re-export everything from features/auth
export * from '@features/auth';
