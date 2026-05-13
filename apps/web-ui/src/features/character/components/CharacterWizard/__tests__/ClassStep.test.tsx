import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ClassStep } from '../ClassStep';

vi.mock('@features/compendium', () => ({
  useClasses: vi.fn(() => ({ data: null, loading: false, error: null })),
}));

vi.mock('react-hook-form', () => ({
  useFormContext: () => ({
    register: () => ({}),
    formState: { errors: {} },
    watch: () => '',
  }),
}));

import { useClasses } from '@features/compendium';
const mockUseClasses = vi.mocked(useClasses);

const mockClasses = [
  { name: 'Fighter', hit_die: 10, primary_abilities: ['Strength'], saving_throw_proficiencies: ['Strength', 'Constitution'], armor_proficiencies: ['All armor'], weapon_proficiencies: ['All weapons'], skill_proficiencies: ['Acrobatics', 'Animal Handling'], num_skills: 2, description: 'A powerful warrior.', spell_ability: null },
  { name: 'Wizard', hit_die: 6, primary_abilities: ['Intelligence'], saving_throw_proficiencies: ['Intelligence', 'Wisdom'], armor_proficiencies: [], weapon_proficiencies: ['Daggers'], skill_proficiencies: ['Arcana'], num_skills: 2, description: null, spell_ability: 'Intelligence' },
];

describe('ClassStep', () => {
  it('shows loading state', () => {
    mockUseClasses.mockReturnValueOnce({ data: null, loading: true, error: null } as never);
    render(<ClassStep />);
    expect(screen.getByText(/Loading classes/i)).toBeTruthy();
  });

  it('shows error state', () => {
    mockUseClasses.mockReturnValueOnce({ data: null, loading: false, error: 'Network error' } as never);
    render(<ClassStep />);
    expect(screen.getByText(/Error loading classes/i)).toBeTruthy();
  });

  it('renders class options when loaded', () => {
    mockUseClasses.mockReturnValueOnce({ data: mockClasses, loading: false, error: null } as never);
    render(<ClassStep />);
    expect(screen.getByText('Fighter')).toBeTruthy();
    expect(screen.getByText('Wizard')).toBeTruthy();
  });

  it('renders select label', () => {
    mockUseClasses.mockReturnValueOnce({ data: mockClasses, loading: false, error: null } as never);
    render(<ClassStep />);
    expect(screen.getByText(/Select Class/i)).toBeTruthy();
  });
});
