import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SpellPreparationManager } from '../SpellPreparationManager';

const makeSpell = (overrides = {}) => ({
  id: 's1',
  name: 'Fireball',
  level: 3,
  school: 'Evocation',
  castingTime: '1 action',
  range: '150 feet',
  components: 'V, S, M',
  duration: 'Instantaneous',
  description: 'A bright streak flashes from your pointing finger.',
  ritual: false,
  concentration: false,
  ...overrides,
});

const baseProps = {
  characterClass: 'wizard',
  characterLevel: 5,
  abilityScores: { intelligence: 18, wisdom: 14, charisma: 10 },
  knownSpells: [],
  preparedSpells: [],
  onPrepareSpell: vi.fn(),
  onUnprepareSpell: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SpellPreparationManager', () => {
  describe('non-preparation casters', () => {
    it('shows no-prepare message for fighter', () => {
      render(<SpellPreparationManager {...baseProps} characterClass="fighter" />);
      expect(screen.getByText(/doesn't prepare spells/i)).toBeInTheDocument();
    });

    it('shows no-prepare message for rogue', () => {
      render(<SpellPreparationManager {...baseProps} characterClass="rogue" />);
      expect(screen.getByText(/doesn't prepare spells/i)).toBeInTheDocument();
    });
  });

  describe('spell management UI', () => {
    it('renders header and counter for wizard', () => {
      render(<SpellPreparationManager {...baseProps} />);
      // wizard: level 5 + INT mod (4) = 9 prepared
      expect(screen.getByText(/9 prepared/i)).toBeInTheDocument();
    });

    it('shows empty state when no spells available', () => {
      render(<SpellPreparationManager {...baseProps} />);
      expect(screen.getByText(/No spells available to prepare/i)).toBeInTheDocument();
      expect(screen.getByText(/No spells prepared/i)).toBeInTheDocument();
    });

    it('shows available spell and calls onPrepareSpell on check', () => {
      const spell = makeSpell();
      render(<SpellPreparationManager {...baseProps} knownSpells={[spell]} />);
      const checkbox = screen.getByRole('checkbox', { name: /prepare spell fireball/i });
      fireEvent.click(checkbox);
      expect(baseProps.onPrepareSpell).toHaveBeenCalledWith('s1');
    });

    it('shows prepared spell with remove button', () => {
      const spell = makeSpell();
      render(<SpellPreparationManager {...baseProps} knownSpells={[spell]} preparedSpells={['s1']} />);
      expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
    });

    it('calls onUnprepareSpell when remove clicked', () => {
      const spell = makeSpell();
      render(<SpellPreparationManager {...baseProps} knownSpells={[spell]} preparedSpells={['s1']} />);
      fireEvent.click(screen.getByRole('button', { name: /remove/i }));
      expect(baseProps.onUnprepareSpell).toHaveBeenCalledWith('s1');
    });

    it('shows "Cannot prepare more spells" when at max', () => {
      // wizard level 1, INT 10 → max 1 prepared; s1 is prepared so available list is empty
      const spell1 = makeSpell({ id: 's1', name: 'Magic Missile' });
      render(
        <SpellPreparationManager
          {...baseProps}
          characterLevel={1}
          abilityScores={{ intelligence: 10, wisdom: 10, charisma: 10 }}
          knownSpells={[spell1]}
          preparedSpells={['s1']}
        />
      );
      expect(screen.getByText(/Cannot prepare more spells/i)).toBeInTheDocument();
    });

    it('disables checkbox when at max prepared', () => {
      const spell1 = makeSpell({ id: 's1', name: 'Magic Missile' });
      const spell2 = makeSpell({ id: 's2', name: 'Shield' });
      render(
        <SpellPreparationManager
          {...baseProps}
          characterLevel={1}
          abilityScores={{ intelligence: 10, wisdom: 10, charisma: 10 }}
          knownSpells={[spell1, spell2]}
          preparedSpells={['s1']}
        />
      );
      const checkbox = screen.getByRole('checkbox', { name: /prepare spell shield/i });
      expect(checkbox).toBeDisabled();
    });
  });

  describe('cleric domain spells', () => {
    it('shows domain spells section for cleric', () => {
      render(<SpellPreparationManager {...baseProps} characterClass="cleric" abilityScores={{ wisdom: 16, intelligence: 10, charisma: 10 }} />);
      expect(screen.getByText(/Domain Spells/i)).toBeInTheDocument();
      expect(screen.getByText(/bless/i)).toBeInTheDocument();
    });

    it('does not show domain spells for wizard', () => {
      render(<SpellPreparationManager {...baseProps} />);
      expect(screen.queryByText(/Domain Spells/i)).not.toBeInTheDocument();
    });
  });

  describe('ritual spells', () => {
    const ritualSpell = makeSpell({ id: 'r1', name: 'Identify', ritual: true });

    it('shows ritual spells section', () => {
      render(<SpellPreparationManager {...baseProps} knownSpells={[ritualSpell]} />);
      expect(screen.getByRole('heading', { name: /Ritual Spells/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Cast Identify \(Ritual\)/i })).toBeInTheDocument();
    });

    it('toggles ritual section visibility', () => {
      render(<SpellPreparationManager {...baseProps} knownSpells={[ritualSpell]} />);
      const toggleBtn = screen.getByRole('button', { name: /hide/i });
      fireEvent.click(toggleBtn);
      expect(screen.queryByRole('button', { name: /Cast Identify/i })).not.toBeInTheDocument();
      // toggle back
      fireEvent.click(screen.getByRole('button', { name: /show/i }));
      expect(screen.getByRole('button', { name: /Cast Identify/i })).toBeInTheDocument();
    });

    it('shows "No ritual spells known" when no ritual spells', () => {
      render(<SpellPreparationManager {...baseProps} />);
      expect(screen.getByText(/No ritual spells known/i)).toBeInTheDocument();
    });
  });

  describe('spell details panel', () => {
    const spell = makeSpell({ id: 's1', name: 'Fireball', level: 3, school: 'Evocation' });

    it('shows spell details when prepared spell is clicked', () => {
      render(<SpellPreparationManager {...baseProps} knownSpells={[spell]} preparedSpells={['s1']} />);
      fireEvent.click(screen.getByText('Fireball'));
      expect(screen.getByText(/Level: 3/i)).toBeInTheDocument();
      expect(screen.getByText(/School: Evocation/i, { exact: false })).toBeInTheDocument();
    });

    it('shows ritual mode details when ritual spell clicked', () => {
      const ritual = makeSpell({ id: 'r1', name: 'Identify', ritual: true });
      render(<SpellPreparationManager {...baseProps} knownSpells={[ritual]} />);
      fireEvent.click(screen.getByRole('button', { name: /Cast Identify \(Ritual\)/i }));
      expect(screen.getByText(/No spell slot required/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Cast Ritual/i })).toBeInTheDocument();
    });

    it('cancels ritual mode via cancel button', () => {
      const ritual = makeSpell({ id: 'r1', name: 'Identify', ritual: true });
      render(<SpellPreparationManager {...baseProps} knownSpells={[ritual]} />);
      fireEvent.click(screen.getByRole('button', { name: /Cast Identify \(Ritual\)/i }));
      expect(screen.getByText(/No spell slot required/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      expect(screen.queryByText(/No spell slot required/i)).not.toBeInTheDocument();
    });
  });

  describe('paladin and ranger spell counts', () => {
    it('calculates paladin spell count correctly (level + CHA mod)', () => {
      render(
        <SpellPreparationManager
          {...baseProps}
          characterClass="paladin"
          characterLevel={4}
          abilityScores={{ charisma: 16, intelligence: 10, wisdom: 10 }}
        />
      );
      // paladin: level(4) + CHA mod(3) = 7
      expect(screen.getByText(/7 prepared/i)).toBeInTheDocument();
    });

    it('shows 0 prepared for ranger at level 1', () => {
      // ranger level 1 can't prepare spells yet
      render(
        <SpellPreparationManager
          {...baseProps}
          characterClass="ranger"
          characterLevel={1}
          abilityScores={{ wisdom: 14, intelligence: 10, charisma: 10 }}
        />
      );
      expect(screen.getByText(/doesn't prepare spells/i)).toBeInTheDocument();
    });
  });
});
