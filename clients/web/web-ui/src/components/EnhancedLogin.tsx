/**
 * Enhanced Login Component
 * Production-ready login with OAuth integration, security features,
 * and comprehensive error handling
 */

import React, { useEffect, useRef, useState } from 'react';
import type { LoginCredentials, OAuthProvider, RegisterCredentials } from '../services/enhancedAuth.service';
import { enhancedAuthService } from '../services/enhancedAuth.service';
import { ErrorBoundary } from './common/ErrorBoundary';
import { LoadingSpinner } from './common/LoadingSpinner';
import './EnhancedLogin.css';

interface PasswordStrength {
  score: number;
  feedback: string[];
  isStrong: boolean;
  level: string;
}

const EnhancedLogin: React.FC = () => {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [oauthProviders, setOauthProviders] = useState<OAuthProvider[]>([]);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  
  // Form data
  const [loginData, setLoginData] = useState<LoginCredentials>({
    username: '',
    password: '',
    rememberMe: false
  });
  
  const [registerData, setRegisterData] = useState<RegisterCredentials>({
    username: '',
    email: '',
    password: '',
    fullName: '',
    acceptTerms: false
  });
  
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStrength, setPasswordStrength] = useState<PasswordStrength>({
    score: 0,
    feedback: [],
    isStrong: false,
    level: ''
  });

  // Refs for focus management
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Load OAuth providers
    loadOAuthProviders();
    
    // Focus username field on mount
    if (usernameRef.current) {
      usernameRef.current.focus();
    }
  }, []);

  useEffect(() => {
    // Check password strength when register password changes
    if (!isLoginMode && registerData.password) {
      setPasswordStrength(checkPasswordStrength(registerData.password));
    }
  }, [isLoginMode, registerData.password]);

  const loadOAuthProviders = async () => {
    try {
      const providers = await enhancedAuthService.getOAuthProviders();
      setOauthProviders(providers.filter(p => p.isEnabled));
    } catch (error) {
      console.error('Failed to load OAuth providers:', error);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await enhancedAuthService.login({
        ...loginData,
        rememberMe
      });

      if (result.success) {
        // Login successful, auth state will be updated automatically
      } else {
        setError(result.error?.message || 'Login failed');
      }
    } catch (error) {
      // Handle different error types appropriately
      let errorMessage = 'An unexpected error occurred';
      if (error instanceof Error) {
        if (error.message.toLowerCase().includes('network') || 
            error.message.toLowerCase().includes('fetch')) {
          errorMessage = 'Network error - please check your connection';
        } else {
          errorMessage = error.message;
        }
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    // Validate passwords match
    if (registerData.password !== confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    // Validate password strength
    if (!passwordStrength.isStrong) {
      setError('Please choose a stronger password');
      setIsLoading(false);
      return;
    }

    if (!acceptTerms) {
      setError('You must accept the terms and conditions');
      setIsLoading(false);
      return;
    }

    try {
      const result = await enhancedAuthService.register({
        ...registerData,
        email: registerData.email.trim(), // Trim email for submission
        acceptTerms
      });

      if (result.success) {
        setSuccess('Registration successful! Please check your email to verify your account.');
        setIsLoginMode(true);
        // Reset form
        setRegisterData({
          username: '',
          email: '',
          password: '',
          fullName: '',
          acceptTerms: false
        });
        setConfirmPassword('');
        setAcceptTerms(false);
      } else {
        setError(result.error?.message || 'Registration failed');
      }
    } catch (error) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuthLogin = async (provider: string) => {
    setError(null);
    setIsLoading(true);

    try {
      await enhancedAuthService.oauthLogin(provider);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'OAuth login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    try {
      const result = await enhancedAuthService.requestPasswordReset({
        email: resetEmail
      });

      if (result.success) {
        setSuccess('Password reset instructions have been sent');
        setShowForgotPassword(false);
        setResetEmail('');
      } else {
        setError(result.error?.message || 'Password reset request failed');
      }
    } catch (error) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const checkPasswordStrength = (password: string): PasswordStrength => {
    const feedback: string[] = [];
    let score = 0;

    if (password.length >= 8) score += 1;
    else feedback.push('Use at least 8 characters');

    if (password.length >= 12) score += 1;
    else if (password.length >= 8) feedback.push('Consider using 12+ characters for better security');

    if (/[a-z]/.test(password)) score += 1;
    else feedback.push('Add lowercase letters');

    if (/[A-Z]/.test(password)) score += 1;
    else feedback.push('Add uppercase letters');

    if (/[0-9]/.test(password)) score += 1;
    else feedback.push('Add numbers');

    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    else feedback.push('Add special characters');

    // Check for patterns and minimum quality
    if (password.length >= 6 && !/(.)\1{2,}/.test(password)) score += 1;
    else if (password.length <= 5) feedback.push('Password too short');
    else feedback.push('Avoid repeated characters');

    const isStrong = score >= 5 && password.length >= 8;
    
    let level = '';
    if (score <= 1) level = 'Very Weak';
    else if (score <= 2) level = 'Weak';
    else if (score <= 3) level = 'Fair';
    else if (score <= 4) level = 'Good';
    else level = 'Strong';

    return {
      score: Math.min(score, 5),
      feedback: isStrong ? [] : feedback, // Empty feedback for strong passwords to avoid duplicate "Strong" text
      isStrong,
      level
    };
  };

  const getPasswordStrengthColor = (score: number): string => {
    if (score <= 2) return '#ff4757'; // Red
    if (score <= 3) return '#ffa502'; // Orange
    if (score <= 4) return '#ffda79'; // Yellow
    return '#2ed573'; // Green
  };

  const toggleMode = () => {
    setIsLoginMode(!isLoginMode);
    setError(null);
    setSuccess(null);
    setShowForgotPassword(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isLoginMode) {
        handleLogin(e as any);
      } else {
        handleRegister(e as any);
      }
    }
  };

  if (showForgotPassword) {
    return (
      <ErrorBoundary>
        <div className="auth-container">
          <div className="auth-card">
            <div className="auth-header">
              <h2>Reset Password</h2>
              <p>Enter your email address and we'll send you instructions to reset your password.</p>
            </div>

            {error && (
              <div className="error-message" role="alert" aria-live="polite">
                <span className="error-icon">⚠️</span>
                {error}
              </div>
            )}

            {success && (
              <div className="success-message" role="alert" aria-live="polite">
                <span className="success-icon">✅</span>
                {success}
              </div>
            )}

            <form onSubmit={handleForgotPassword} className="auth-form">
              <div className="form-group">
                <label htmlFor="reset-email">Email Address</label>
                <input
                  id="reset-email"
                  type="email"
                  value={resetEmail}
                  onChange={(e) => {
                    setResetEmail(e.target.value);
                    // Clear errors when user types
                    if (error) setError(null);
                  }}
                  required
                  autoFocus
                  disabled={isLoading}
                  placeholder="Enter your email address"
                />
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(false)}
                  className="secondary-btn"
                  disabled={isLoading}
                >
                  Back to Sign In
                </button>
                <button
                  type="submit"
                  className="primary-btn"
                  disabled={isLoading || !resetEmail.trim()}
                >
                  {isLoading ? <LoadingSpinner size="small" /> : 'Send Reset Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h2>{isLoginMode ? 'Welcome Back' : 'Create Account'}</h2>
            <p>
              {isLoginMode 
                ? 'Sign in to access your TTRPG campaigns' 
                : 'Join the adventure and create your account'
              }
            </p>
          </div>

          {error && (
            <div className="error-message" role="alert" aria-live="polite">
              <span className="error-icon">⚠️</span>
              {error}
            </div>
          )}

          {success && (
            <div className="success-message" role="alert" aria-live="polite">
              <span className="success-icon">✅</span>
              {success}
            </div>
          )}

          {/* OAuth Providers */}
          {oauthProviders.length > 0 && (
            <div className="oauth-section">
              <div className="oauth-divider">
                <span>Continue with</span>
              </div>
              <div className="oauth-providers">
                {oauthProviders.map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    className="oauth-btn"
                    onClick={() => handleOAuthLogin(provider.id)}
                    disabled={isLoading}
                  >
                    <img src={provider.icon} alt={provider.name} className="oauth-icon" />
                    {provider.name}
                  </button>
                ))}
              </div>
              <div className="oauth-divider">
                <span>or</span>
              </div>
            </div>
          )}

          {/* Login Form */}
          {isLoginMode ? (
            <form onSubmit={handleLogin} className="auth-form" onKeyDown={handleKeyDown}>
              <div className="form-group">
                <label htmlFor="login-username">Username or Email</label>
                <input
                  id="login-username"
                  ref={usernameRef}
                  type="text"
                  value={loginData.username}
                  onChange={(e) => {
                    setLoginData(prev => ({ ...prev, username: e.target.value }));
                    // Clear errors when user types
                    if (error) setError(null);
                  }}
                  required
                  autoComplete="username"
                  disabled={isLoading}
                  placeholder="Enter your username or email"
                />
              </div>

              <div className="form-group">
                <label htmlFor="login-password">Password</label>
                <div className="password-input-group">
                  <input
                    id="login-password"
                    ref={passwordRef}
                    type={showPassword ? 'text' : 'password'}
                    value={loginData.password}
                    onChange={(e) => {
                      setLoginData(prev => ({ ...prev, password: e.target.value }));
                      // Clear errors when user types
                      if (error) setError(null);
                    }}
                    required
                    autoComplete="current-password"
                    disabled={isLoading}
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isLoading}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>

              <div className="form-options">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    disabled={isLoading}
                  />
                  <span className="checkmark"></span>
                  Remember me
                </label>
                <button
                  type="button"
                  className="forgot-password-link"
                  onClick={() => setShowForgotPassword(true)}
                  disabled={isLoading}
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                className="primary-btn"
                disabled={isLoading || !loginData.username.trim() || !loginData.password.trim()}
              >
                {isLoading ? <LoadingSpinner size="small" /> : 'Sign In'}
              </button>
            </form>
          ) : (
            /* Register Form */
            <form onSubmit={handleRegister} className="auth-form" onKeyDown={handleKeyDown}>
              <div className="form-group">
                <label htmlFor="register-username">Username *</label>
                <input
                  id="register-username"
                  ref={usernameRef}
                  type="text"
                  value={registerData.username}
                  onChange={(e) => setRegisterData(prev => ({ ...prev, username: e.target.value }))}
                  required
                  autoComplete="username"
                  disabled={isLoading}
                  placeholder="Choose a username"
                />
              </div>

              <div className="form-group">
                <label htmlFor="register-email">Email Address *</label>
                <input
                  id="register-email"
                  ref={emailRef}
                  type="text"
                  value={registerData.email}
                  onChange={(e) => {
                    // Keep the original value for UX, don't trim in the field
                    setRegisterData(prev => ({ ...prev, email: e.target.value }));
                  }}
                  required
                  autoComplete="email"
                  disabled={isLoading}
                  placeholder="Enter your email"
                  pattern="[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$"
                />
              </div>

              <div className="form-group">
                <label htmlFor="register-fullname">Full Name</label>
                <input
                  id="register-fullname"
                  type="text"
                  value={registerData.fullName}
                  onChange={(e) => setRegisterData(prev => ({ ...prev, fullName: e.target.value }))}
                  autoComplete="name"
                  disabled={isLoading}
                  placeholder="Enter your full name (optional)"
                />
              </div>

              <div className="form-group">
                <label htmlFor="register-password">Password *</label>
                <div className="password-input-group">
                  <input
                    id="register-password"
                    type={showPassword ? 'text' : 'password'}
                    value={registerData.password}
                    onChange={(e) => setRegisterData(prev => ({ ...prev, password: e.target.value }))}
                    required
                    autoComplete="new-password"
                    disabled={isLoading}
                    placeholder="Create a strong password"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isLoading}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
                
                {/* Password Strength Indicator */}
                {registerData.password && (
                  <div className="password-strength">
                    <div className="strength-bar">
                      <div 
                        className="strength-fill"
                        style={{
                          width: `${(passwordStrength.score / 5) * 100}%`,
                          backgroundColor: getPasswordStrengthColor(passwordStrength.score)
                        }}
                      ></div>
                    </div>
                    <div className="strength-level">
                      {passwordStrength.level}
                    </div>
                    <div className="strength-feedback">
                      {passwordStrength.isStrong ? (
                        <div className="success">
                          ✅ Excellent password security!
                        </div>
                      ) : (
                        passwordStrength.feedback.map((feedback, index) => (
                          <div key={index} className="warning">
                            ⚠️ {feedback}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="confirm-password">Confirm Password *</label>
                <div className="password-input-group">
                  <input
                    id="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    disabled={isLoading}
                    placeholder="Confirm your password"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    disabled={isLoading}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
                {confirmPassword && registerData.password && confirmPassword !== registerData.password && (
                  <div className="password-mismatch">
                    ⚠️ Passwords do not match
                  </div>
                )}
              </div>

              <div className="form-options">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    disabled={isLoading}
                    required
                  />
                  <span className="checkmark"></span>
                  I agree to the{' '}
                  <a href="/terms" target="_blank" rel="noopener noreferrer">
                    Terms of Service
                  </a>{' '}
                  and{' '}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer">
                    Privacy Policy
                  </a>
                </label>
              </div>

              <button
                type="submit"
                className="primary-btn"
                disabled={
                  isLoading || 
                  !registerData.username.trim() || 
                  !registerData.email.trim() || 
                  !registerData.password.trim() ||
                  !confirmPassword.trim() ||
                  registerData.password !== confirmPassword ||
                  !passwordStrength.isStrong ||
                  !acceptTerms
                }
              >
                {isLoading ? <LoadingSpinner size="small" /> : 'Create Account'}
              </button>
            </form>
          )}

          {/* Toggle Mode */}
          <div className="auth-toggle">
            <p>
              {isLoginMode ? "Don't have an account? " : "Already have an account? "}
              <button
                type="button"
                className="toggle-btn"
                onClick={toggleMode}
                disabled={isLoading}
              >
                {isLoginMode ? 'Sign Up' : 'Sign In'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default EnhancedLogin;

// Also provide named export for compatibility
export { EnhancedLogin };
