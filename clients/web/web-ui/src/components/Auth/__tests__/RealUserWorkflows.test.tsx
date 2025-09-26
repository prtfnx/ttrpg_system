/**
 * Real User Workflow Integration Tests
 * 
 * Testing complete user journeys from start to finish
 * Following best practices:
 * - Test complete workflows, not isolated components
 * - Focus on what users actually do
 * - Test error recovery and edge cases
 * - Validate accessibility at every step
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enhancedAuthService } from '../../../services/enhancedAuth.service';
import EnhancedLogin from '../../EnhancedLogin';

// Mock external dependencies
vi.mock('../../../services/enhancedAuth.service', () => ({
  enhancedAuthService: {
    login: vi.fn(),
    register: vi.fn(),
    requestPasswordReset: vi.fn(),
    getOAuthProviders: vi.fn(),
    oauthLogin: vi.fn(),
    validatePassword: vi.fn(),
  }
}));

vi.mock('../../common/LoadingSpinner', () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner">Loading...</div>
}));

const mockAuthService = vi.mocked(enhancedAuthService);

describe('Real User Workflow Tests', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthService.getOAuthProviders.mockResolvedValue([
      { id: 'google', name: 'Google', icon: 'google-icon', isEnabled: true },
      { id: 'discord', name: 'Discord', icon: 'discord-icon', isEnabled: true }
    ]);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Complete Registration Workflow', () => {
    it('guides a new user through successful account creation from start to finish', async () => {
      mockAuthService.register.mockResolvedValue({ success: true });

      render(<EnhancedLogin />);

      // Step 1: User discovers they need to sign up
      const signUpButton = screen.getByRole('button', { name: /sign up/i });
      await user.click(signUpButton);

      // Step 2: User sees registration form
      expect(screen.getByRole('heading', { name: /create account/i })).toBeInTheDocument();

      // Step 3: User fills out the form progressively
      // Username
      const usernameField = screen.getByLabelText('Username *');
      await user.type(usernameField, 'newuser123');

      // Email
      const emailField = screen.getByLabelText('Email Address *');
      await user.type(emailField, 'newuser@example.com');

      // Full name (optional)
      const fullNameField = screen.getByLabelText('Full Name');
      await user.type(fullNameField, 'New User');

      // Password with real-time feedback
      const passwordField = screen.getByLabelText('Password *');
      await user.type(passwordField, 'weak');
      
      // User should see weak password warning
      await waitFor(() => {
        expect(screen.getByText(/very weak/i)).toBeInTheDocument();
      });

      // User improves password
      await user.clear(passwordField);
      await user.type(passwordField, 'StrongPassword123!');
      
      await waitFor(() => {
        expect(screen.getByText(/strong/i)).toBeInTheDocument();
      });

      // Password confirmation
      const confirmField = screen.getByLabelText('Confirm Password *');
      await user.type(confirmField, 'StrongPassword123!');

      // Terms acceptance
      const termsCheckbox = screen.getByLabelText(/i agree to the terms/i);
      await user.click(termsCheckbox);

      // Step 4: Submit registration
      const createAccountButton = screen.getByRole('button', { name: /create account/i });
      expect(createAccountButton).not.toBeDisabled();
      
      await user.click(createAccountButton);

      // Step 5: Verify service was called with correct data
      expect(mockAuthService.register).toHaveBeenCalledWith({
        username: 'newuser123',
        email: 'newuser@example.com',
        fullName: 'New User',
        password: 'StrongPassword123!',
        acceptTerms: true
      });
    });

    it('prevents user from making common registration mistakes', async () => {
      render(<EnhancedLogin />);
      await user.click(screen.getByRole('button', { name: /sign up/i }));

      // User enters mismatched passwords
      await user.type(screen.getByLabelText('Password *'), 'Password123!');
      await user.type(screen.getByLabelText('Confirm Password *'), 'DifferentPassword123!');

      // User should see immediate feedback
      await waitFor(() => {
        expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
      });

      // User tries to submit without accepting terms
      await user.type(screen.getByLabelText('Username *'), 'testuser');
      await user.type(screen.getByLabelText('Email Address *'), 'test@example.com');

      // Button should remain disabled
      const createButton = screen.getByRole('button', { name: /create account/i });
      expect(createButton).toBeDisabled();
    });
  });

  describe('Password Recovery Complete Flow', () => {
    it('helps user recover forgotten password with clear guidance', async () => {
      mockAuthService.requestPasswordReset.mockResolvedValue({ success: true });

      render(<EnhancedLogin />);

      // Step 1: User realizes they forgot password
      await user.click(screen.getByRole('button', { name: /forgot password/i }));

      // Step 2: Clear instructions
      expect(screen.getByRole('heading', { name: /reset password/i })).toBeInTheDocument();
      expect(screen.getByText(/enter your email address and we'll send you instructions/i)).toBeInTheDocument();

      // Step 3: User enters email
      const emailField = screen.getByLabelText('Email Address');
      await user.type(emailField, 'user@example.com');

      // Step 4: Submit request
      const sendButton = screen.getByRole('button', { name: /send reset link/i });
      expect(sendButton).not.toBeDisabled();
      await user.click(sendButton);

      // Step 5: User sees confirmation
      await waitFor(() => {
        expect(screen.getByText(/password reset instructions sent/i)).toBeInTheDocument();
      });

      expect(mockAuthService.requestPasswordReset).toHaveBeenCalledWith({
        email: 'user@example.com'
      });
    });

    it('provides clear path back to login if user remembers password', async () => {
      render(<EnhancedLogin />);

      // Navigate to password reset
      await user.click(screen.getByRole('button', { name: /forgot password/i }));

      // User realizes they remember password
      const backButton = screen.getByRole('button', { name: /back to sign in/i });
      await user.click(backButton);

      // Should be back at main login
      expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
    });
  });

  describe('Social Authentication Workflows', () => {
    it('provides seamless OAuth login experience', async () => {
      mockAuthService.oauthLogin.mockResolvedValue();

      render(<EnhancedLogin />);

      // User sees OAuth options clearly presented
      await waitFor(() => {
        expect(screen.getByText(/continue with/i)).toBeInTheDocument();
      });

      // User chooses Google login
      const googleButton = await waitFor(() =>
        screen.getByRole('button', { name: /google/i })
      );

      await user.click(googleButton);

      expect(mockAuthService.oauthLogin).toHaveBeenCalledWith('google');
    });

    it('falls back gracefully when OAuth fails', async () => {
      mockAuthService.oauthLogin.mockRejectedValue(new Error('OAuth service unavailable'));

      render(<EnhancedLogin />);

      const googleButton = await waitFor(() =>
        screen.getByRole('button', { name: /google/i })
      );

      await user.click(googleButton);

      // User should see error message
      await waitFor(() => {
        const errorAlert = screen.getByRole('alert');
        expect(errorAlert).toHaveTextContent(/oauth service unavailable/i);
      });

      // Traditional login should still be available
      expect(screen.getByLabelText('Username or Email')).toBeInTheDocument();
    });
  });

  describe('Form Validation User Experience', () => {
    it('guides users with progressive form validation', async () => {
      render(<EnhancedLogin />);

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      // Initially disabled
      expect(submitButton).toBeDisabled();

      // Fill username - still disabled
      await user.type(screen.getByLabelText('Username or Email'), 'user@test.com');
      expect(submitButton).toBeDisabled();

      // Fill password - now enabled
      await user.type(screen.getByLabelText('Password'), 'mypassword');
      expect(submitButton).not.toBeDisabled();

      // Clear password - disabled again
      await user.clear(screen.getByLabelText('Password'));
      expect(submitButton).toBeDisabled();
    });

    it('provides immediate feedback for user actions', async () => {
      render(<EnhancedLogin />);

      // Password visibility toggle
      const passwordField = screen.getByLabelText('Password') as HTMLInputElement;
      const toggleButton = screen.getByLabelText(/show password/i);

      await user.type(passwordField, 'secretpassword');
      expect(passwordField.type).toBe('password');

      // User clicks to show password
      await user.click(toggleButton);
      expect(passwordField.type).toBe('text');
      expect(passwordField.value).toBe('secretpassword');

      // Click again to hide
      await user.click(toggleButton);
      expect(passwordField.type).toBe('password');
    });
  });

  describe('Error Recovery User Experience', () => {
    it('helps users recover from network errors', async () => {
      mockAuthService.login.mockRejectedValue(new Error('Network error'));

      render(<EnhancedLogin />);

      // User attempts login
      await user.type(screen.getByLabelText('Username or Email'), 'user@test.com');
      await user.type(screen.getByLabelText('Password'), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      // Should show network error
      await waitFor(() => {
        const errorAlert = screen.getByRole('alert');
        expect(errorAlert).toHaveTextContent(/network error/i);
      });

      // User can still retry
      expect(screen.getByRole('button', { name: /sign in/i })).not.toBeDisabled();
    });

    it('clears previous errors when user makes changes', async () => {
      mockAuthService.login
        .mockResolvedValueOnce({ success: false, error: { code: 'INVALID', message: 'Invalid credentials' } })
        .mockResolvedValueOnce({ success: true });

      render(<EnhancedLogin />);

      // First failed attempt
      await user.type(screen.getByLabelText('Username or Email'), 'user@test.com');
      await user.type(screen.getByLabelText('Password'), 'wrongpassword');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      // User corrects password
      const passwordField = screen.getByLabelText('Password');
      await user.clear(passwordField);
      await user.type(passwordField, 'correctpassword');

      // Error should be cleared when user types
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility in Real User Scenarios', () => {
    it('maintains accessibility during dynamic content updates', async () => {
      mockAuthService.login.mockResolvedValue({ 
        success: false, 
        error: { code: 'INVALID', message: 'Invalid credentials' }
      });

      render(<EnhancedLogin />);

      // Submit form to trigger error
      await user.type(screen.getByLabelText('Username or Email'), 'test');
      await user.type(screen.getByLabelText('Password'), 'test');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      // Error should have proper ARIA attributes
      await waitFor(() => {
        const errorAlert = screen.getByRole('alert');
        expect(errorAlert).toBeInTheDocument();
        expect(errorAlert).toHaveAttribute('aria-live', 'polite');
      });
    });

    it('supports screen reader navigation through form modes', async () => {
      render(<EnhancedLogin />);

      // Login mode
      expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
      
      // Switch to registration
      await user.click(screen.getByRole('button', { name: /sign up/i }));
      expect(screen.getByRole('heading', { name: /create account/i })).toBeInTheDocument();

      // Switch to password reset
      await user.click(screen.getByRole('button', { name: /sign in/i })); // Go back first
      await user.click(screen.getByRole('button', { name: /forgot password/i }));
      expect(screen.getByRole('heading', { name: /reset password/i })).toBeInTheDocument();

      // Each mode change should update the heading for screen readers
    });
  });

  describe('Mobile and Touch User Experience', () => {
    it('works well with touch interactions', async () => {
      render(<EnhancedLogin />);

      // Touch-friendly tap targets
      const usernameField = screen.getByLabelText('Username or Email');
      const passwordField = screen.getByLabelText('Password');

      // Should be able to focus fields
      await user.click(usernameField);
      expect(document.activeElement).toBe(usernameField);

      await user.click(passwordField);
      expect(document.activeElement).toBe(passwordField);

      // Password toggle should work with touch
      const toggleButton = screen.getByLabelText(/show password/i);
      await user.click(toggleButton);
      
      expect((passwordField as HTMLInputElement).type).toBe('text');
    });

    it('handles virtual keyboard interactions gracefully', async () => {
      render(<EnhancedLogin />);

      // Simulate mobile scenario where Enter key submits
      const passwordField = screen.getByLabelText('Password');
      await user.type(screen.getByLabelText('Username or Email'), 'user@test.com');
      await user.type(passwordField, 'password123');

      // Submit by pressing Enter in password field
      passwordField.focus();
      await user.keyboard('{Enter}');

      // Form should attempt to submit
      expect(mockAuthService.login).toHaveBeenCalled();
    });
  });

  describe('Performance and User Patience', () => {
    it('provides immediate feedback for user actions', async () => {
      render(<EnhancedLogin />);

      // Typing should be immediate (no lag)
      const usernameField = screen.getByLabelText('Username or Email');
      await user.type(usernameField, 'user@test.com');
      
      expect(usernameField).toHaveValue('user@test.com');

      // Button state changes should be immediate
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      expect(submitButton).toBeDisabled();

      await user.type(screen.getByLabelText('Password'), 'password');
      expect(submitButton).not.toBeDisabled();
    });

    it('manages loading states appropriately for user expectations', async () => {
      // Simulate API delay
      mockAuthService.login.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ success: true }), 200))
      );

      render(<EnhancedLogin />);

      await user.type(screen.getByLabelText('Username or Email'), 'user@test.com');
      await user.type(screen.getByLabelText('Password'), 'password');
      
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      await user.click(submitButton);

      // Should show loading state
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();

      // Button should be disabled during loading
      expect(submitButton).toBeDisabled();
    });
  });
});