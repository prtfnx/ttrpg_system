export { AuthGuard } from './components/AuthGuard';
export { EnhancedLogin } from './components/EnhancedLogin';
export { LoginModal } from './components/LoginModal';
export { UserMenu } from './components/UserMenu';
export { AuthContext, useAuth } from './components/AuthContext';

export { useAuthenticatedWebSocket } from './hooks/useAuthenticatedWebSocket';

export { authService, type UserInfo } from './services/auth.service';
export { enhancedAuthService } from './services/enhancedAuth.service';
