import { fireEvent, render } from '@testing-library/react';
import type React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { FloatingWindow } from '../FloatingWindow';

vi.mock('react-rnd', () => ({
  Rnd: ({ children, position, size }: {
    children: React.ReactNode;
    position: unknown;
    size: unknown;
  }) => (
    <div data-position={JSON.stringify(position)} data-size={JSON.stringify(size)}>
      {children}
    </div>
  ),
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

it('sanitizes invalid persisted state and enforces minimum dimensions', () => {
  sessionStorage.setItem('fw:inventory', JSON.stringify({
    x: 'wrong',
    y: 40,
    width: 1,
    height: null,
    minimized: 'yes',
  }));

  const { getByText } = render(
    <FloatingWindow
      id="inventory"
      title="Inventory"
      initialWidth={500}
      initialHeight={600}
      initialX={20}
      initialY={30}
      minWidth={300}
      minHeight={200}
      zIndex={1001}
      isTopmost
      onClose={() => {}}
      onFocus={() => {}}
    >
      Inventory content
    </FloatingWindow>,
  );

  const windowElement = getByText('Inventory content').closest('[data-size]');
  expect(windowElement).toHaveAttribute('data-position', JSON.stringify({ x: 20, y: 40 }));
  expect(windowElement).toHaveAttribute('data-size', JSON.stringify({ width: 300, height: 600 }));
});
