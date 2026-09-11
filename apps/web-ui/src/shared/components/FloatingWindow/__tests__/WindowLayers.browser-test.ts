import '@/index.css';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(() => {
  document.getElementById('window-root')?.remove();
  document.getElementById('modal-root')?.remove();
});

describe('floating application layers', () => {
  it('keeps windows above fixed controls and blocking modals above windows', () => {
    const windowRoot = document.createElement('div');
    windowRoot.id = 'window-root';
    const windowElement = document.createElement('div');
    windowRoot.append(windowElement);
    const modalRoot = document.createElement('div');
    modalRoot.id = 'modal-root';
    document.body.append(windowRoot, modalRoot);

    const tokens = getComputedStyle(document.documentElement);
    const fixedLayer = Number(tokens.getPropertyValue('--z-fixed'));
    const windowLayer = Number(getComputedStyle(windowRoot).zIndex);
    const modalLayer = Number(getComputedStyle(modalRoot).zIndex);

    expect(fixedLayer).toBeLessThan(windowLayer);
    expect(windowLayer).toBeLessThan(modalLayer);
    expect(getComputedStyle(windowRoot).pointerEvents).toBe('none');
    expect(getComputedStyle(windowElement).pointerEvents).toBe('auto');
  });
});
