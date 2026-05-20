import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AbilitiesStep } from '../AbilitiesStep';

const addMessage = vi.fn();

vi.mock('@features/chat', () => ({
  useChatStore: (sel: (s: { addMessage: typeof addMessage }) => unknown) =>
    sel({ addMessage }),
}));

vi.mock('@features/compendium', () => ({
  useRacesForCharacterWizard: () => ({ data: null }),
}));

type FormValues = Record<string, string | number | number[] | Partial<Record<string, number>> | null>;

function Wrapper({ defaults = {} }: { defaults?: FormValues }) {
  const methods = useForm<FormValues>({
    defaultValues: {
      strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0,
      _abilityMethod: 'standard', _abilityRolls: [], _rollAssignments: {},
      name: '', class: '', background: '', race: '', subrace: '',
      ...defaults,
    },
  });
  return (
    <FormProvider {...methods}>
      <AbilitiesStep />
    </FormProvider>
  );
}

describe('AbilitiesStep', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('rendering', () => {
    it('renders all ability selects in standard mode', () => {
      render(<Wrapper />);
      expect(screen.getByText('Strength')).toBeInTheDocument();
      expect(screen.getByText('Dexterity')).toBeInTheDocument();
      expect(screen.getByText('Constitution')).toBeInTheDocument();
      expect(screen.getByText('Intelligence')).toBeInTheDocument();
      expect(screen.getByText('Wisdom')).toBeInTheDocument();
      expect(screen.getByText('Charisma')).toBeInTheDocument();
    });

    it('renders method buttons', () => {
      render(<Wrapper />);
      expect(screen.getByRole('button', { name: 'Standard Array' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Point Buy (27 pts)' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Roll 4d6' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Manual' })).toBeInTheDocument();
    });

    it('renders the heading', () => {
      render(<Wrapper />);
      expect(screen.getByText('Assign ability scores')).toBeInTheDocument();
    });
  });

  describe('method switching', () => {
    it('switches to point buy and shows points remaining', () => {
      render(<Wrapper />);
      fireEvent.click(screen.getByRole('button', { name: 'Point Buy (27 pts)' }));
      expect(screen.getByTestId('points-remaining')).toBeInTheDocument();
    });

    it('switches to roll mode and shows Roll Abilities button', () => {
      render(<Wrapper />);
      fireEvent.click(screen.getByRole('button', { name: 'Roll 4d6' }));
      expect(screen.getByRole('button', { name: 'Roll Abilities' })).toBeInTheDocument();
    });

    it('switches to manual mode and shows number inputs', () => {
      render(<Wrapper />);
      fireEvent.click(screen.getByRole('button', { name: 'Manual' }));
      const inputs = screen.getAllByRole('spinbutton');
      expect(inputs.length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('point buy', () => {
    it('shows 27 points initially', () => {
      render(<Wrapper />);
      fireEvent.click(screen.getByRole('button', { name: 'Point Buy (27 pts)' }));
      expect(screen.getByTestId('points-remaining')).toHaveTextContent('27');
    });

    it('decrement button is disabled when score is 8', () => {
      render(<Wrapper />);
      fireEvent.click(screen.getByRole('button', { name: 'Point Buy (27 pts)' }));
      const decBtns = screen.getAllByText('−');
      expect(decBtns[0]).toBeDisabled();
    });

    it('shows final score for each ability', () => {
      render(<Wrapper />);
      fireEvent.click(screen.getByRole('button', { name: 'Point Buy (27 pts)' }));
      expect(screen.getByTestId('strength-final')).toHaveTextContent('Final: 8');
    });
  });

  describe('roll mode', () => {
    it('calls addMessage after rolling', () => {
      render(<Wrapper />);
      fireEvent.click(screen.getByRole('button', { name: 'Roll 4d6' }));
      fireEvent.click(screen.getByRole('button', { name: 'Roll Abilities' }));
      expect(addMessage).toHaveBeenCalledOnce();
      expect(addMessage.mock.calls[0][0].text).toMatch(/Ability roll/);
    });

    it('shows re-roll button after rolling', () => {
      render(<Wrapper />);
      fireEvent.click(screen.getByRole('button', { name: 'Roll 4d6' }));
      fireEvent.click(screen.getByRole('button', { name: 'Roll Abilities' }));
      expect(screen.getByRole('button', { name: 'Re-roll' })).toBeInTheDocument();
    });
  });

  describe('character summary bar', () => {
    it('shows character name when set', () => {
      render(<Wrapper defaults={{ name: 'Elara' }} />);
      expect(screen.getByText('Elara')).toBeInTheDocument();
    });

    it('hidden when no name/class/background', () => {
      render(<Wrapper />);
      expect(screen.queryByText('Elara')).not.toBeInTheDocument();
    });
  });
});
