import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EnhancedLogin from './EnhancedLogin';

// Mock the auth service - but don't change its API, work with what users expect
vi.mock('@features/auth/services/enhancedAuth.service', () => ({
  enhancedAuthService: {
    login: vi.fn(),
    register: vi.fn(),
    requestPasswordReset: vi.fn(),
    getOAuthProviders: vi.fn(),
    oauthLogin: vi.fn(),
  }
}));

vi.mock('@shared/components', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LoadingSpinner: () => <div>Loading...</div>
}));

// Import after mock is defined
import { enhancedAuthService } from '@features/auth/services/enhancedAuth.service';

// Type the mocked service
const mockAuthService = vi.mocked(enhancedAuthService);

describe('EnhancedLogin - User Experience Tests', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    
    // Default mock for OAuth providers - what a user would expect to see
    mockAuthService.getOAuthProviders.mockResolvedValue([
      { id: 'google', name: 'Google', icon: '🔍', isEnabled: true },
      { id: 'discord', name: 'Discord', icon: '💬', isEnabled: true }
    ]);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Initial User Experience', () => {
    it('shows a welcoming login interface when user first visits', async () => {
      render(<EnhancedLogin />);

      // User should immediately see they can sign in
      expect(screen.getByText('Sign In')).toBeInTheDocument();
      expect(screen.getByText('Sign in to access your TTRPG campaigns')).toBeInTheDocument();
      
      // User should see login form fields
      expect(screen.getByLabelText(/username or email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
      
      // User should have options
      expect(screen.getByLabelText(/remember me/i)).toBeInTheDocument();
      expect(screen.getByText(/forgot password/i)).toBeInTheDocument();
      expect(screen.getByText(/sign up/i)).toBeInTheDocument();
    });

    it('loads OAuth options for user convenience', async () => {
      render(<EnhancedLogin />);

      // Wait for OAuth providers to load
      await waitFor(() => {
        expect(screen.getByText('Google')).toBeInTheDocument();
        expect(screen.getByText('Discord')).toBeInTheDocument();
      });
    });
  });

  describe('User Login Journey', () => {
    it('allows user to successfully log in', async () => {
      mockAuthService.login.mockResolvedValue({
        success: true
      });

      render(<EnhancedLogin />);

      // User types their credentials
      await user.type(screen.getByLabelText(/username or email/i), 'testuser');
      await user.type(screen.getByLabelText(/^password/i), 'mypassword');
      
      // User clicks sign in
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      // User should see success message
      await waitFor(() => {
        expect(screen.getByText(/login successful/i)).toBeInTheDocument();
      });

      // Service should have been called with correct data
      expect(mockAuthService.login).toHaveBeenCalledWith({
        username: 'testuser',
        password: 'mypassword',
        rememberMe: false
      });
    });

    it('shows user-friendly error when login fails', async () => {
      mockAuthService.login.mockRejectedValue(new Error('Invalid credentials'));

      render(<EnhancedLogin />);

      await user.type(screen.getByLabelText(/username or email/i), 'testuser');
      await user.type(screen.getByLabelText(/^password/i), 'wrongpassword');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      // User should see clear error message
      await waitFor(() => {
        expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
      });
    });

    it('prevents multiple submissions while processing', async () => {
      // Simulate slow network
      mockAuthService.login.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ success: true }), 1000))
      );

      render(<EnhancedLogin />);

      await user.type(screen.getByLabelText(/username or email/i), 'testuser');
      await user.type(screen.getByLabelText(/^password/i), 'password');
      
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      await user.click(submitButton);

      // User should see loading state - button is disabled during submission
      expect(submitButton).toBeDisabled();
      
      // Button should show loading state (LoadingSpinner renders inside button)
      // The actual component renders LoadingSpinner which doesn't have a test ID
      // We verify the disabled state which prevents multiple submissions
    });
  });

  describe('User Registration Experience', () => {
    it('helps user create a new account', async () => {
      render(<EnhancedLogin />);

      // User clicks to register
      await user.click(screen.getByText(/sign up/i));

      // User should see registration form
      expect(screen.getByRole('heading', { name: 'Create Account' })).toBeInTheDocument();
      expect(screen.getByText('Join the adventure and create your account')).toBeInTheDocument();
      
      // User should see all registration fields
      expect(screen.getByLabelText(/username.*\*/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/email.*\*/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^password.*\*/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/confirm password.*\*/i)).toBeInTheDocument();
    });

    it('helps user create secure password', async () => {
      render(<EnhancedLogin />);
      await user.click(screen.getByText(/sign up/i));

      const passwordInput = screen.getByLabelText(/^password.*\*/i);
      
      // User types weak password
      await user.type(passwordInput, 'weak');
      await waitFor(() => {
        expect(screen.getByText(/very weak/i)).toBeInTheDocument();
      });

      // User improves password
      await user.clear(passwordInput);
      await user.type(passwordInput, 'StrongPassword123!');
      await waitFor(() => {
        expect(screen.getByText(/strong/i) || screen.getByText(/very strong/i)).toBeInTheDocument();
      });
    });

    it('validates password confirmation for user', async () => {
      render(<EnhancedLogin />);
      await user.click(screen.getByText(/sign up/i));

      await user.type(screen.getByLabelText(/^password.*\*/i), 'MyPassword123!');
      await user.type(screen.getByLabelText(/confirm password.*\*/i), 'DifferentPassword');

      // User should see mismatch warning
      await waitFor(() => {
        expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
      });
    });
  });

  describe('Password Recovery Experience', () => {
    it('helps user reset forgotten password', async () => {
      mockAuthService.requestPasswordReset.mockResolvedValue({ success: true });

      render(<EnhancedLogin />);

      // User clicks forgot password
      await user.click(screen.getByText(/forgot password/i));

      // User should see reset form
      expect(screen.getByText('Reset Password')).toBeInTheDocument();
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();

      // User enters email and submits
      await user.type(screen.getByLabelText(/email address/i), 'user@example.com');
      await user.click(screen.getByRole('button', { name: /send reset link/i }));

      // User should see confirmation
      await waitFor(() => {
        expect(screen.getByText(/password reset email sent/i)).toBeInTheDocument();
      });
    });

    it('allows user to return to login from password reset', async () => {
      render(<EnhancedLogin />);

      await user.click(screen.getByText(/forgot password/i));
      expect(screen.getByText('Reset Password')).toBeInTheDocument();

      await user.click(screen.getByText(/back to sign in/i));
      expect(screen.getByText('Sign In')).toBeInTheDocument();
    });
  });

  describe('Social Authentication Experience', () => {
    it('provides social login options for user convenience', async () => {
      mockAuthService.oauthLogin.mockResolvedValue();

      render(<EnhancedLogin />);

      // Wait for providers to load
      await waitFor(() => {
        expect(screen.getByText('Google')).toBeInTheDocument();
      });

      // User clicks Google login
      await user.click(screen.getByText('Google'));

      // Service should be called
      expect(mockAuthService.oauthLogin).toHaveBeenCalledWith('google');

      // User should see confirmation
      await waitFor(() => {
        expect(screen.getByText(/oauth login initiated/i)).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility for All Users', () => {
    it('provides proper labels for screen readers', () => {
      render(<EnhancedLogin />);

      // All form controls should have labels
      expect(screen.getByLabelText(/username or email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/remember me/i)).toBeInTheDocument();

      // Buttons should have proper text
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('shows error messages with proper ARIA roles', async () => {
      mockAuthService.login.mockRejectedValue(new Error('Test error'));

      render(<EnhancedLogin />);

      await user.type(screen.getByLabelText(/username or email/i), 'test');
      await user.type(screen.getByLabelText(/^password/i), 'test');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      // Error should be announced to screen readers
      await waitFor(() => {
        const errorMessage = screen.getByText(/test error/i);
        expect(errorMessage).toHaveAttribute('role', 'alert');
      });
    });
  });

  describe('Form Validation Helps User', () => {
    it('prevents empty form submission', () => {
      render(<EnhancedLogin />);
      
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      expect(submitButton).toBeDisabled();
    });

    it('enables form when user fills required fields', async () => {
      render(<EnhancedLogin />);

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      expect(submitButton).toBeDisabled();

      await user.type(screen.getByLabelText(/username or email/i), 'test');
      await user.type(screen.getByLabelText(/^password/i), 'password');

      expect(submitButton).toBeEnabled();
    });
  });
});
