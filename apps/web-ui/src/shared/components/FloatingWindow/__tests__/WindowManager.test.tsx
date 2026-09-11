import '@/index.css';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { WindowManagerProvider, useWindowManager } from '../index';

function Sheet() {
  return <div>Sheet content</div>;
}

function Launcher() {
  const windows = useWindowManager();
  return (
    <button
      type="button"
      onClick={() => windows.openWindow('sheet', Sheet, {}, { title: 'Character sheet' })}
    >
      Open sheet
    </button>
  );
}

beforeEach(() => {
  sessionStorage.clear();
  document.body.innerHTML = '<div id="root"></div><div id="modal-root"><div data-modal /></div><div id="window-root"></div>';
});

describe('WindowManager portal layers', () => {
  it('places modeless windows and their taskbar in the window portal', () => {
    const windowRoot = document.getElementById('window-root')!;
    render(<WindowManagerProvider><Launcher /></WindowManagerProvider>, {
      container: document.getElementById('root')!,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open sheet' }));
    expect(windowRoot).toContainElement(screen.getByText('Sheet content'));

    fireEvent.click(screen.getByTitle('Minimize'));
    expect(windowRoot).toContainElement(screen.getByRole('button', { name: 'Character sheet' }));
  });

  it('orders application controls, floating windows, and blocking modals explicitly', () => {
    const rootStyle = getComputedStyle(document.documentElement);
    const fixed = Number(rootStyle.getPropertyValue('--z-fixed'));
    const floating = Number(rootStyle.getPropertyValue('--z-floating-window'));
    const modal = Number(rootStyle.getPropertyValue('--z-modal-backdrop'));

    expect(fixed).toBeLessThan(floating);
    expect(floating).toBeLessThan(modal);
  });
});
