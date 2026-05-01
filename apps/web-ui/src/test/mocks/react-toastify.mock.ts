/**
 * Mock for react-toastify to prevent import errors in tests
 * Provides simple stubs that don't actually render toasts
 */
import { vi } from 'vitest';

const toastFn = vi.fn(() => 'mock-toast-id');

export const toast = Object.assign(toastFn, {
  success: vi.fn(() => 'mock-toast-id'),
  error: vi.fn(() => 'mock-toast-id'),
  info: vi.fn(() => 'mock-toast-id'),
  warning: vi.fn(() => 'mock-toast-id'),
  dismiss: vi.fn(),
  clearWaitingQueue: vi.fn(),
  isActive: vi.fn(() => false),
  update: vi.fn(),
  done: vi.fn(),
  onChange: vi.fn(),
  promise: vi.fn((promise: unknown) => promise),
});

export const ToastContainer = () => null;

export const Bounce = 'bounce';
export const Slide = 'slide';
export const Zoom = 'zoom';
export const Flip = 'flip';

export default toast;
