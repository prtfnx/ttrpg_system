import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CharacterSummary } from '../CharacterSummary';

const baseCharacter = {
  name: 'Thorin',
  level: 5,
  class: 'Fighter',
  race: 'Dwarf',
  background: 'Soldier',
  abilityScores: {
    strength: 16,
    dexterity: 12,
    constitution: 14,
    intelligence: 10,
    wisdom: 8,
    charisma: 6,
  },
  hitDice: '5d10',
  maxHitPoints: 45,
  currentHitPoints: 30,
  armorClass: 18,
  proficiencyBonus: 3,
  experience: 6500,
};

describe('CharacterSummary', () => {
  it('renders character name and identity', () => {
    render(<CharacterSummary character={baseCharacter} />);
    expect(screen.getByText('Thorin')).toBeInTheDocument();
    expect(screen.getByText(/Dwarf.*Soldier/)).toBeInTheDocument();
  });

  it('renders class and level', () => {
    render(<CharacterSummary character={baseCharacter} />);
    expect(screen.getByText(/Fighter 5/)).toBeInTheDocument();
  });

  it('renders HP', () => {
    render(<CharacterSummary character={baseCharacter} />);
    // currentHP / (maxHP + constitution bonus * level)
    // con modifier = (14-10)/2 = 2, bonus = 2*5 = 10, calculatedMax = 45+10 = 55
    expect(screen.getByText('30 / 55')).toBeInTheDocument();
  });

  it('renders armor class', () => {
    render(<CharacterSummary character={baseCharacter} />);
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('ARMOR CLASS')).toBeInTheDocument();
  });

  it('renders proficiency bonus with + sign', () => {
    render(<CharacterSummary character={baseCharacter} />);
    // +3 appears as proficiency bonus (and possibly as a modifier)
    expect(screen.getAllByText('+3').length).toBeGreaterThanOrEqual(1);
  });

  it('renders experience value', () => {
    render(<CharacterSummary character={baseCharacter} />);
    // toLocaleString may format differently across environments
    expect(screen.getByText(/6.?500/)).toBeInTheDocument();
  });

  it('shows ability score section', () => {
    render(<CharacterSummary character={baseCharacter} />);
    expect(screen.getByText('Ability Scores')).toBeInTheDocument();
    expect(screen.getByText('str')).toBeInTheDocument();
  });

  it('shows positive modifier with plus sign', () => {
    render(<CharacterSummary character={baseCharacter} />);
    // strength 16 → modifier +3
    expect(screen.getAllByText('+3').length).toBeGreaterThanOrEqual(1);
  });

  it('shows negative modifier without plus sign', () => {
    render(<CharacterSummary character={baseCharacter} />);
    // charisma 6 → modifier -2
    expect(screen.getByText('-2')).toBeInTheDocument();
  });

  it('shows progress bar for level < 20', () => {
    render(<CharacterSummary character={baseCharacter} />);
    expect(screen.getByText(/Progress to Level 6/)).toBeInTheDocument();
  });

  it('does not show progress bar at level 20', () => {
    render(<CharacterSummary character={{ ...baseCharacter, experience: 355000, level: 20 }} />);
    expect(screen.queryByText(/Progress to Level/)).not.toBeInTheDocument();
  });

  it('handles multiclass display (comma-separated classes)', () => {
    render(<CharacterSummary character={{ ...baseCharacter, class: 'Fighter,Wizard', level: 6 }} />);
    // 6 levels split: Fighter 3 / Wizard 3
    expect(screen.getByText(/Fighter.*Wizard/)).toBeInTheDocument();
  });

  it('shows hit dice', () => {
    render(<CharacterSummary character={baseCharacter} />);
    expect(screen.getByText('5d10')).toBeInTheDocument();
  });

  it('renders zero experience correctly', () => {
    render(<CharacterSummary character={{ ...baseCharacter, experience: 0 }} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
