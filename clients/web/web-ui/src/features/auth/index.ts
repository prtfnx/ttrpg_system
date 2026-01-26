export { AuthContext, AuthProvider, useAuth } from './components/AuthContext';
export { default as AuthGuard } from './components/AuthGuard';
export { default as EnhancedLogin } from './components/EnhancedLogin';
export { default as LoginModal } from './components/LoginModal';
export { default as UserMenu } from './components/UserMenu';

export { useAuthenticatedWebSocket } from './hooks/useAuthenticatedWebSocket';

export { authService, type SessionInfo, type UserInfo } from './services/auth.service';
export { enhancedAuthService } from './services/enhancedAuth.service';

