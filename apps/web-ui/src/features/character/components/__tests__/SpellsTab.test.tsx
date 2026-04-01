import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SpellsTab } from '../SpellsTab';

vi.mock('@features/compendium', () => ({
  useSpells: () => ({ data: null }),
}));

vi.mock('@features/character/services/spellManagement.service', () => ({
  spellManagementService: {
    getSpellSlots: (_cls: string, level: number) => ({
      1: level >= 1 ? 4 : 0,
      2: level >= 3 ? 3 : 0,
    }),
  },
}));

const baseData = {
  class: 'Wizard',
  level: 5,
  spells: { cantrips: [], knownSpells: ['Magic Missile'], preparedSpells: [] },
  spellSlotsUsed: {},
};

describe('SpellsTab', () => {
  const user = userEvent.setup();

  it('renders available spell slot pips', () => {
    render(<SpellsTab data={baseData} onSave={vi.fn()} />);
    expect(screen.getByText('Lvl 1')).toBeInTheDocument();
    expect(screen.getByText('Lvl 2')).toBeInTheDocument();
  });

  it('calling useSlot saves incremented slot count', async () => {
    const onSave = vi.fn();
    render(<SpellsTab data={baseData} onSave={onSave} />);

    // First pip for level 1 is available — click it to use a slot
    const pips = screen.getAllByTitle('Click to use slot');
    await user.click(pips[0]);

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ spellSlotsUsed: expect.objectContaining({ 1: 1 }) })
    );
  });

  it('clicking a used pip recovers the slot', async () => {
    const onSave = vi.fn();
    const dataWithUsed = { ...baseData, spellSlotsUsed: { 1: 4 } }; // all used
    render(<SpellsTab data={dataWithUsed} onSave={onSave} />);

    const recoverPip = screen.getAllByTitle('Click to recover slot')[0];
    await user.click(recoverPip);

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ spellSlotsUsed: expect.objectContaining({ 1: 3 }) })
    );
  });

  it('Long Rest resets all used slots', async () => {
    const onSave = vi.fn();
    const dataWithUsed = { ...baseData, spellSlotsUsed: { 1: 2, 2: 1 } };
    render(<SpellsTab data={dataWithUsed} onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: /long rest/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ spellSlotsUsed: {} })
    );
  });

  it('shows empty message when character has no spell slots', () => {
    const nonCaster = { ...baseData, class: 'Fighter', level: 1 };
    // spellManagement mock returns 0 for fighter level 1 — but our mock always returns based on level
    // Override to test the no-slots path by removing level > threshold
    const noSlotData = { ...nonCaster, level: 0 };
    render(<SpellsTab data={noSlotData} onSave={vi.fn()} />);
    expect(screen.getByText(/no spell slots/i)).toBeInTheDocument();
  });
});
