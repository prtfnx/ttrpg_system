import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolsPanel } from '../ToolsPanel';
import type { UserInfo } from '@features/auth';

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
  tables: [],
  activeTableId: null,
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
  return { id: 1, username: 'tester', email: 'x@x.com', role } as UserInfo;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useGameStore).mockImplementation(
    (sel?: (s: typeof baseStoreState) => unknown) =>
      sel ? sel(baseStoreState) : baseStoreState
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
      (sel?: (s: typeof baseStoreState) => unknown) =>
        sel ? sel({ ...baseStoreState, sessionRole: 'dm' }) : { ...baseStoreState, sessionRole: 'dm' }
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
      (sel?: (s: typeof baseStoreState) => unknown) =>
        sel ? sel({ ...baseStoreState, sessionRole: 'dm' }) : { ...baseStoreState, sessionRole: 'dm' }
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
      (sel?: (s: typeof baseStoreState) => unknown) =>
        sel ? sel({ ...baseStoreState, sessionRole: 'dm', tables, activeTableId: 't1' }) : { ...baseStoreState, sessionRole: 'dm', tables, activeTableId: 't1' }
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
      (sel?: (s: typeof baseStoreState) => unknown) =>
        sel ? sel({ ...baseStoreState, sessionRole: 'dm' }) : { ...baseStoreState, sessionRole: 'dm' }
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
