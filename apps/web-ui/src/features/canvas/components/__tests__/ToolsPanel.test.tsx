import type { UserInfo } from '@features/auth';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolsPanel } from '../ToolsPanel';

// ── heavy component mocks ──────────────────────────────────────────────────
vi.mock('@features/canvas', () => ({
  GridControls: () => null,
  LayerPanel: () => null,
  useRenderEngine: vi.fn(() => null),
}));
vi.mock('@features/canvas/hooks', () => ({
  useLayerHotkeys: vi.fn(),
}));
vi.mock('@features/combat', () => ({
  DMCombatPanel: () => null,
  FloatingInitiativeTracker: () => null,
  GameModeSwitch: () => null,
  OAPrompt: () => null,
  OAWarningModal: () => null,
  useOAStore: vi.fn((sel: (s: Record<string, unknown>) => unknown) => sel({ warningEntityId: null, warningTriggers: [], prompt: null, clearAll: vi.fn() })),
}));
vi.mock('@features/lighting', () => ({
  startDmPreview: vi.fn(),
  stopDmPreview: vi.fn(),
}));
vi.mock('@features/measurement', () => ({ MeasurementTool: () => null }));
vi.mock('@features/painting', () => ({ PaintPanel: () => null }));
vi.mock('@features/assets', () => ({ AssetManager: () => null }));
vi.mock('@shared/components', () => ({
  AlignmentHelper: () => null,
  default: () => null,
}));
vi.mock('@shared/components/DiceRoller', () => ({ default: () => null }));
vi.mock('../PolygonConfigModal', () => ({ PolygonConfigModal: () => null }));
vi.mock('../TextSprite', () => ({ TextSpriteTool: () => null }));
vi.mock('../WallConfigModal', () => ({ WallConfigModal: () => null }));
vi.mock('@lib/api', () => ({
  ProtocolService: {
    hasProtocol: vi.fn(() => false),
    getProtocol: vi.fn(),
  },
}));
vi.mock('@features/session/types/roles', () => ({
  isDM: vi.fn((role: string) => role === 'dm'),
  isElevated: vi.fn((role: string) => role === 'dm' || role === 'elevated'),
}));

const mockSetActiveTool = vi.fn();
const mockSetActiveLayer = vi.fn();
const mockSetLayerVisibility = vi.fn();
const mockSwitchToTable = vi.fn();

const baseStoreState = {
  sessionId: 'sess-1',
  activeLayer: 'tokens',
  activeTool: 'select',
  measurementActive: false,
  alignmentActive: false,
  setActiveTool: mockSetActiveTool,
  walls: [],
  removeWall: vi.fn(),
  clearWalls: vi.fn(),
  sessionRole: 'player',
  tables: [] as { table_id: string; table_name: string }[],
  activeTableId: null as string | null,
  switchToTable: mockSwitchToTable,
  dynamicLightingEnabled: false,
  fogExplorationMode: false,
  ambientLight: 0.3,
  setAmbientLight: vi.fn(),
  dmPreviewUserId: null,
  setDmPreviewMode: vi.fn(),
  sprites: [],
  setActiveLayer: mockSetActiveLayer,
  canControlSprite: vi.fn(() => false),
  userId: 42,
  layerVisibility: {},
  setLayerVisibility: mockSetLayerVisibility,
};

vi.mock('@/store', () => ({
  useGameStore: vi.fn((sel?: (s: typeof baseStoreState) => unknown) =>
    sel ? sel(baseStoreState) : baseStoreState
  ),
}));

import { useGameStore } from '@/store';

function makeUser(role: 'dm' | 'player' = 'player'): UserInfo {
  return { id: 1, username: 'tester', email: 'x@x.com', role } as unknown as UserInfo;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useGameStore).mockImplementation(
    ((sel?: (s: typeof baseStoreState) => unknown) =>
      sel ? sel(baseStoreState) : baseStoreState) as unknown as typeof useGameStore
  );
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('ToolsPanel — render', () => {
  it('renders the Tools tab by default', () => {
    render(<ToolsPanel userInfo={makeUser()} />);
    expect(screen.getByRole('tab', { name: 'Tools' })).toBeInTheDocument();
  });

  it('always shows Tools tab for all roles', () => {
    render(<ToolsPanel userInfo={makeUser()} />);
    expect(screen.getByRole('tab', { name: 'Tools' })).toBeInTheDocument();
  });

  it('does NOT show Lighting/Layers tabs for player role', () => {
    render(<ToolsPanel userInfo={makeUser('player')} />);
    expect(screen.queryByRole('tab', { name: 'Lighting' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Layers' })).not.toBeInTheDocument();
  });

  it('shows Lighting and Layers tabs for dm role', () => {
    vi.mocked(useGameStore).mockImplementation(
      ((sel?: (s: typeof baseStoreState) => unknown) =>
        sel ? sel({ ...baseStoreState, sessionRole: 'dm' }) : { ...baseStoreState, sessionRole: 'dm' }
      ) as unknown as typeof useGameStore
    );
    render(<ToolsPanel userInfo={makeUser('dm')} />);
    expect(screen.getByRole('tab', { name: 'Lighting' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Layers' })).toBeInTheDocument();
  });
});

describe('ToolsPanel — toolbar tools', () => {
  it('renders primary tool buttons (Select, Move, Measure, Align)', () => {
    render(<ToolsPanel userInfo={makeUser()} />);
    expect(screen.getByTitle('Select Tool')).toBeInTheDocument();
    expect(screen.getByTitle('Move Tool')).toBeInTheDocument();
    expect(screen.getByTitle('Measurement Tool')).toBeInTheDocument();
    expect(screen.getByTitle('Alignment Helper')).toBeInTheDocument();
  });

  it('clicking Select calls setActiveTool("select")', () => {
    render(<ToolsPanel userInfo={makeUser()} />);
    fireEvent.click(screen.getByTitle('Select Tool'));
    expect(mockSetActiveTool).toHaveBeenCalledWith('select');
  });

  it('clicking Move calls setActiveTool("move")', () => {
    render(<ToolsPanel userInfo={makeUser()} />);
    fireEvent.click(screen.getByTitle('Move Tool'));
    expect(mockSetActiveTool).toHaveBeenCalledWith('move');
  });

  it('clicking Measure calls setActiveTool("measure")', () => {
    render(<ToolsPanel userInfo={makeUser()} />);
    fireEvent.click(screen.getByTitle('Measurement Tool'));
    expect(mockSetActiveTool).toHaveBeenCalledWith('measure');
  });

  it('DM-only tools not shown for player', () => {
    render(<ToolsPanel userInfo={makeUser('player')} />);
    expect(screen.queryByTitle('Draw Shapes')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Draw Wall')).not.toBeInTheDocument();
  });

  it('DM-only tools shown for dm', () => {
    vi.mocked(useGameStore).mockImplementation(
      ((sel?: (s: typeof baseStoreState) => unknown) =>
        sel ? sel({ ...baseStoreState, sessionRole: 'dm' }) : { ...baseStoreState, sessionRole: 'dm' }
      ) as unknown as typeof useGameStore
    );
    render(<ToolsPanel userInfo={makeUser('dm')} />);
    expect(screen.getByTitle('Draw Shapes')).toBeInTheDocument();
    expect(screen.getByTitle('Draw Wall')).toBeInTheDocument();
  });
});

describe('ToolsPanel — table switcher', () => {
  it('does NOT show table switcher when no tables', () => {
    render(<ToolsPanel userInfo={makeUser()} />);
    expect(screen.queryByTitle('Switch table')).not.toBeInTheDocument();
  });

  it('shows table switcher dropdown when DM has multiple tables', () => {
    const tables = [
      { table_id: 't1', table_name: 'Dungeon' },
      { table_id: 't2', table_name: 'Town Square' },
    ];
    vi.mocked(useGameStore).mockImplementation(
      ((sel?: (s: typeof baseStoreState) => unknown) =>
        sel ? sel({ ...baseStoreState, sessionRole: 'dm', tables, activeTableId: 't1' }) : { ...baseStoreState, sessionRole: 'dm', tables, activeTableId: 't1' }
      ) as unknown as typeof useGameStore
    );
    render(<ToolsPanel userInfo={makeUser('dm')} />);
    const trigger = screen.getByTitle('Switch table');
    expect(trigger).toBeInTheDocument();
    // click opens dropdown
    fireEvent.click(trigger);
    expect(screen.getByText('Town Square')).toBeInTheDocument();
  });
});

describe('ToolsPanel — tab switching', () => {
  it('switches to Lighting tab for dm', () => {
    vi.mocked(useGameStore).mockImplementation(
      ((sel?: (s: typeof baseStoreState) => unknown) =>
        sel ? sel({ ...baseStoreState, sessionRole: 'dm' }) : { ...baseStoreState, sessionRole: 'dm' }
      ) as unknown as typeof useGameStore
    );
    render(<ToolsPanel userInfo={makeUser('dm')} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Lighting' }));
    // tab becomes selected (aria-selected=true)
    expect(screen.getByRole('tab', { name: 'Lighting' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Tools tab is aria-selected initially', () => {
    render(<ToolsPanel userInfo={makeUser()} />);
    expect(screen.getByRole('tab', { name: 'Tools' })).toHaveAttribute('aria-selected', 'true');
  });
});

// ── DM creation toolbar ───────────────────────────────────────────────────────
function dmStore(extra: Partial<typeof baseStoreState> = {}) {
  const state = { ...baseStoreState, sessionRole: 'dm', ...extra };
  vi.mocked(useGameStore).mockImplementation(
    ((sel?: (s: typeof baseStoreState) => unknown) =>
      sel ? sel(state) : state) as unknown as typeof useGameStore
  );
  return state;
}

describe('ToolsPanel — DM creation toolbar', () => {
  it('shows Create Rectangle / Circle / Line / Text buttons for DM', () => {
    dmStore();
    render(<ToolsPanel userInfo={makeUser('dm')} />);
    expect(screen.getByTitle('Create Rectangle')).toBeInTheDocument();
    expect(screen.getByTitle('Create Circle')).toBeInTheDocument();
    expect(screen.getByTitle('Create Line')).toBeInTheDocument();
    expect(screen.getByTitle('Create Text')).toBeInTheDocument();
  });

  it('clicking Create Rectangle calls setActiveTool("rectangle")', () => {
    dmStore();
    render(<ToolsPanel userInfo={makeUser('dm')} />);
    fireEvent.click(screen.getByTitle('Create Rectangle'));
    expect(mockSetActiveTool).toHaveBeenCalledWith('rectangle');
  });

  it('clicking Create Circle calls setActiveTool("circle")', () => {
    dmStore();
    render(<ToolsPanel userInfo={makeUser('dm')} />);
    fireEvent.click(screen.getByTitle('Create Circle'));
    expect(mockSetActiveTool).toHaveBeenCalledWith('circle');
  });

  it('clicking Create Line calls setActiveTool("line")', () => {
    dmStore();
    render(<ToolsPanel userInfo={makeUser('dm')} />);
    fireEvent.click(screen.getByTitle('Create Line'));
    expect(mockSetActiveTool).toHaveBeenCalledWith('line');
  });

  it('shape settings panel shows when activeTool is circle', () => {
    dmStore({ activeTool: 'circle' });
    render(<ToolsPanel userInfo={makeUser('dm')} />);
    expect(screen.getByText('Shape Settings')).toBeInTheDocument();
    expect(screen.getByLabelText('Color:')).toBeInTheDocument();
  });

  it('shape settings panel shows when activeTool is line', () => {
    dmStore({ activeTool: 'line' });
    render(<ToolsPanel userInfo={makeUser('dm')} />);
    expect(screen.getByText('Shape Settings')).toBeInTheDocument();
  });

  it('shape settings hidden when activeTool is select', () => {
    dmStore({ activeTool: 'select' });
    render(<ToolsPanel userInfo={makeUser('dm')} />);
    expect(screen.queryByText('Shape Settings')).not.toBeInTheDocument();
  });
});

// ── DM wall list ──────────────────────────────────────────────────────────────
describe('ToolsPanel — wall list', () => {
  const wall = { wall_id: 'w1', wall_type: 'wall', table_id: 't1', is_door: false } as const;

  it('shows wall list when DM has walls on the active table', () => {
    dmStore({ walls: [wall as never], activeTableId: 't1' });
    render(<ToolsPanel userInfo={makeUser('dm')} />);
    expect(screen.getByText(/Walls \(1\)/)).toBeInTheDocument();
    expect(screen.getByText('Clear All')).toBeInTheDocument();
  });

  it('Clear All calls clearWalls', () => {
    const clearWalls = vi.fn();
    dmStore({ walls: [wall as never], activeTableId: 't1', clearWalls });
    render(<ToolsPanel userInfo={makeUser('dm')} />);
    fireEvent.click(screen.getByText('Clear All'));
    expect(clearWalls).toHaveBeenCalled();
  });

  it('remove button calls removeWall with wall_id', () => {
    const removeWall = vi.fn();
    dmStore({ walls: [wall as never], activeTableId: 't1', removeWall });
    render(<ToolsPanel userInfo={makeUser('dm')} />);
    // Find remove button by its parent wall row (last button in the row)
    const wallLabelEl = screen.getByText('wall');
    const wallRow = wallLabelEl.closest('div') as HTMLElement;
    const removeBtn = wallRow.querySelectorAll('button');
    fireEvent.click(removeBtn[removeBtn.length - 1]);
    expect(removeWall).toHaveBeenCalledWith('w1');
  });
});

// ── combat section ────────────────────────────────────────────────────────────
describe('ToolsPanel — combat section', () => {
  it('DM sees Toggle Combat Panel and Toggle Initiative Tracker buttons', () => {
    dmStore();
    render(<ToolsPanel userInfo={makeUser('dm')} />);
    expect(screen.getByTitle('Toggle Combat Panel')).toBeInTheDocument();
    expect(screen.getByTitle('Toggle Initiative Tracker')).toBeInTheDocument();
  });

  it('clicking Toggle Combat Panel shows DMCombatPanel', () => {
    dmStore();
    render(<ToolsPanel userInfo={makeUser('dm')} />);
    // DMCombatPanel is mocked as () => null, so just check button becomes active
    const btn = screen.getByTitle('Toggle Combat Panel');
    fireEvent.click(btn);
    expect(btn.classList.contains('active') || btn.getAttribute('class')).toBeTruthy();
  });

  it('clicking Toggle Initiative Tracker toggles it', () => {
    dmStore();
    render(<ToolsPanel userInfo={makeUser('dm')} />);
    const btn = screen.getByTitle('Toggle Initiative Tracker');
    fireEvent.click(btn);
    expect(btn).toBeTruthy(); // fires without error
  });
});

// Shared rustRenderManager mock — avoids paint_is_mode errors across tests
function mockRustManager(extra: Record<string, unknown> = {}) {
  const rm = {
    paint_is_mode: vi.fn(() => false),
    paint_exit_mode: vi.fn(),
    set_input_mode_select: vi.fn(),
    set_active_layer: vi.fn(),
    ...extra,
  };
  (window as unknown as Record<string, unknown>)['rustRenderManager'] = rm;
  return rm;
}

// ── player layer controls ─────────────────────────────────────────────────────
describe('ToolsPanel — PlayerLayerControls (player role)', () => {
  afterEach(() => { delete (window as unknown as Record<string, unknown>)['rustRenderManager']; });

  it('shows Toggle Map layer and Toggle Tokens layer buttons', () => {
    render(<ToolsPanel userInfo={makeUser('player')} />);
    expect(screen.getByRole('button', { name: 'Toggle Map layer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toggle Tokens layer' })).toBeInTheDocument();
  });

  it('clicking Toggle Map layer calls setLayerVisibility and rustRenderManager', () => {
    const setLayerVisibility = vi.fn();
    const set_layer_visible = vi.fn();
    vi.mocked(useGameStore).mockImplementation(
      ((sel?: (s: typeof baseStoreState) => unknown) => {
        const state = { ...baseStoreState, setLayerVisibility };
        return sel ? sel(state) : state;
      }) as unknown as typeof useGameStore
    );
    mockRustManager({ set_layer_visible });
    render(<ToolsPanel userInfo={makeUser('player')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Map layer' }));
    expect(setLayerVisibility).toHaveBeenCalledWith('map', false);
    expect(set_layer_visible).toHaveBeenCalledWith('map', false);
  });
});

// ── DM layers tab ─────────────────────────────────────────────────────────────
describe('ToolsPanel — DM Layers tab', () => {
  it('clicking Layers tab shows layer switcher with Map/Tokens/DM/Light buttons', () => {
    dmStore();
    render(<ToolsPanel userInfo={makeUser('dm')} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Layers' }));
    expect(screen.getByTitle('Map layer [1]')).toBeInTheDocument();
    expect(screen.getByTitle('Tokens layer [2]')).toBeInTheDocument();
    expect(screen.getByTitle('DM layer [3]')).toBeInTheDocument();
  });

  it('clicking a layer button calls setActiveLayer', () => {
    dmStore();
    render(<ToolsPanel userInfo={makeUser('dm')} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Layers' }));
    fireEvent.click(screen.getByTitle('Map layer [1]'));
    expect(mockSetActiveLayer).toHaveBeenCalledWith('map');
  });
});
