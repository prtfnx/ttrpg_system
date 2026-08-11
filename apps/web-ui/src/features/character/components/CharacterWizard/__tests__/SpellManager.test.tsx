import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SpellManager } from '../SpellManager';
import type { WizardFormData } from '../WizardFormData';

const character: WizardFormData = {
  name: 'Elara',
  race: 'Elf',
  class: 'Wizard',
  background: 'Sage',
  strength: 8,
  dexterity: 14,
  constitution: 12,
  intelligence: 16,
  wisdom: 13,
  charisma: 10,
  skills: ['Arcana'],
  spells: {
    cantrips: ['Fire Bolt'],
    knownSpells: ['Magic Missile'],
    preparedSpells: ['Shield'],
  },
  advancement: {
    experiencePoints: 0,
    currentLevel: 1,
    levelHistory: [],
  },
};

describe('SpellManager', () => {
  it('renders its tab controls and character context', () => {
    render(<SpellManager character={character} />);

    expect(screen.getByText('Elara - Wizard Level 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Spell Slots' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prepare' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cast' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Library' })).toBeInTheDocument();
  });

  it('switches to the spell library and exposes filtering controls', () => {
    render(<SpellManager character={character} />);

    fireEvent.click(screen.getByRole('button', { name: 'Library' }));

    expect(screen.getByPlaceholderText('Search spells...')).toBeInTheDocument();
    expect(screen.getByText('Magic Missile')).toBeInTheDocument();
  });

  it('opens an accessible spell dialog and closes it with Escape', () => {
    render(<SpellManager character={character} />);

    fireEvent.click(screen.getByRole('button', { name: 'Library' }));
    fireEvent.click(screen.getByRole('button', { name: /view magic missile details/i }));

    expect(screen.getByRole('dialog', { name: 'Magic Missile' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
