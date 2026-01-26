# Authentication System

A comprehensive, secure authentication system for the TTRPG web client integrating with the FastAPI server backend.

## Architecture Overview

### Server-Side (FastAPI)
- **JWT + HTTP-only Cookies**: Secure token storage preventing XSS attacks
- **Multi-source Authentication**: Supports tokens from cookies, Authorization headers, and query parameters
- **Role-based Access Control**: DM role (session owner) vs Player role with automatic determination
- **Rate Limiting**: Built-in protection against brute force attacks
- **WebSocket Authentication**: JWT validation for real-time game connections
- **Password Hashing**: bcrypt for secure password storage

### Client-Side (React + TypeScript)
- **React Context**: Centralized authentication state management
- **Token Management**: Automatic token extraction and validation
- **Role-based UI**: Components that adapt based on user role
- **Security Best Practices**: HTTP-only cookies, CSRF protection, input validation

## Components

### AuthProvider
React context provider that manages authentication state across the application.

```tsx
import { AuthProvider } from './components/Auth';

function App() {
  return (
    <AuthProvider>
      <YourApp />
    </AuthProvider>
  );
}
```

### useAuth Hook
Hook for accessing authentication state and methods in components.

```tsx
import { useAuth } from './components/Auth';

function MyComponent() {
  const { user, isAuthenticated, login, logout, loading, error } = useAuth();
  
  if (loading) return <div>Loading...</div>;
  if (!isAuthenticated) return <div>Please login</div>;
  
  return (
    <div>
      Welcome, {user?.username}! Your role: {user?.role}
    </div>
  );
}
```

### LoginModal
Production-ready login modal with validation and error handling.

```tsx
import { LoginModal } from './components/Auth';

function Header() {
  const [showLogin, setShowLogin] = useState(false);
  
  return (
    <>
      <button onClick={() => setShowLogin(true)}>Login</button>
      <LoginModal 
        isOpen={showLogin} 
        onClose={() => setShowLogin(false)} 
      />
    </>
  );
}
```

### UserMenu
User profile dropdown with role indicator and logout functionality.

```tsx
import { UserMenu } from './components/Auth';

function Header() {
  return (
    <div className="header">
      <h1>TTRPG Client</h1>
      <UserMenu />
    </div>
  );
}
```

### AuthGuard
Protects routes/components based on authentication status and role requirements.

```tsx
import { AuthGuard } from './components/Auth';

function DMPanel() {
  return (
    <AuthGuard requireRole="dm">
      <div>DM-only content here</div>
    </AuthGuard>
  );
}

function ProtectedContent() {
  return (
    <AuthGuard fallback={<div>Please login to continue</div>}>
      <div>Authenticated content here</div>
    </AuthGuard>
  );
}
```

### Role-based Components
Components that show/hide content based on user role.

```tsx
import { DMOnly, PlayerOnly, RoleBased } from './components/Auth';

function GameInterface() {
  return (
    <div>
      <DMOnly>
        <button>Create Monster</button>
        <button>Edit Map</button>
      </DMOnly>
      
      <PlayerOnly>
        <button>Roll Initiative</button>
      </PlayerOnly>
      
      <RoleBased allowedRoles={['dm', 'player']}>
        <button>Chat</button>
      </RoleBased>
    </div>
  );
}
```

## Authentication Flow

### 1. Login Process
1. User submits username/password via LoginModal
2. Client sends POST request to `/users/login` with form data
3. Server validates credentials and creates JWT token
4. Server sets HTTP-only cookie with token and redirects
5. Client re-initializes auth service to extract user info
6. Auth state updates and UI reflects authenticated status

### 2. Session Management
1. On app load, AuthProvider calls `authService.initialize()`
2. Service attempts to validate existing cookie via `/users/me`
3. If valid, user info is extracted and stored in context
4. If invalid, user remains unauthenticated
5. WebSocket connections use cookie for authentication

### 3. Role Determination
- **DM Role**: User owns the game session (`session.owner_id === user.id`)
- **Player Role**: User is a participant in the session
- Roles are session-specific, same user can be DM in one session and player in another

### 4. Logout Process
1. User clicks logout button in UserMenu
2. Client calls `authService.logout()`
3. Redirects to `/users/logout` which clears server-side cookie
4. Auth state resets to unauthenticated
5. UI updates to show login options

## API Endpoints

### Authentication Endpoints
- `POST /users/login` - User login with form data
- `GET /users/logout` - Logout and clear cookie
- `POST /users/register` - User registration
- `GET /users/me` - Get current user info
- `GET /users/dashboard` - Get user sessions and dashboard data

### WebSocket Authentication
- WebSocket connections authenticate via cookie header
- Token can also be provided via query parameter or Authorization header
- User role determined by session ownership

## Security Features

### Client-Side Security
- **HTTP-only Cookies**: Tokens cannot be accessed via JavaScript
- **Input Validation**: Client-side validation with server-side backup
- **CSRF Protection**: SameSite cookie attribute prevents CSRF attacks
- **Rate Limiting**: Client respects server rate limits
- **Secure Transmission**: All auth requests use HTTPS in production

### Server-Side Security
- **Password Hashing**: bcrypt with proper salt rounds
- **JWT Security**: Signed tokens with expiration
- **Rate Limiting**: IP-based rate limiting for login/registration
- **Input Sanitization**: All user input properly sanitized
- **Session Security**: Secure cookie settings in production

## Configuration

### Environment Variables
```bash
# Server configuration
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=360

# Cookie settings (production)
SECURE_COOKIES=true
SAMESITE_STRICT=true
```

### Client Configuration
```typescript
// Auth service configuration
const AUTH_CONFIG = {
  RATE_LIMIT: 10,
  RATE_LIMIT_WINDOW: 10000,
  LOGIN_ENDPOINT: '/users/login',
  LOGOUT_ENDPOINT: '/users/logout',
  REGISTER_ENDPOINT: '/users/register',
  USER_INFO_ENDPOINT: '/users/me'
};
```

## Error Handling

### Common Error Scenarios
- **Invalid Credentials**: Clear error message, no sensitive info leaked
- **Rate Limiting**: Informative countdown timer
- **Network Errors**: Graceful degradation with retry options
- **Token Expiration**: Automatic re-authentication prompts
- **Role Insufficient**: Clear permission denied messages

### Error Recovery
- Automatic token refresh attempts
- Graceful fallback to login prompt
- Preserved user intent (redirect after login)
- Clear error messaging without sensitive details

## Testing

### Unit Tests
- Authentication state management
- Component rendering based on auth status
- API integration with mock servers
- Role-based access control logic

### Integration Tests
- Full login/logout flow
- WebSocket authentication
- Cross-component auth state sharing
- Error boundary behavior

### Security Tests
- XSS prevention with HTTP-only cookies
- CSRF protection validation
- Rate limiting effectiveness
- Input validation coverage

## Performance

### Optimizations
- Lazy loading of auth components
- Minimal re-renders via React.memo
- Efficient token validation caching
- Debounced auth status checks

### Monitoring
- Authentication success/failure rates
- Token refresh frequency
- Component render performance
- WebSocket connection stability

## Browser Support

### Compatibility
- **Modern Browsers**: Chrome 90+, Firefox 90+, Safari 14+, Edge 90+
- **Cookie Support**: Required for authentication
- **WebSocket**: Required for real-time features
- **Fetch API**: Used for all HTTP requests

### Fallbacks
- XMLHttpRequest fallback for older browsers
- LocalStorage backup for development
- Progressive enhancement for auth features

## Development

### Local Development
1. Start the FastAPI server: `cd server_host && python main.py`
2. Start the React client: `cd clients/web/web-ui && npm run dev`
3. Navigate to `http://localhost:3000`
4. Use test accounts or register new ones

### Debug Mode
Set `DEBUG=true` in environment to enable:
- Detailed authentication logs
- Token validation debugging
- Network request/response logging
- Component state inspection

## Best Practices

### Implementation
- Always wrap app with AuthProvider
- Use AuthGuard for protected routes
- Implement proper loading states
- Handle all error scenarios gracefully
- Use TypeScript for type safety

### Security
- Never store tokens in localStorage
- Always validate on server-side
- Use HTTPS in production
- Implement proper CORS policies
- Regular security audits

### UX/UI
- Clear authentication states
- Intuitive role indicators
- Smooth login/logout transitions
- Accessible form inputs
- Mobile-responsive design

## Migration Guide

### From Legacy System
1. Wrap app with new AuthProvider
2. Replace old auth checks with useAuth hook
3. Update components to use new auth components
4. Test role-based access control
5. Verify WebSocket authentication
6. Update any custom auth logic

### Breaking Changes
- Context API replaces old auth state management
- New component names and props
- Updated TypeScript interfaces
- Different error handling patterns