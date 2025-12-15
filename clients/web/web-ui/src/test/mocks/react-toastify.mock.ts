// Mock for react-toastify to avoid missing dependency in tests
import { vi } from 'vitest';

export const toast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
  dark: vi.fn(),
  promise: vi.fn(),
  dismiss: vi.fn(),
  isActive: vi.fn(),
  update: vi.fn(),
  done: vi.fn(),
  onChange: vi.fn(),
  configure: vi.fn(),
};

export const ToastContainer = () => null;

export const Bounce = {};
export const Slide = {};
export const Zoom = {};
export const Flip = {};
