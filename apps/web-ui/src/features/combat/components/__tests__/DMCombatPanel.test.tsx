import { useGameStore } from '@/store';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCombatStore } from '../../stores/combatStore';
import { DMCombatPanel } from '../DMCombatPanel';

const mockSendMessage = vi.fn();
const mockUseOptionalProtocol = vi.fn();

vi.mock('@lib/api', () => ({
  useOptionalProtocol: () => mockUseOptionalProtocol(),
}));

vi.mock('@lib/websocket', () => ({
  createMessage: vi.fn((type: string, data: unknown) => ({ type, data })),
  MessageType: {
    COMBAT_COMMAND: 'combat_command',
    DM_SET_TERRAIN: 'DM_SET_TERRAIN',
  },
}));

const mockCharacters = [
  {
    id: 'char1',
    sessionId: 'session1',
    name: 'Goblin',
    ownerId: 1,
    controlledBy: [],
    data: { stats: { hp: 7, maxHp: 7, ac: 15, speed: 30 } },
    version: 1,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'char2',
    sessionId: 'session1',
    name: 'Hero',
    ownerId: 1,
    controlledBy: [1],
    data: { stats: { hp: 20, maxHp: 20, ac: 17, speed: 30 } },
    version: 1,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'char3',
    sessionId: 'session1',
    name: 'Off Table',
    ownerId: 1,
    controlledBy: [],
    data: { stats: { hp: 12, maxHp: 12, ac: 12, speed: 30 } },
    version: 1,
    createdAt: '',
    updatedAt: '',
  },
];

const mockSprites = [
  {
    id: 'e1',
    name: 'Goblin Token',
    tableId: 'table1',
    characterId: 'char1',
    controlledBy: [],
    x: 0,
    y: 0,
    layer: 'tokens',
    texture: '',
    scale: { x: 1, y: 1 },
    rotation: 0,
    hp: 7,
    maxHp: 7,
    ac: 15,
  },
  {
    id: 'e2',
    name: 'Hero Token',
    tableId: 'table1',
    characterId: 'char2',
    controlledBy: ['1'],
    x: 0,
    y: 0,
    layer: 'tokens',
    texture: '',
    scale: { x: 1, y: 1 },
    rotation: 0,
    hp: 20,
    maxHp: 20,
    ac: 17,
  },
  {
    id: 'e3',
    name: 'Off Table Token',
    tableId: 'table2',
    characterId: 'char3',
    controlledBy: [],
    x: 0,
    y: 0,
    layer: 'tokens',
    texture: '',
    scale: { x: 1, y: 1 },
    rotation: 0,
  },
];

const mockCombat = {
  combat_id: 'combat1',
  session_id: 'session1',
  table_id: 'table1',
  phase: 'active' as const,
  round_number: 1,
  current_turn_index: 0,
  is_active: true,
  action_log: [],
  started_at: Date.now(),
  state_hash: 'hash1',
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
      spell_slots: { 1: 0, 2: 0 }, spell_slots_max: { 1: 4, 2: 2 },
    },
  ],
  settings: {
    auto_roll_npc_initiative: true,
    auto_sort_initiative: true,
    skip_defeated: false,
    allow_player_end_turn: false,
    show_npc_hp_to_players: 'none',
    group_initiative: false,
    ai_auto_act: false,
    death_saves_enabled: true,
    critical_hit_rule: 'max_die',
  },
};

beforeEach(() => {
  mockUseOptionalProtocol.mockReturnValue({ protocol: { sendMessage: mockSendMessage } });
  // Set a default activeTableId
  useGameStore.setState({
    activeTableId: 'table1',
    characters: mockCharacters,
    sprites: mockSprites,
  } as Parameters<typeof useGameStore.setState>[0]);
});

afterEach(() => {
  useCombatStore.setState({ combat: null });
  vi.clearAllMocks();
});

describe('DMCombatPanel - PreCombatSetup (no active combat)', () => {
  beforeEach(() => {
    useCombatStore.setState({ combat: null });
  });

  it('renders "No active combat" text', () => {
    render(<DMCombatPanel />);
    expect(screen.getByText(/no active combat/i)).toBeTruthy();
  });

  it('renders table-token and empty start buttons', () => {
    render(<DMCombatPanel />);
    expect(screen.getByRole('button', { name: /start with table tokens/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /start empty/i })).toBeTruthy();
  });

  it('clicking Start with Table Tokens sends a canonical start combat command with current table token entities', async () => {
    const user = userEvent.setup();
    render(<DMCombatPanel />);
    await user.click(screen.getByRole('button', { name: /start with table tokens/i }));
    const message = mockSendMessage.mock.calls[0]?.[0] as {
      data: { commands: Array<{ combatants: Record<string, unknown>[] }> };
    };
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'combat_command',
        data: expect.objectContaining({
          commands: [
            expect.objectContaining({
              type: 'start_combat',
              actor_id: '__dm__',
              table_id: 'table1',
              entity_ids: ['e1', 'e2'],
              names: { e1: 'Goblin', e2: 'Hero' },
              combatants: [
                expect.objectContaining({ entity_id: 'e1', character_id: 'char1', name: 'Goblin' }),
                expect.objectContaining({ entity_id: 'e2', character_id: 'char2', name: 'Hero' }),
              ],
            }),
          ],
        }),
      })
    );
    expect(message.data.commands[0].combatants[0]).not.toHaveProperty('hp');
    expect(message.data.commands[0].combatants[0]).not.toHaveProperty('armor_class');
  });
});

describe('DMCombatPanel - active combat', () => {
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

  it('adds linked token characters from the current table as combatants', async () => {
    const user = userEvent.setup();
    useCombatStore.setState({ combat: { ...mockCombat, combatants: [mockCombat.combatants[0]] } });

    render(<DMCombatPanel />);
    await user.click(screen.getByRole('button', { name: /add missing/i }));
    const message = mockSendMessage.mock.calls[0]?.[0] as {
      data: { commands: Array<Record<string, unknown>> };
    };

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'combat_command',
        data: expect.objectContaining({
          commands: [expect.objectContaining({
            type: 'add_combatant',
            actor_id: '__dm__',
            entity_id: 'e2',
            character_id: 'char2',
            name: 'Hero',
          })],
        }),
      })
    );
    expect(message.data.commands[0]).not.toHaveProperty('hp');
    expect(message.data.commands[0]).not.toHaveProperty('armor_class');
    expect(message.data.commands[0]).not.toEqual(expect.objectContaining({ entity_id: 'e3' }));
  });
});

describe('DMCombatPanel - HP management', () => {
  beforeEach(() => useCombatStore.setState({ combat: mockCombat }));

  it('Set HP sends a canonical DM override command', async () => {
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
      expect.objectContaining({
        type: 'combat_command',
        data: expect.objectContaining({
          commands: [expect.objectContaining({
            type: 'dm_override',
            actor_id: 'c1',
            override_type: 'set_hp',
            value: 15,
          })],
        }),
      })
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

  it('Temp HP sends a canonical DM override command', async () => {
    const user = userEvent.setup();
    render(<DMCombatPanel />);
    const select = screen.getAllByRole('combobox')[0];
    await user.selectOptions(select, 'c2');
    const tempInput = screen.getByPlaceholderText('Temp HP');
    await user.type(tempInput, '5');
    const setButtons = screen.getAllByRole('button', { name: /^set$/i });
    await user.click(setButtons[1]);
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'combat_command',
        data: expect.objectContaining({
          commands: [expect.objectContaining({
            type: 'dm_override',
            actor_id: 'c2',
            override_type: 'set_temp_hp',
            value: 5,
          })],
        }),
      })
    );
  });
});

describe('DMCombatPanel - damage', () => {
  beforeEach(() => useCombatStore.setState({ combat: mockCombat }));

  it('Apply Damage sends a canonical DM override command', async () => {
    const user = userEvent.setup();
    render(<DMCombatPanel />);
    const select = screen.getAllByRole('combobox')[0];
    await user.selectOptions(select, 'c1');
    const dmgInput = screen.getByPlaceholderText('Amount');
    await user.type(dmgInput, '8');
    await user.click(screen.getByRole('button', { name: /apply/i }));
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'combat_command',
        data: expect.objectContaining({
          commands: [expect.objectContaining({
            type: 'dm_override',
            actor_id: 'c1',
            override_type: 'apply_damage',
            value: 8,
          })],
        }),
      })
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

describe('DMCombatPanel - resource overrides', () => {
  beforeEach(() => useCombatStore.setState({ combat: mockCombat }));

  it('restores the selected combatant action through a canonical DM override', async () => {
    const user = userEvent.setup();
    render(<DMCombatPanel />);
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'c1');
    await user.click(screen.getByRole('button', { name: /restore action/i }));

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'combat_command',
        data: expect.objectContaining({
          commands: [expect.objectContaining({
            type: 'dm_override',
            actor_id: 'c1',
            override_type: 'grant_resource',
            resource: 'action',
            value: 1,
          })],
        }),
      }),
    );
  });

  it('grants the entered movement to the selected combatant', async () => {
    const user = userEvent.setup();
    render(<DMCombatPanel />);
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'c2');
    const movementInput = screen.getByPlaceholderText(/movement feet/i);
    await user.clear(movementInput);
    await user.type(movementInput, '15');
    await user.click(screen.getByRole('button', { name: /grant movement/i }));

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'combat_command',
        data: expect.objectContaining({
          commands: [expect.objectContaining({
            actor_id: 'c2',
            override_type: 'grant_resource',
            resource: 'movement',
            value: 15,
          })],
        }),
      }),
    );
  });

  it('keeps resource controls disabled until a combatant is selected', () => {
    render(<DMCombatPanel />);
    expect(screen.getByRole('button', { name: /restore action/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /grant movement/i })).toBeDisabled();
  });

  it('restores an available spell slot through a canonical DM override', async () => {
    const user = userEvent.setup();
    render(<DMCombatPanel />);
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'c2');
    await user.selectOptions(screen.getByLabelText(/spell slot level/i), '2');
    await user.click(screen.getByRole('button', { name: /restore spell slot/i }));

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'combat_command',
        data: expect.objectContaining({
          commands: [expect.objectContaining({
            actor_id: 'c2',
            override_type: 'restore_spell_slot',
            slot_level: 2,
          })],
        }),
      }),
    );
  });
});

describe('DMCombatPanel - conditions', () => {
  beforeEach(() => useCombatStore.setState({ combat: mockCombat }));

  it('adds a condition through a canonical DM override', async () => {
    const user = userEvent.setup();
    render(<DMCombatPanel />);
    const select = screen.getAllByRole('combobox')[0];
    await user.selectOptions(select, 'c1');
    // Default condition is 'poisoned', duration is '1'
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'combat_command',
        data: expect.objectContaining({
          commands: [expect.objectContaining({
            actor_id: 'c1',
            override_type: 'add_condition',
            condition_type: 'poisoned',
            duration: 1,
            source: 'dm',
          })],
        }),
      })
    );
  });

  it('removes an existing condition through a canonical DM override', async () => {
    const user = userEvent.setup();
    useCombatStore.setState({
      combat: {
        ...mockCombat,
        combatants: mockCombat.combatants.map((combatant) => (
          combatant.combatant_id === 'c1'
            ? {
                ...combatant,
                conditions: [{
                  condition_id: 'condition-1',
                  condition_type: 'prone',
                  source: 'dm',
                  duration_type: 'permanent',
                  duration_remaining: null,
                }],
              }
            : combatant
        )),
      },
    });
    render(<DMCombatPanel />);
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'c1');
    await user.click(screen.getByRole('button', { name: /remove prone/i }));

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'combat_command',
        data: expect.objectContaining({
          commands: [expect.objectContaining({
            actor_id: 'c1',
            override_type: 'remove_condition',
            condition_type: 'prone',
          })],
        }),
      }),
    );
  });
});

describe('DMCombatPanel - resistances', () => {
  beforeEach(() => useCombatStore.setState({ combat: mockCombat }));

  it('sets parsed damage traits through a canonical DM override', async () => {
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
        type: 'combat_command',
        data: expect.objectContaining({
          commands: [expect.objectContaining({
            actor_id: 'c1',
            override_type: 'set_damage_traits',
            resistances: ['fire', 'cold'],
          })],
        }),
      })
    );
  });
});

describe('DMCombatPanel - surprise', () => {
  beforeEach(() => useCombatStore.setState({ combat: mockCombat }));

  it('sets checked combatants as surprised through one canonical batch', async () => {
    const user = userEvent.setup();
    render(<DMCombatPanel />);
    // There are checkboxes for each combatant in the surprise section
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]); // check Goblin
    await user.click(screen.getByRole('button', { name: /set surprised/i }));
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'combat_command',
        data: expect.objectContaining({
          commands: [expect.objectContaining({
            actor_id: 'c1',
            override_type: 'set_surprised',
            surprised: true,
          })],
        }),
      })
    );
  });
});

describe('DMCombatPanel - end combat + revert', () => {
  beforeEach(() => useCombatStore.setState({ combat: mockCombat }));

  it('End Combat with confirm=true sends a canonical end combat command', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('confirm', vi.fn(() => true));
    render(<DMCombatPanel />);
    await user.click(screen.getByRole('button', { name: /end combat/i }));
    expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'combat_command',
      data: expect.objectContaining({
        commands: [expect.objectContaining({
          type: 'end_combat',
          actor_id: '__dm__',
        })],
      }),
    }));
    vi.unstubAllGlobals();
  });

  it('End Combat with confirm=false does not send a command', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('confirm', vi.fn(() => false));
    render(<DMCombatPanel />);
    await user.click(screen.getByRole('button', { name: /end combat/i }));
    expect(mockSendMessage).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('Revert button sends a canonical DM command', async () => {
    const user = userEvent.setup();
    render(<DMCombatPanel />);
    await user.click(screen.getByRole('button', { name: /revert/i }));
    expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'combat_command',
      data: expect.objectContaining({
        commands: [expect.objectContaining({
          type: 'revert_action',
          actor_id: '__dm__',
        })],
      }),
    }));
  });
});

describe('DMCombatPanel - no protocol', () => {
  beforeEach(() => {
    useCombatStore.setState({ combat: null });
    mockUseOptionalProtocol.mockReturnValue(null);
  });

  it('clicking Start with Table Tokens does not throw when protocol is null', async () => {
    const user = userEvent.setup();
    expect(() => render(<DMCombatPanel />)).not.toThrow();
    await expect(user.click(screen.getByRole('button', { name: /start with table tokens/i }))).resolves.not.toThrow();
  });
});
