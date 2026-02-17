/**
 * Mock for react-toastify to prevent import errors in tests
 * Provides simple stubs that don't actually render toasts
 */
import { vi } from 'vitest';

export const toast = vi.fn(() => 'mock-toast-id');
toast.success = vi.fn(() => 'mock-toast-id');
toast.error = vi.fn(() => 'mock-toast-id');
toast.info = vi.fn(() => 'mock-toast-id');
toast.warning = vi.fn(() => 'mock-toast-id');
toast.dismiss = vi.fn();
toast.clearWaitingQueue = vi.fn();
toast.isActive = vi.fn(() => false);
toast.update = vi.fn();
toast.done = vi.fn();
toast.onChange = vi.fn();
toast.promise = vi.fn((promise) => promise);

export const ToastContainer = () => null;

export const Bounce = 'bounce';
export const Slide = 'slide';
export const Zoom = 'zoom';
export const Flip = 'flip';

export default toast;
