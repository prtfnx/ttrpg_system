import type { ToastOptions } from 'react-toastify';
import { toast } from 'react-toastify';

/**
 * Centralized toast notification utility
 * Provides consistent styling and behavior across the app
 */

const defaultOptions: ToastOptions = {
  position: 'top-right',
  autoClose: 5000,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
};

export const showToast = {
  success: (message: string, options?: ToastOptions) => {
    toast.success(message, { ...defaultOptions, ...options });
  },

  error: (message: string, options?: ToastOptions) => {
    toast.error(message, { ...defaultOptions, ...options });
  },

  warning: (message: string, options?: ToastOptions) => {
    toast.warning(message, { ...defaultOptions, ...options });
  },

  info: (message: string, options?: ToastOptions) => {
    toast.info(message, { ...defaultOptions, ...options });
  },

  // Specific toast types for common scenarios
  characterSaved: (characterName: string) => {
    toast.success(`Character "${characterName}"saved successfully`);
  },

  characterDeleted: (characterName: string) => {
    toast.info(`️ Character "${characterName}"deleted`);
  },

  characterSaveFailed: (characterName: string, reason?: string) => {
    const message = reason 
      ? `Failed to save "${characterName}": ${reason}`
      : `Failed to save "${characterName}"`;
    toast.error(message, { autoClose: 8000 });
  },

  characterUpdateFailed: (characterName: string, reason?: string) => {
    const message = reason 
      ? `Failed to update "${characterName}": ${reason}`
      : `Failed to update "${characterName}"`;
    toast.error(message, { autoClose: 8000 });
  },

  versionConflict: (characterName: string) => {
    toast.warning(
      `️ Version conflict for "${characterName}"- another user has made changes. Please refresh.`,
      { autoClose: 10000 }
    );
  },

  connectionLost: () => {
    toast.error('Connection lost - working offline', { autoClose: false });
  },

  connectionRestored: () => {
    toast.success('Connection restored');
  },

  rollbackWarning: (characterName: string) => {
    toast.warning(
      `️ Server didn't respond for "${characterName}"- rolled back changes`,
      { autoClose: 8000 }
    );
  }
};
