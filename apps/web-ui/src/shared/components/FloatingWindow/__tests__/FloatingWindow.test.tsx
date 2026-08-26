import { fireEvent, render } from '@testing-library/react';
import type React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { FloatingWindow } from '../FloatingWindow';

vi.mock('react-rnd', () => ({
  Rnd: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

beforeEach(() => {
  sessionStorage.clear();
  document.body.innerHTML = '<div id="window-root"></div>';
});

it('closes only the topmost visible window on Escape', () => {
  const closeBehind = vi.fn();
  const closeTop = vi.fn();

  render(
    <>
      <FloatingWindow
        id="behind"
        title="Behind"
        zIndex={1001}
        isTopmost={false}
        onClose={closeBehind}
        onFocus={() => {}}
      >
        Behind content
      </FloatingWindow>
      <FloatingWindow
        id="top"
        title="Top"
        zIndex={1002}
        isTopmost
        onClose={closeTop}
        onFocus={() => {}}
      >
        Top content
      </FloatingWindow>
    </>,
  );

  fireEvent.keyDown(window, { key: 'Escape' });

  expect(closeTop).toHaveBeenCalledOnce();
  expect(closeBehind).not.toHaveBeenCalled();
});
