import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm, FormProvider } from 'react-hook-form';
import { EquipmentSelectionStep } from '../EquipmentSelectionStep';
import { equipmentManagementService, equipmentToWizardItem } from '../../../services/equipmentManagement.service';
import { useBackgrounds } from '@features/compendium';
import type { WizardFormData } from '../WizardFormData';

vi.mock('../../../services/equipmentManagement.service', () => ({
  equipmentManagementService: {
    getAllEquipment: vi.fn(),
    getStartingEquipment: vi.fn().mockReturnValue({ equipment: [] }),
  },
  equipmentToWizardItem: vi.fn((eq: { name: string; weight: number; cost: { quantity: number; unit: string } }, qty: number) => ({
    equipment: { name: eq.name, weight: eq.weight, cost: { amount: eq.cost.quantity, unit: eq.cost.unit } },
    quantity: qty,
    equipped: false,
  })),
}));

vi.mock('@features/compendium', () => ({
  useBackgrounds: vi.fn(),
}));

vi.mock('@shared/components', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockEquipment = [
  { id: 'longsword', name: 'Longsword', category: 'weapon', weight: 3, cost: { quantity: 15, unit: 'gp' }, description: '1d8 slashing damage.' },
  { id: 'leather', name: 'Leather Armor', category: 'armor', weight: 10, cost: { quantity: 10, unit: 'gp' }, description: 'AC 11 + DEX mod.' },
  { id: 'torch', name: 'Torch', category: 'gear', weight: 1, cost: { quantity: 1, unit: 'sp' }, description: 'Provides light.' },
];

beforeEach(() => {
  vi.mocked(equipmentManagementService.getAllEquipment).mockResolvedValue(mockEquipment as Awaited<ReturnType<typeof equipmentManagementService.getAllEquipment>>);
  vi.mocked(useBackgrounds).mockReturnValue({ data: [] } as ReturnType<typeof useBackgrounds>);
});

afterEach(() => vi.clearAllMocks());

function renderStep(formValues: Partial<WizardFormData> = {}) {
  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    const methods = useForm<WizardFormData>({
      defaultValues: {
        name: 'Test',
        race: 'Human',
        class: 'fighter',
        background: 'soldier',
        strength: 16, dexterity: 14, constitution: 12,
        intelligence: 10, wisdom: 10, charisma: 8,
        skills: [],
        advancement: { experiencePoints: 0, currentLevel: 1, levelHistory: [] },
        equipment: {
          items: [],
          currency: { cp: 0, sp: 0, ep: 0, gp: 125, pp: 0 },
          carrying_capacity: { current_weight: 0, max_weight: 240, encumbered_at: 80, heavily_encumbered_at: 160 },
        },
        ...formValues,
      },
    });
    return <FormProvider {...methods}>{children}</FormProvider>;
  };
  return render(
    <Wrapper>
      <EquipmentSelectionStep onNext={vi.fn()} />
    </Wrapper>
  );
}

describe('EquipmentSelectionStep', () => {
  describe('loading state', () => {
    it('shows loading indicator while equipment fetches', () => {
      vi.mocked(equipmentManagementService.getAllEquipment).mockImplementation(() => new Promise(() => {}));
      renderStep();
      const loadingEl = document.querySelector('[class*="loading"]') || screen.queryByText(/loading/i);
      expect(loadingEl).not.toBeNull();
    });
  });

  describe('renders equipment list', () => {
    it('shows equipment names after load', async () => {
      renderStep();
      await waitFor(() => expect(screen.getByText('Longsword')).toBeTruthy());
      expect(screen.getByText('Leather Armor')).toBeTruthy();
    });

    it('shows equipment costs', async () => {
      renderStep();
      await waitFor(() => screen.getByText('Longsword'));
      expect(screen.getByText('15 gp')).toBeTruthy();
    });
  });

  describe('category filter', () => {
    it('clicking Weapon category button shows only weapons', async () => {
      const user = userEvent.setup();
      renderStep();
      await waitFor(() => screen.getByText('Longsword'));
      await user.click(screen.getByRole('button', { name: /^weapon$/i }));
      await waitFor(() => {
        expect(screen.getByText('Longsword')).toBeTruthy();
        expect(screen.queryByText('Leather Armor')).toBeNull();
      });
    });

    it('clicking All category button shows all items', async () => {
      const user = userEvent.setup();
      renderStep();
      await waitFor(() => screen.getByText('Longsword'));
      await user.click(screen.getByRole('button', { name: /^weapon$/i }));
      await user.click(screen.getByRole('button', { name: /^all$/i }));
      await waitFor(() => {
        expect(screen.getByText('Longsword')).toBeTruthy();
        expect(screen.getByText('Leather Armor')).toBeTruthy();
      });
    });
  });

  describe('search filter', () => {
    it('typing "leather" shows only Leather Armor', async () => {
      const user = userEvent.setup();
      renderStep();
      await waitFor(() => screen.getByText('Longsword'));
      const searchInput = screen.getByPlaceholderText(/search/i);
      await user.type(searchInput, 'leather');
      await waitFor(() => {
        expect(screen.getByText('Leather Armor')).toBeTruthy();
        expect(screen.queryByText('Longsword')).toBeNull();
      });
    });
  });

  describe('add item / gold deduction', () => {
    it('clicking + on Longsword decreases gold by 15', async () => {
      const user = userEvent.setup();
      renderStep();
      await waitFor(() => screen.getByText('Longsword'));
      // Find the + buttons (add-equipment-button), first one is for Longsword (first in list)
      const addBtns = screen.getAllByRole('button', { name: '+' });
      await user.click(addBtns[0]);
      // Fighter starts with 125gp; after longsword (15gp) should show 110
      await waitFor(() => expect(screen.getByText(/110/)).toBeTruthy());
    });

    it('starting gold is shown in the UI', async () => {
      renderStep();
      await waitFor(() => screen.getByText('Longsword'));
      // Fighter starting gold 125gp — check it appears somewhere in document
      expect(document.body.textContent).toMatch(/125/);
    });
  });

  describe('error state', () => {
    it('shows error message when getAllEquipment fails', async () => {
      vi.mocked(equipmentManagementService.getAllEquipment).mockRejectedValueOnce(new Error('Network error'));
      renderStep();
      await waitFor(() => expect(screen.getByText(/network error/i)).toBeTruthy());
    });
  });
});

// Pure helper function tests (tested via rendered output indirectly)
describe('costToGold and formatCost helpers (via rendered UI)', () => {
  it('gp cost shown directly (15 gp)', async () => {
    renderStep();
    await waitFor(() => screen.getByText('15 gp'));
  });

  it('sp cost shown in proper unit (1 sp for Torch)', async () => {
    renderStep();
    await waitFor(() => expect(screen.getByText('1 sp')).toBeTruthy());
  });
});
