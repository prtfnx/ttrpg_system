import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DMCombatPanel } from '../DMCombatPanel';
import { useCombatStore } from '../../stores/combatStore';
import { ProtocolService } from '@lib/api';
import { useGameStore } from '@/store';

vi.mock('@lib/api', () => ({
  ProtocolService: { getProtocol: vi.fn() },
}));

vi.mock('@lib/websocket', () => ({
  createMessage: vi.fn((type: string, data: unknown) => ({ type, data })),
  MessageType: {
    COMBAT_START: 'COMBAT_START',
    COMBAT_END: 'COMBAT_END',
    DM_SET_HP: 'DM_SET_HP',
    DM_SET_TEMP_HP: 'DM_SET_TEMP_HP',
    DM_APPLY_DAMAGE: 'DM_APPLY_DAMAGE',
    CONDITION_ADD: 'CONDITION_ADD',
    DM_SET_RESISTANCES: 'DM_SET_RESISTANCES',
    DM_SET_SURPRISED: 'DM_SET_SURPRISED',
    DM_REVERT_ACTION: 'DM_REVERT_ACTION',
    DM_SET_TERRAIN: 'DM_SET_TERRAIN',
  },
}));

const mockSendMessage = vi.fn();

const mockCombat = {
  combat_id: 'combat1',
  table_id: 'table1',
  current_turn_index: 0,
  round: 1,
  is_active: true,
  combatants: [
    {
      combatant_id: 'c1', entity_id: 'e1', character_id: null, name: 'Goblin',
      initiative: 12, has_action: true, has_bonus_action: true, has_reaction: true,
      movement_remaining: 30, movement_speed: 30, hp: 7, max_hp: 7, temp_hp: 0,
      armor_class: 15, conditions: [], is_npc: true, is_hidden: false,
      is_defeated: false, controlled_by: [], ai_enabled: false, ai_behavior: 'aggressive',
    },
    {
      combatant_id: 'c2', entity_id: 'e2', character_id: 'char2', name: 'Hero',
      initiative: 18, has_action: true, has_bonus_action: true, has_reaction: true,
      movement_remaining: 30, movement_speed: 30, hp: 20, max_hp: 20, temp_hp: 0,
      armor_class: 17, conditions: [], is_npc: false, is_hidden: false,
      is_defeated: false, controlled_by: ['player1'], ai_enabled: false, ai_behavior: 'none',
    },
  ],
  settings: {
    auto_roll_npc_initiative: true,
    auto_sort_initiative: true,
  },
};

beforeEach(() => {
  vi.mocked(ProtocolService.getProtocol).mockReturnValue({ sendMessage: mockSendMessage } as ReturnType<typeof ProtocolService.getProtocol>);
  // Set a default activeTableId
  useGameStore.setState({ activeTableId: 'table1' } as Parameters<typeof useGameStore.setState>[0]);
});

afterEach(() => {
  useCombatStore.setState({ combat: null });
  vi.clearAllMocks();
});

describe('DMCombatPanel — PreCombatSetup (no active combat)', () => {
  beforeEach(() => {
    useCombatStore.setState({ combat: null });
  });

  it('renders "No active combat" text', () => {
    render(<DMCombatPanel />);
    expect(screen.getByText(/no active combat/i)).toBeTruthy();
  });

  it('renders "Start Combat" button', () => {
    render(<DMCombatPanel />);
    expect(screen.getByRole('button', { name: /start combat/i })).toBeTruthy();
  });

  it('clicking Start Combat sends COMBAT_START', async () => {
    const user = userEvent.setup();
    render(<DMCombatPanel />);
    await user.click(screen.getByRole('button', { name: /start combat/i }));
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'COMBAT_START', data: expect.objectContaining({ table_id: expect.any(String) }) })
    );
  });
});

describe('DMCombatPanel — active combat', () => {
  beforeEach(() => {
    useCombatStore.setState({ combat: mockCombat });
  });

  it('does NOT render "No active combat"', () => {
    render(<DMCombatPanel />);
    expect(screen.queryByText(/no active combat/i)).toBeNull();
  });

  it('renders combatant names in the select', () => {
    render(<DMCombatPanel />);
    expect(screen.getAllByText('Goblin').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Hero').length).toBeGreaterThan(0);
  });

  it('renders End Combat and Revert buttons', () => {
    render(<DMCombatPanel />);
    expect(screen.getByRole('button', { name: /end combat/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /revert/i })).toBeTruthy();
  });
});

describe('DMCombatPanel — HP management', () => {
  beforeEach(() => useCombatStore.setState({ combat: mockCombat }));

  it('Set HP sends DM_SET_HP with correct combatant and hp value', async () => {
    const user = userEvent.setup();
    render(<DMCombatPanel />);

    // Select combatant
    const select = screen.getAllByRole('combobox')[0];
    await user.selectOptions(select, 'c1');

    // Enter HP value
    const hpInput = screen.getByPlaceholderText('HP');
    await user.clear(hpInput);
    await user.type(hpInput, '15');

    // Click Set
    const setButtons = screen.getAllByRole('button', { name: /^set$/i });
    await user.click(setButtons[0]);

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DM_SET_HP', data: { combatant_id: 'c1', hp: 15 } })
    );
  });

  it('Set HP does nothing when no combatant selected', async () => {
    const user = userEvent.setup();
    render(<DMCombatPanel />);
    const hpInput = screen.getByPlaceholderText('HP');
    await user.type(hpInput, '10');
    const setButtons = screen.getAllByRole('button', { name: /^set$/i });
    await user.click(setButtons[0]);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('Temp HP sends DM_SET_TEMP_HP', async () => {
    const user = userEvent.setup();
    render(<DMCombatPanel />);
    const select = screen.getAllByRole('combobox')[0];
    await user.selectOptions(select, 'c2');
    const tempInput = screen.getByPlaceholderText('Temp HP');
    await user.type(tempInput, '5');
    const setButtons = screen.getAllByRole('button', { name: /^set$/i });
    await user.click(setButtons[1]);
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DM_SET_TEMP_HP', data: { combatant_id: 'c2', temp_hp: 5 } })
    );
  });
});

describe('DMCombatPanel — damage', () => {
  beforeEach(() => useCombatStore.setState({ combat: mockCombat }));

  it('Apply Damage sends DM_APPLY_DAMAGE with correct values', async () => {
    const user = userEvent.setup();
    render(<DMCombatPanel />);
    const select = screen.getAllByRole('combobox')[0];
    await user.selectOptions(select, 'c1');
    const dmgInput = screen.getByPlaceholderText('Amount');
    await user.type(dmgInput, '8');
    await user.click(screen.getByRole('button', { name: /apply/i }));
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DM_APPLY_DAMAGE', data: { combatant_id: 'c1', amount: 8 } })
    );
  });

  it('Apply Damage does nothing when no combatant selected', async () => {
    const user = userEvent.setup();
    render(<DMCombatPanel />);
    const dmgInput = screen.getByPlaceholderText('Amount');
    await user.type(dmgInput, '5');
    await user.click(screen.getByRole('button', { name: /apply/i }));
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});

describe('DMCombatPanel — conditions', () => {
  beforeEach(() => useCombatStore.setState({ combat: mockCombat }));

  it('Add Condition sends CONDITION_ADD with correct payload', async () => {
    const user = userEvent.setup();
    render(<DMCombatPanel />);
    const select = screen.getAllByRole('combobox')[0];
    await user.selectOptions(select, 'c1');
    // Default condition is 'poisoned', duration is '1'
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CONDITION_ADD',
        data: { combatant_id: 'c1', condition_type: 'poisoned', duration: 1, source: 'dm' },
      })
    );
  });
});

describe('DMCombatPanel — resistances', () => {
  beforeEach(() => useCombatStore.setState({ combat: mockCombat }));

  it('sends DM_SET_RESISTANCES with parsed resistance list', async () => {
    const user = userEvent.setup();
    render(<DMCombatPanel />);
    const select = screen.getAllByRole('combobox')[0];
    await user.selectOptions(select, 'c1');
    const resistInput = screen.getByPlaceholderText(/fire, cold/i);
    await user.type(resistInput, 'fire, cold');
    const setBtn = screen.getAllByRole('button', { name: /^set$/i });
    // The resistance Set button is the last "Set" button
    await user.click(setBtn[setBtn.length - 1]);
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'DM_SET_RESISTANCES',
        data: expect.objectContaining({ combatant_id: 'c1', resistances: ['fire', 'cold'] }),
      })
    );
  });
});

describe('DMCombatPanel — surprise', () => {
  beforeEach(() => useCombatStore.setState({ combat: mockCombat }));

  it('checking combatant and clicking Set Surprised sends DM_SET_SURPRISED', async () => {
    const user = userEvent.setup();
    render(<DMCombatPanel />);
    // There are checkboxes for each combatant in the surprise section
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]); // check Goblin
    await user.click(screen.getByRole('button', { name: /set surprised/i }));
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'DM_SET_SURPRISED',
        data: { combatant_ids: ['c1'], surprised: true },
      })
    );
  });
});

describe('DMCombatPanel — end combat + revert', () => {
  beforeEach(() => useCombatStore.setState({ combat: mockCombat }));

  it('End Combat with confirm=true sends COMBAT_END', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('confirm', vi.fn(() => true));
    render(<DMCombatPanel />);
    await user.click(screen.getByRole('button', { name: /end combat/i }));
    expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'COMBAT_END' }));
    vi.unstubAllGlobals();
  });

  it('End Combat with confirm=false does NOT send COMBAT_END', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('confirm', vi.fn(() => false));
    render(<DMCombatPanel />);
    await user.click(screen.getByRole('button', { name: /end combat/i }));
    expect(mockSendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'COMBAT_END' }));
    vi.unstubAllGlobals();
  });

  it('Revert button sends DM_REVERT_ACTION', async () => {
    const user = userEvent.setup();
    render(<DMCombatPanel />);
    await user.click(screen.getByRole('button', { name: /revert/i }));
    expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'DM_REVERT_ACTION' }));
  });
});

describe('DMCombatPanel — no protocol', () => {
  beforeEach(() => {
    useCombatStore.setState({ combat: null });
    vi.mocked(ProtocolService.getProtocol).mockReturnValue(null);
  });

  it('clicking Start Combat does not throw when protocol is null', async () => {
    const user = userEvent.setup();
    expect(() => render(<DMCombatPanel />)).not.toThrow();
    await expect(user.click(screen.getByRole('button', { name: /start combat/i }))).resolves.not.toThrow();
  });
});
