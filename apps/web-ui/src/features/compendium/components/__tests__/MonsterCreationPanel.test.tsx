import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../services/monsterCreation.service', () => ({
  monsterCreationSystem: {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    searchMonsters: vi.fn(() => []),
    getInstances: vi.fn(() => []),
    createInstance: vi.fn(),
    updateInstance: vi.fn(),
    deleteInstance: vi.fn(),
  },
}));

import { MonsterCreationPanel } from '../MonsterCreationPanel';

describe('MonsterCreationPanel', () => {
  it('renders as a named dialog', () => {
    render(<MonsterCreationPanel isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Monster Creation & Management' })).toBeInTheDocument();
  });

  it('closes with Escape', () => {
    const onClose = vi.fn();
    render(<MonsterCreationPanel isOpen onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
  });
});
