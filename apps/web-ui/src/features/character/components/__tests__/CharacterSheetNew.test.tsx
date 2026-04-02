import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CharacterSheet } from '../CharacterSheetNew';

// --- Mocks ---

const mockRollAbilitySave = vi.fn();
const mockRollAbilityCheck = vi.fn();
const mockRollAttack = vi.fn();
const mockRollDeathSave = vi.fn();
const mockRollSkill = vi.fn();

let mockIsConnected = true;

vi.mock('@lib/api', () => ({
  ProtocolService: {
    hasProtocol: vi.fn(() => true),
    getProtocol: vi.fn(() => ({
      rollAbilitySave: mockRollAbilitySave,
      rollAbilityCheck: mockRollAbilityCheck,
      rollAttack: mockRollAttack,
      rollDeathSave: mockRollDeathSave,
      rollSkill: mockRollSkill,
    })),
  },
  useProtocol: () => ({ isConnected: mockIsConnected }),
}));

vi.mock('@shared/utils', () => ({
  showToast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// Stub heavy child tabs
vi.mock('../SpellsTab', () => ({
  SpellsTab: () => <div data-testid="spells-tab" />,
}));
vi.mock('../InventoryTab', () => ({
  InventoryTab: () => <div data-testid="inventory-tab" />,
}));
vi.mock('../ActivityTab', () => ({
  ActivityTab: () => <div data-testid="activity-tab" />,
}));

// Store mock — CharacterSheet uses useGameStore for sprites; provide empty defaults
vi.mock('../../../store', () => ({
  useGameStore: vi.fn(() => ({
    sprites: {},
    activeTableId: null,
    getSpritesForCharacter: vi.fn(() => []),
    linkSpriteToCharacter: vi.fn(),
  })),
}));

// --- Fixture ---

function makeCharacter(overrides: Record<string, unknown> = {}) {
  return {
    id: 'char-1',
    name: 'Test Hero',
    session_id: 1,
    user_id: 1,
    version: 1,
    data: {
      class: 'Fighter',
      level: 5,
      proficiencyBonus: 3,
      abilityScores: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 },
      stats: {
        hp: 10,
        maxHp: 25,
        ac: 15,
        speed: 30,
        initiative: 2,
        deathSaves: { successes: 0, failures: 0 },
      },
      savingThrows: { str: true, dex: false, con: false, int: false, wis: false, cha: false },
      skills: {},
      spellSlotsUsed: {},
      hitDiceUsed: 0,
      ...((overrides.data as object) ?? {}),
    },
    ...overrides,
  };
}

// --- Tests ---

describe('CharacterSheet — roll buttons', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    mockIsConnected = true;
    vi.clearAllMocks();
  });

  it('clicking STR save roll button calls rollAbilitySave for str', async () => {
    render(<CharacterSheet character={makeCharacter() as never} onSave={vi.fn()} />);

    const strSaveBtn = screen.getByTitle(/Roll STR saving throw/i);
    await user.click(strSaveBtn);

    expect(mockRollAbilitySave).toHaveBeenCalledWith('char-1', 'str', expect.any(Number));
  });

  it('clicking STR ability check button calls rollAbilityCheck for str', async () => {
    render(<CharacterSheet character={makeCharacter() as never} onSave={vi.fn()} />);

    const strCheckBtn = screen.getByTitle(/Roll STR check/i);
    await user.click(strCheckBtn);

    expect(mockRollAbilityCheck).toHaveBeenCalledWith('char-1', 'str', expect.any(Number));
  });

  it('clicking Melee attack button calls rollAttack with melee', async () => {
    render(<CharacterSheet character={makeCharacter() as never} onSave={vi.fn()} />);

    // Navigate to core tab — it's default
    const meleeBtn = screen.getByText('Melee').closest('button') as HTMLElement;
    await user.click(meleeBtn);

    expect(mockRollAttack).toHaveBeenCalledWith('char-1', 'melee', expect.any(Number));
  });

  it('clicking Ranged attack button calls rollAttack with ranged', async () => {
    render(<CharacterSheet character={makeCharacter() as never} onSave={vi.fn()} />);

    const rangedBtn = screen.getByText('Ranged').closest('button') as HTMLElement;
    await user.click(rangedBtn);

    expect(mockRollAttack).toHaveBeenCalledWith('char-1', 'ranged', expect.any(Number));
  });

  it('does not call protocol if not connected', async () => {
    mockIsConnected = false;
    render(<CharacterSheet character={makeCharacter() as never} onSave={vi.fn()} />);

    const strCheckBtn = screen.getByTitle(/Roll STR check/i);
    await user.click(strCheckBtn);

    expect(mockRollAbilityCheck).not.toHaveBeenCalled();
  });
});

describe('CharacterSheet — death save button', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    mockIsConnected = true;
    vi.clearAllMocks();
  });

  it('death save button is NOT shown when hp > 0', () => {
    render(<CharacterSheet character={makeCharacter({ data: { stats: { hp: 5, maxHp: 25 } } }) as never} onSave={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /Roll Death Save/i })).not.toBeInTheDocument();
  });

  it('death save button IS shown when hp = 0', () => {
    render(<CharacterSheet character={makeCharacter({ data: { stats: { hp: 0, maxHp: 25, deathSaves: { successes: 0, failures: 0 } } } }) as never} onSave={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Roll Death Save/i })).toBeInTheDocument();
  });

  it('clicking roll death save calls rollDeathSave', async () => {
    render(<CharacterSheet character={makeCharacter({ data: { stats: { hp: 0, maxHp: 25, deathSaves: { successes: 0, failures: 0 } } } }) as never} onSave={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Roll Death Save/i }));

    expect(mockRollDeathSave).toHaveBeenCalledWith('char-1');
  });

  it('death save roll is blocked when not connected', async () => {
    mockIsConnected = false;
    render(<CharacterSheet character={makeCharacter({ data: { stats: { hp: 0, maxHp: 25, deathSaves: { successes: 0, failures: 0 } } } }) as never} onSave={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Roll Death Save/i }));

    expect(mockRollDeathSave).not.toHaveBeenCalled();
  });
});

describe('CharacterSheet — rest buttons', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    mockIsConnected = true;
    vi.clearAllMocks();
  });

  it('Long Rest restores HP to maxHp and resets death saves', async () => {
    const onSave = vi.fn();
    render(<CharacterSheet character={makeCharacter() as never} onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: /Long Rest/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stats: expect.objectContaining({ hp: 25, deathSaves: { successes: 0, failures: 0 } }),
          spellSlotsUsed: {},
        }),
      })
    );
  });

  it('Long Rest clears spell slots', async () => {
    const onSave = vi.fn();
    const char = makeCharacter({ data: { spellSlotsUsed: { 1: 3, 2: 1 }, stats: { hp: 10, maxHp: 20 } } });
    render(<CharacterSheet character={char as never} onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: /Long Rest/i }));

    const saved = onSave.mock.calls[0][0] as { data: { spellSlotsUsed: Record<string, number> } };
    expect(saved.data.spellSlotsUsed).toEqual({});
  });

  it('Short Rest shows info toast', async () => {
    const { showToast } = await import('@shared/utils');
    render(<CharacterSheet character={makeCharacter() as never} onSave={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Short Rest/i }));

    expect(showToast.info).toHaveBeenCalled();
  });

  it('Short Rest does not call onSave', async () => {
    const onSave = vi.fn();
    render(<CharacterSheet character={makeCharacter() as never} onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: /Short Rest/i }));

    expect(onSave).not.toHaveBeenCalled();
  });
});
