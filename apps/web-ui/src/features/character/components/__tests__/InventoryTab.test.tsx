import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InventoryTab } from '../InventoryTab';

vi.mock('@features/character/services/equipmentManagement.service', () => ({
  equipmentManagementService: {
    searchEquipment: vi.fn(() => []),
  },
}));

const sword = {
  equipment: { name: 'Longsword', weight: 3, cost: { amount: 15, unit: 'gp' } },
  quantity: 1,
  equipped: false,
};

const baseData = {
  equipment: { items: [sword], currency: { cp: 0, sp: 0, ep: 0, gp: 10, pp: 0 } },
  abilityScores: { str: 10 },
};

describe('InventoryTab', () => {
  const user = userEvent.setup();

  it('renders existing items', () => {
    render(<InventoryTab data={baseData} onSave={vi.fn()} />);
    expect(screen.getByText('Longsword')).toBeInTheDocument();
  });

  it('incrementing quantity calls onSave with updated qty', async () => {
    const onSave = vi.fn();
    render(<InventoryTab data={baseData} onSave={onSave} />);

    const plusBtn = screen.getByRole('button', { name: '+' });
    await user.click(plusBtn);

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        equipment: expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ quantity: 2 }),
          ]),
        }),
      })
    );
  });

  it('decrementing quantity stops at 1', async () => {
    const onSave = vi.fn();
    render(<InventoryTab data={baseData} onSave={onSave} />);

    const minusBtn = screen.getByRole('button', { name: '−' });
    await user.click(minusBtn);

    // quantity was 1 → stays 1
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        equipment: expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ quantity: 1 }),
          ]),
        }),
      })
    );
  });

  it('equip toggle changes equipped state', async () => {
    const onSave = vi.fn();
    render(<InventoryTab data={baseData} onSave={onSave} />);

    const equipBtn = screen.getByRole('button', { name: 'Stowed' });
    await user.click(equipBtn);

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        equipment: expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ equipped: true }),
          ]),
        }),
      })
    );
  });

  it('remove button deletes the item', async () => {
    const onSave = vi.fn();
    render(<InventoryTab data={baseData} onSave={onSave} />);

    const removeBtn = screen.getByRole('button', { name: '×' });
    await user.click(removeBtn);

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        equipment: expect.objectContaining({ items: [] }),
      })
    );
  });

  it('shows empty state text when no items', () => {
    const empty = { ...baseData, equipment: { ...baseData.equipment, items: [] } };
    render(<InventoryTab data={empty} onSave={vi.fn()} />);
    expect(screen.getByText(/no equipment/i)).toBeInTheDocument();
  });
});
