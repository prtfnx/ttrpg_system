import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from '../Modal';

describe('Modal', () => {
  it('uses its unique title id as the accessible dialog name', () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Delete table">
        This action cannot be undone.
      </Modal>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Delete table' });
    const title = screen.getByRole('heading', { name: 'Delete table' });

    expect(dialog).toHaveAttribute('aria-labelledby', title.id);
  });

  it('keeps keyboard focus inside the dialog', () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Choose an action">
        <button type="button">First action</button>
        <button type="button">Last action</button>
      </Modal>,
    );

    const first = screen.getByRole('button', { name: 'Close modal' });
    const last = screen.getByRole('button', { name: 'Last action' });

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();

    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('preserves an explicitly autofocusable safe action', () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Delete table">
        <button type="button">Delete</button>
        <button type="button" autoFocus>Cancel</button>
      </Modal>,
    );

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('closes with Escape', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Delete table">
        Confirm deletion
      </Modal>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
  });
});
