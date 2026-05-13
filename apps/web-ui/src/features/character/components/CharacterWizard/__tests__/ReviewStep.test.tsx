import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ReviewStep from '../ReviewStep';

const mockData = {
  name: 'Aldric',
  race: 'human',
  class: 'fighter',
  background: 'soldier',
  strength: 16, dexterity: 14, constitution: 15,
  intelligence: 10, wisdom: 12, charisma: 8,
  skills: ['Athletics', 'Perception'],
  bio: 'A veteran warrior',
};

vi.mock('react-hook-form', () => ({
  useFormContext: () => ({ getValues: () => mockData }),
}));

describe('ReviewStep', () => {
  it('renders character name', () => {
    render(<ReviewStep />);
    expect(screen.getByText('Aldric')).toBeTruthy();
  });

  it('renders race and class', () => {
    render(<ReviewStep />);
    expect(screen.getByText('human')).toBeTruthy();
    expect(screen.getByText('fighter')).toBeTruthy();
  });

  it('renders ability scores', () => {
    render(<ReviewStep />);
    expect(screen.getByText(/Strength: 16/)).toBeTruthy();
    expect(screen.getByText(/Dexterity: 14/)).toBeTruthy();
  });

  it('renders skills list', () => {
    render(<ReviewStep />);
    expect(screen.getByText(/Athletics, Perception/)).toBeTruthy();
  });

  it('renders bio when provided', () => {
    render(<ReviewStep />);
    expect(screen.getByText('A veteran warrior')).toBeTruthy();
  });

  it('does not render image when not provided', () => {
    render(<ReviewStep />);
    expect(screen.queryByRole('img')).toBeNull();
  });
});
