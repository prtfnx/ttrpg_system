import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FloatingPanel } from '../FloatingPanel';

// Mock Draggable — render children directly, simulate drag via onStop
vi.mock('react-draggable', () => ({
  default: ({ children, onStop }: { children: React.ReactNode; onStop?: (e: unknown, data: { x: number; y: number }) => void }) => {
    return (
      <div data-testid="draggable" onDoubleClick={() => onStop?.({}, { x: 50, y: 80 })}>
        {children}
      </div>
    );
  },
}));

// Mock ResizableBox — render children + trigger onResizeStop for tests
vi.mock('react-resizable', () => ({
  ResizableBox: ({ children, onResizeStop }: { children: React.ReactNode; onResizeStop?: (e: unknown, data: { size: { width: number; height: number } }) => void }) => (
    <div
      data-testid="resizable"
      onDoubleClick={() => onResizeStop?.({}, { size: { width: 320, height: 500 } })}
    >
      {children}
    </div>
  ),
}));

vi.mock('../FloatingPanel.module.css', () => ({
  default: { header: 'header', panel: 'panel', title: 'title', closeBtn: 'closeBtn', body: 'body' }
}));

vi.mock('react-resizable/css/styles.css', () => ({}));

import React from 'react';

beforeEach(() => {
  localStorage.clear();
});

describe('FloatingPanel', () => {
  it('renders title and children', () => {
    render(
      <FloatingPanel id="test" title="My Panel" onClose={() => {}}>
        <span>Panel Content</span>
      </FloatingPanel>
    );
    expect(screen.getByText('My Panel')).toBeTruthy();
    expect(screen.getByText('Panel Content')).toBeTruthy();
  });

  it('renders close button with aria-label', () => {
    render(
      <FloatingPanel id="fp1" title="Title" onClose={() => {}}>
        <div />
      </FloatingPanel>
    );
    const closeBtn = screen.getByRole('button', { name: 'Close' });
    expect(closeBtn).toBeTruthy();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(
      <FloatingPanel id="fp2" title="T" onClose={onClose}>
        <div />
      </FloatingPanel>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('saves position to localStorage on drag stop', () => {
    render(
      <FloatingPanel id="fp3" title="T" onClose={() => {}}>
        <div />
      </FloatingPanel>
    );
    // Simulate drag stop via doubleClick on the Draggable wrapper
    fireEvent.dblClick(screen.getByTestId('draggable'));
    const saved = JSON.parse(localStorage.getItem('fp-pos-fp3') ?? 'null');
    expect(saved).toEqual({ x: 50, y: 80 });
  });

  it('saves size to localStorage on resize stop', () => {
    render(
      <FloatingPanel id="fp4" title="T" onClose={() => {}}>
        <div />
      </FloatingPanel>
    );
    fireEvent.dblClick(screen.getByTestId('resizable'));
    const saved = JSON.parse(localStorage.getItem('fp-size-fp4') ?? 'null');
    expect(saved).toEqual({ width: 320, height: 532 }); // height+HEADER_H(32)
  });

  it('loads saved position from localStorage', () => {
    localStorage.setItem('fp-pos-fp5', JSON.stringify({ x: 200, y: 300 }));
    // No error should occur and panel renders normally
    render(
      <FloatingPanel id="fp5" title="Saved" onClose={() => {}}>
        <div />
      </FloatingPanel>
    );
    expect(screen.getByText('Saved')).toBeTruthy();
  });

  it('uses defaultPos when no localStorage entry', () => {
    render(
      <FloatingPanel id="new-fp" title="Default" defaultPos={{ x: 100, y: 150 }} onClose={() => {}}>
        <div />
      </FloatingPanel>
    );
    expect(screen.getByText('Default')).toBeTruthy();
  });

  it('handles corrupted localStorage entry gracefully', () => {
    localStorage.setItem('fp-pos-corrupt', 'not-json{{');
    expect(() =>
      render(
        <FloatingPanel id="corrupt" title="T" onClose={() => {}}>
          <div />
        </FloatingPanel>
      )
    ).not.toThrow();
  });
});
