/**
 * Production-ready logging utility
 * Conditionally enables/disables logging based on environment
 */

const isDevelopment = import.meta.env.DEV;

export const logger = {
  debug: (message: string, ...args: unknown[]) => {
    if (isDevelopment) {
      console.debug(`[DEBUG] ${message}`, ...args);
    }
  },

  info: (message: string, ...args: unknown[]) => {
    if (isDevelopment) {
      console.info(`[INFO] ${message}`, ...args);
    }
  },

  warn: (message: string, ...args: unknown[]) => {
    console.warn(`[WARN] ${message}`, ...args);
  },

  error: (message: string, ...args: unknown[]) => {
    console.error(`[ERROR] ${message}`, ...args);
  },

  log: (message: string, ...args: unknown[]) => {
    if (isDevelopment) {
      console.log(message, ...args);
    }
  }
};

// For protocol and network debugging - only in development
export const protocolLogger = {
  message: (direction: 'sent' | 'received', message: unknown) => {
    if (isDevelopment) {
      console.log(`[PROTOCOL ${direction.toUpperCase()}]`, message);
    }
  },

  connection: (state: string, details?: unknown) => {
    if (isDevelopment) {
      console.log(`[CONNECTION] ${state}`, details);
    }
  },

  error: (context: string, error: unknown) => {
    console.error(`[PROTOCOL ERROR] ${context}`, error);
  }
};
