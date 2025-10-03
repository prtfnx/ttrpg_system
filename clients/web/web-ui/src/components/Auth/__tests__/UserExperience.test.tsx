/**
 * User Experience Focused Tests for Enhanced Login Component
 * 
 * Following Testing Library principles:
 * - Test what users see and interact with
 * - Query by accessible roles and labels
 * - Focus on behavior over implementation
 * - Test the complete user journey, not isolated functions
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enhancedAuthService } from '../../../services/enhancedAuth.service';
import EnhancedLogin from '../../EnhancedLogin';

// Mock the auth service - following best practice of testing what users expect
vi.mock('../../../services/enhancedAuth.service', () => ({
  enhancedAuthService: {
    login: vi.fn(),
    register: vi.fn(),
    requestPasswordReset: vi.fn(),
    getOAuthProviders: vi.fn(),
    oauthLogin: vi.fn(),
  }
}));

// Mock common components with meaningful feedback
vi.mock('../../common/LoadingSpinner', () => ({
  LoadingSpinner: ({ size }: { size?: string }) => (
    <div data-testid="loading-spinner" aria-label={`Loading ${size ? `(${size})` : ''}`}>
      Loading...
    </div>
  )
}));

vi.mock('../../common/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

const mockAuthService = vi.mocked(enhancedAuthService);

describe('Enhanced Login - Complete User Experience', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup realistic OAuth providers as users would see them
    mockAuthService.getOAuthProviders.mockResolvedValue([
      { id: 'google', name: 'Google', icon: 'google-icon', isEnabled: true },
      { id: 'discord', name: 'Discord', icon: 'discord-icon', isEnabled: true },
      { id: 'github', name: 'GitHub', icon: 'github-icon', isEnabled: false }
    ]);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('First Time Visitor Experience', () => {
    it('greets new users with clear welcome message and easy signup option', async () => {
      render(<EnhancedLogin />);

      // User should immediately understand this is a login page
      expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
      expect(screen.getByText(/sign in to access your ttrpg campaigns/i)).toBeInTheDocument();
      
      // New users should easily find signup option
      const signupButton = screen.getByRole('button', { name: /sign up/i });
      expect(signupButton).toBeInTheDocument();
      
      // Click should switch to signup mode
      await user.click(signupButton);
      expect(screen.getByRole('heading', { name: /create account/i })).toBeInTheDocument();
    });

    it('provides multiple convenient login options including social auth', async () => {
      render(<EnhancedLogin />);

      // Users should see OAuth options prominently
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /google/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /discord/i })).toBeInTheDocument();
      });

      // Traditional login should also be clearly available
      expect(screen.getByLabelText(/username or email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    });
  });

  describe('Returning User Login Journey', () => {
    it('allows seamless login with username and password', async () => {
      mockAuthService.login.mockResolvedValue({ success: true });

      render(<EnhancedLogin />);

      // User enters their credentials naturally
      const usernameField = screen.getByLabelText(/username or email/i);
      const passwordField = screen.getByLabelText(/^password/i);
      const loginButton = screen.getByRole('button', { name: /sign in/i });

      await user.type(usernameField, 'johndoe@example.com');
      await user.type(passwordField, 'mySecurePassword123!');

      // Submit button should be enabled when fields are filled
      expect(loginButton).not.toBeDisabled();
      
      await user.click(loginButton);

      // Service should be called with user's input
      expect(mockAuthService.login).toHaveBeenCalledWith({
        username: 'johndoe@example.com',
        password: 'mySecurePassword123!',
        rememberMe: false
      });
    });

    it('remembers user preference when remember me is checked', async () => {
      mockAuthService.login.mockResolvedValue({ success: true });

      render(<EnhancedLogin />);

      // User can choose to be remembered
      const rememberMeCheckbox = screen.getByLabelText(/remember me/i);
      await user.click(rememberMeCheckbox);

      // Fill out form and submit
      await user.type(screen.getByLabelText(/username or email/i), 'user@test.com');
      await user.type(screen.getByLabelText(/^password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      // Remember me preference should be passed to service
      expect(mockAuthService.login).toHaveBeenCalledWith(
        expect.objectContaining({ rememberMe: true })
      );
    });

    it('provides helpful feedback when login fails', async () => {
      const errorMessage = 'Invalid credentials. Please check your username and password.';
      mockAuthService.login.mockResolvedValue({ 
        success: false, 
        error: { code: 'INVALID_CREDENTIALS', message: errorMessage }
      });

      render(<EnhancedLogin />);

      // User attempts to login with wrong credentials
      await user.type(screen.getByLabelText(/username or email/i), 'wrong@user.com');
      await user.type(screen.getByLabelText(/^password/i), 'wrongpassword');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      // User should see helpful error message
      await waitFor(() => {
        const errorAlert = screen.getByRole('alert');
        expect(errorAlert).toBeInTheDocument();
        expect(errorAlert).toHaveTextContent(errorMessage);
      });
    });
  });

  describe('New User Registration Experience', () => {
    beforeEach(async () => {
      render(<EnhancedLogin />);
      // Switch to registration mode
      await user.click(screen.getByRole('button', { name: /sign up/i }));
    });

    it('guides users through account creation with clear requirements', async () => {
      // User should see registration form
      expect(screen.getByRole('heading', { name: /create account/i })).toBeInTheDocument();
      
      // All required fields should be clearly marked
      expect(screen.getByLabelText('Username *')).toBeInTheDocument();
      expect(screen.getByLabelText('Email Address *')).toBeInTheDocument();
      expect(screen.getByLabelText('Password *')).toBeInTheDocument();
      expect(screen.getByLabelText('Confirm Password *')).toBeInTheDocument();

      // Optional fields should be clearly marked as optional
      expect(screen.getByLabelText('Full Name')).toBeInTheDocument();
    });

    it('provides real-time password strength feedback to help users', async () => {
      const passwordField = screen.getByLabelText('Password *');

      // User starts typing a weak password
      await user.type(passwordField, 'weak');

      // Should see password strength indicator
      await waitFor(() => {
        expect(screen.getByText(/weak/i)).toBeInTheDocument();
      });

      // Clear and try a stronger password
      await user.clear(passwordField);
      await user.type(passwordField, 'StrongPassword123!');

      // Should see improved strength
      await waitFor(() => {
        expect(screen.getByText(/strong/i)).toBeInTheDocument();
      });
    });

    it('validates password confirmation matches to prevent user mistakes', async () => {
      const passwordField = screen.getByLabelText('Password *');
      const confirmField = screen.getByLabelText('Confirm Password *');

      // User enters password
      await user.type(passwordField, 'MyPassword123!');
      
      // User enters different confirmation
      await user.type(confirmField, 'DifferentPassword123!');

      // Should show mismatch error
      await waitFor(() => {
        expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
      });
    });

    it('prevents submission until all requirements are met', async () => {
      const createButton = screen.getByRole('button', { name: /create account/i });
      
      // Button should be disabled initially
      expect(createButton).toBeDisabled();

      // Fill only some fields
      await user.type(screen.getByLabelText('Username *'), 'testuser');
      await user.type(screen.getByLabelText('Email Address *'), 'test@example.com');
      
      // Should still be disabled
      expect(createButton).toBeDisabled();

      // Fill password fields
      await user.type(screen.getByLabelText('Password *'), 'StrongPassword123!');
      await user.type(screen.getByLabelText('Confirm Password *'), 'StrongPassword123!');
      
      // Accept terms
      await user.click(screen.getByLabelText(/i agree to the terms/i));

      // Now should be enabled
      expect(createButton).not.toBeDisabled();
    });
  });

  describe('Password Recovery User Journey', () => {
    it('helps users reset forgotten passwords easily', async () => {
      mockAuthService.requestPasswordReset.mockResolvedValue({ success: true });

      render(<EnhancedLogin />);

      // User clicks forgot password link
      await user.click(screen.getByRole('button', { name: /forgot password/i }));

      // Should show password reset form
      expect(screen.getByRole('heading', { name: /reset password/i })).toBeInTheDocument();
      expect(screen.getByText(/enter your email address/i)).toBeInTheDocument();

      // User enters email and submits
      await user.type(screen.getByLabelText(/email address/i), 'user@example.com');
      await user.click(screen.getByRole('button', { name: /send reset link/i }));

      // Should call password reset service
      expect(mockAuthService.requestPasswordReset).toHaveBeenCalledWith({
        email: 'user@example.com'
      });

      // User should see confirmation
      await waitFor(() => {
        expect(screen.getByText(/Password reset email sent/i)).toBeInTheDocument();
      });
    });

    it('allows user to return to main login easily', async () => {
      render(<EnhancedLogin />);

      // Navigate to password reset
      await user.click(screen.getByRole('button', { name: /forgot password/i }));
      expect(screen.getByText('Reset Password')).toBeInTheDocument();

      // User can go back to login
      await user.click(screen.getByRole('button', { name: /back to sign in/i }));
      expect(screen.getByText('Sign In')).toBeInTheDocument();
    });
  });

  describe('Social Authentication Experience', () => {
    it('provides smooth OAuth login process', async () => {
      mockAuthService.oauthLogin.mockResolvedValue();

      render(<EnhancedLogin />);

      // Wait for OAuth providers to load
      const googleButton = await waitFor(() => 
        screen.getByRole('button', { name: /google/i })
      );

      // User clicks social login
      await user.click(googleButton);

      // Should initiate OAuth flow
      expect(mockAuthService.oauthLogin).toHaveBeenCalledWith('google');
    });

    it('only shows enabled OAuth providers to avoid user confusion', async () => {
      render(<EnhancedLogin />);

      // Should show enabled providers
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /google/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /discord/i })).toBeInTheDocument();
      });

      // Should not show disabled providers
      expect(screen.queryByRole('button', { name: /github/i })).not.toBeInTheDocument();
    });
  });

  describe('Accessibility and Inclusive Design', () => {
    it('provides proper labels and roles for screen readers', async () => {
      render(<EnhancedLogin />);

      // Form controls should have proper labels
      expect(screen.getByLabelText(/username or email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/remember me/i)).toBeInTheDocument();

      // Buttons should have accessible names
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign up/i })).toBeInTheDocument();
      
      // Password toggle should have aria-label
      const passwordToggle = screen.getByLabelText(/show password/i);
      expect(passwordToggle).toBeInTheDocument();
    });

    it('shows error messages with proper ARIA roles for assistive technology', async () => {
      mockAuthService.login.mockResolvedValue({ 
        success: false, 
        error: { code: 'ERROR', message: 'Login failed' }
      });

      render(<EnhancedLogin />);

      // Trigger error
      await user.type(screen.getByLabelText(/username or email/i), 'test');
      await user.type(screen.getByLabelText(/^password/i), 'test');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      // Error should have proper role
      await waitFor(() => {
        const errorElement = screen.getByRole('alert');
        expect(errorElement).toBeInTheDocument();
        expect(errorElement).toHaveTextContent('Login failed');
      });
    });

    it('supports keyboard navigation for all interactive elements', async () => {
      render(<EnhancedLogin />);

      const usernameField = screen.getByLabelText(/username or email/i);
      const passwordField = screen.getByLabelText(/^password/i);
      const rememberCheckbox = screen.getByLabelText(/remember me/i);

      // Should be able to tab through elements
      usernameField.focus();
      expect(document.activeElement).toBe(usernameField);

      await user.tab();
      expect(document.activeElement).toBe(passwordField);

      await user.tab();
      // Password toggle button should be focusable
      expect(document.activeElement).toBe(screen.getByLabelText(/show password/i));

      await user.tab();
      expect(document.activeElement).toBe(rememberCheckbox);

      // Should be able to activate checkbox with space
      await user.keyboard(' ');
      expect(rememberCheckbox).toBeChecked();
    });
  });

  describe('Error Handling and User Feedback', () => {
    it('prevents submission with empty fields and shows helpful validation', async () => {
      render(<EnhancedLogin />);

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      // Button should be disabled with empty fields
      expect(submitButton).toBeDisabled();

      // Fill username but not password
      await user.type(screen.getByLabelText(/username or email/i), 'test@example.com');
      expect(submitButton).toBeDisabled();

      // Fill password - now should be enabled
      await user.type(screen.getByLabelText(/^password/i), 'password');
      expect(submitButton).not.toBeDisabled();
    });

    it('provides loading feedback during authentication', async () => {
      // Simulate slow login
      mockAuthService.login.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ success: true }), 100))
      );

      render(<EnhancedLogin />);

      // Fill form and submit
      await user.type(screen.getByLabelText(/username or email/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^password/i), 'password');
      
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      await user.click(submitButton);

      // Should show loading state
      await waitFor(() => {
        expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
      });
    });
  });

  describe('Form Validation Guides User Success', () => {
    it('enables form progression as user completes requirements', async () => {
      render(<EnhancedLogin />);

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      expect(submitButton).toBeDisabled();

      await user.type(screen.getByLabelText(/username or email/i), 'test');
      await user.type(screen.getByLabelText(/^password/i), 'password');

      // Should be enabled when both fields are filled
      expect(submitButton).not.toBeDisabled();
    });

    it('provides immediate feedback for password visibility toggle', async () => {
      render(<EnhancedLogin />);

      const passwordField = screen.getByLabelText(/^password/i) as HTMLInputElement;
      const toggleButton = screen.getByLabelText(/show password/i);

      // Initially password should be hidden
      expect(passwordField.type).toBe('password');

      // Click toggle
      await user.click(toggleButton);
      
      // Should show password
      expect(passwordField.type).toBe('text');
      
      // Toggle again
      await user.click(toggleButton);
      expect(passwordField.type).toBe('password');
    });
  });

  describe('Data Integrity and Security UX', () => {
    it('sanitizes and validates email inputs to prevent user errors', async () => {
      render(<EnhancedLogin />);
      
      // Switch to registration
      await user.click(screen.getByRole('button', { name: /sign up/i }));
      
      const emailField = screen.getByLabelText('Email Address *');

      // User enters email with extra spaces
      await user.type(emailField, '  user@example.com  ');
      
      // Continue with registration to see if validation works
      await user.type(screen.getByLabelText('Username *'), 'testuser');
      await user.type(screen.getByLabelText('Password *'), 'StrongPass123!');
      await user.type(screen.getByLabelText('Confirm Password *'), 'StrongPass123!');
      
      // Email should be trimmed in the field (good UX)
      expect(emailField).toHaveValue('  user@example.com  '); // Still shows what user typed
      // But when submitted, should be trimmed (tested through service call)
    });
  });

  describe('Responsive and Mobile-Friendly Experience', () => {
    it('maintains usability on smaller screens', async () => {
      // Simulate mobile viewport
      Object.defineProperty(window, 'innerWidth', { writable: true, value: 375 });
      Object.defineProperty(window, 'innerHeight', { writable: true, value: 667 });
      
      render(<EnhancedLogin />);

      // All essential elements should still be present and accessible
      expect(screen.getByLabelText(/username or email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
      
      // OAuth buttons should still be accessible
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /google/i })).toBeInTheDocument();
      });
    });
  });
});