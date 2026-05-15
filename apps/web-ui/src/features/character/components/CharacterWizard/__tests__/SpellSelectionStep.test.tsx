import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm, FormProvider } from 'react-hook-form';
import { SpellSelectionStep } from '../SpellSelectionStep';
import { compendiumService } from '@features/compendium/services/compendiumService';
import { spellManagementService } from '../../../services/spellManagement.service';
import type { WizardFormData } from '../WizardFormData';

vi.mock('@features/compendium/services/compendiumService', () => ({
  compendiumService: {
    getSpells: vi.fn(),
  },
}));

vi.mock('../../../services/spellManagement.service', () => ({
  spellManagementService: {
    getSpellSlots: vi.fn(),
    getSpellsKnown: vi.fn(),
    getSpellcastingStats: vi.fn(),
    getSpellsForClass: vi.fn(),
  },
}));

vi.mock('@shared/components', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const components = { verbal: true, somatic: true, material: false, materialDescription: '' };
const mockSpells = {
  firebolt: { id: 'firebolt', name: 'Fire Bolt', level: 0, school: 'Evocation', description: 'Ranged spell attack.', classes: ['wizard'], ritual: false, concentration: false, components, castingTime: '1 action', range: '120 ft', duration: 'Instantaneous' },
  'magic-missile': { id: 'magic-missile', name: 'Magic Missile', level: 1, school: 'Evocation', description: 'Force darts.', classes: ['wizard'], ritual: false, concentration: false, components, castingTime: '1 action', range: '120 ft', duration: 'Instantaneous' },
  detect_magic: { id: 'detect_magic', name: 'Detect Magic', level: 1, school: 'Divination', description: 'Sense magic nearby.', classes: ['wizard'], ritual: true, concentration: true, components, castingTime: '1 action', range: 'Self', duration: '10 minutes' },
};

const defaultSpellSlots = { cantrips: 3, 1: 2, 2: 0 };

beforeEach(() => {
  vi.mocked(compendiumService.getSpells).mockResolvedValue({ spells: mockSpells, count: 3, metadata: {} } as unknown as Awaited<ReturnType<typeof compendiumService.getSpells>>);
  vi.mocked(spellManagementService.getSpellSlots).mockReturnValue(defaultSpellSlots as ReturnType<typeof spellManagementService.getSpellSlots>);
  vi.mocked(spellManagementService.getSpellsKnown).mockReturnValue(4);
  vi.mocked(spellManagementService.getSpellcastingStats).mockReturnValue({
    spellcastingAbility: 'Intelligence',
    spellSaveDC: 13,
    spellAttackBonus: 5,
    proficiencyBonus: 2,
  });
  vi.mocked(spellManagementService.getSpellsForClass).mockImplementation((spells) => spells);
});

afterEach(() => vi.clearAllMocks());

function renderStep(formValues: Partial<WizardFormData> = {}) {
  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    const methods = useForm<WizardFormData>({
      defaultValues: {
        name: 'Test',
        race: 'Human',
        class: 'wizard',
        background: 'sage',
        strength: 10, dexterity: 10, constitution: 10,
        intelligence: 16, wisdom: 10, charisma: 10,
        skills: [],
        advancement: { experiencePoints: 0, currentLevel: 1, levelHistory: [] },
        spells: { cantrips: [], knownSpells: [], preparedSpells: [] },
        ...formValues,
      },
    });
    return <FormProvider {...methods}>{children}</FormProvider>;
  };
  return render(
    <Wrapper>
      <SpellSelectionStep onNext={vi.fn()} />
    </Wrapper>
  );
}

describe('SpellSelectionStep', () => {
  describe('loading state', () => {
    it('shows loading spinner while fetching spells', () => {
      // compendiumService.getSpells never resolves in this test
      vi.mocked(compendiumService.getSpells).mockImplementation(() => new Promise(() => {}));
      renderStep();
      expect(screen.getByText(/select spells/i)).toBeTruthy();
      // The spinner container should be present
      const spinner = document.querySelector('[class*="spinner"]');
      expect(spinner).not.toBeNull();
    });
  });

  describe('renders spells after load', () => {
    it('shows cantrip name after data loads', async () => {
      renderStep();
      await waitFor(() => expect(screen.getByText('Fire Bolt')).toBeTruthy());
    });

    it('shows level-1 spell name after data loads', async () => {
      renderStep();
      await waitFor(() => expect(screen.getByText('Magic Missile')).toBeTruthy());
    });
  });

  describe('search filter', () => {
    it('typing "fire" shows only Fire Bolt', async () => {
      const user = userEvent.setup();
      renderStep();
      await waitFor(() => screen.getByText('Fire Bolt'));
      const searchInput = screen.getByPlaceholderText(/search spells/i);
      await user.type(searchInput, 'fire');
      expect(screen.getByText('Fire Bolt')).toBeTruthy();
      expect(screen.queryByText('Magic Missile')).toBeNull();
    });

    it('clearing search restores all spells', async () => {
      const user = userEvent.setup();
      renderStep();
      await waitFor(() => screen.getByText('Fire Bolt'));
      const searchInput = screen.getByPlaceholderText(/search spells/i);
      await user.type(searchInput, 'fire');
      await user.clear(searchInput);
      await waitFor(() => expect(screen.getByText('Magic Missile')).toBeTruthy());
    });
  });

  describe('level filter', () => {
    it('clicking level C (0) shows only cantrips', async () => {
      const user = userEvent.setup();
      renderStep();
      await waitFor(() => screen.getByText('Fire Bolt'));
      // Level 0 button is labeled 'C'
      await user.click(screen.getByRole('button', { name: 'C' }));
      expect(screen.getByText('Fire Bolt')).toBeTruthy();
      expect(screen.queryByText('Magic Missile')).toBeNull();
    });

    it('clicking level 1 shows only level-1 spells', async () => {
      const user = userEvent.setup();
      renderStep();
      await waitFor(() => screen.getByText('Magic Missile'));
      await user.click(screen.getByRole('button', { name: '1' }));
      expect(screen.queryByText('Fire Bolt')).toBeNull();
      expect(screen.getByText('Magic Missile')).toBeTruthy();
    });
  });

  describe('school filter', () => {
    it('selecting Divination school filters correctly', async () => {
      const user = userEvent.setup();
      renderStep();
      await waitFor(() => screen.getByText('Fire Bolt'));
      const schoolSelect = screen.getByRole('combobox', { name: '' });
      await user.selectOptions(schoolSelect, 'Divination');
      await waitFor(() => {
        expect(screen.queryByText('Fire Bolt')).toBeNull();
        expect(screen.getByText('Detect Magic')).toBeTruthy();
      });
    });
  });

  describe('spell toggle (cantrip)', () => {
    it('clicking a cantrip spell row does not throw and UI remains stable', async () => {
      const user = userEvent.setup();
      renderStep();
      await waitFor(() => screen.getByText('Fire Bolt'));
      const fireboltEl = screen.getByText('Fire Bolt');
      // Click the element — at minimum it should not crash
      await expect(user.click(fireboltEl)).resolves.not.toThrow();
      expect(screen.getAllByText('Fire Bolt').length).toBeGreaterThan(0);
    });
  });

  describe('expand spell details', () => {
    it('clicking spell name expands description', async () => {
      const user = userEvent.setup();
      renderStep();
      await waitFor(() => screen.getByText('Magic Missile'));
      // The spell name button/row triggers expand
      const spellEl = screen.getByText('Magic Missile');
      await user.click(spellEl);
      // After expanding, description text should be visible
      await waitFor(() => expect(screen.getByText(/force darts/i)).toBeTruthy());
    });
  });

  describe('error state', () => {
    it('shows error message when getSpells fails', async () => {
      vi.mocked(compendiumService.getSpells).mockRejectedValueOnce(new Error('Network error'));
      renderStep();
      await waitFor(() => expect(screen.getByText(/failed to load spell data/i)).toBeTruthy());
    });

    it('Retry button re-calls compendiumService.getSpells', async () => {
      vi.mocked(compendiumService.getSpells).mockRejectedValueOnce(new Error('Network error'));
      const user = userEvent.setup();
      renderStep();
      await waitFor(() => screen.getByRole('button', { name: /retry/i }));
      await user.click(screen.getByRole('button', { name: /retry/i }));
      expect(compendiumService.getSpells).toHaveBeenCalledTimes(2);
    });
  });
});
