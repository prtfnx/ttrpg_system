import { render, screen } from '@testing-library/react';
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
});
