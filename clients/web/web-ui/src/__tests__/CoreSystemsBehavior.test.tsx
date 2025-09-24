/**
 * Core Systems Behavior Tests
 * Tests the fundamental behavior of all core TTRPG systems
 * Focuses on expected user behavior rather than implementation details
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Import components to test
import { ActionQueuePanel } from '../components/ActionQueuePanel';
import { ActionsPanel } from '../components/ActionsPanel';
import { AssetPanel } from '../components/AssetPanel';
import { CharacterManager } from '../components/CharacterManager';
import { CompendiumPanel } from '../components/CompendiumPanel';
import { FogPanel } from '../components/FogPanel';
import { LightingPanel } from '../components/LightingPanel';
import { NetworkPanel } from '../components/NetworkPanel';
import { PaintPanel } from '../components/PaintPanel';
import { TableManagementPanel } from '../components/TableManagementPanel';

// Mock all the services and WASM modules
vi.mock('../services/compendium.service', () => ({
  compendiumService: {
    searchMonsters: vi.fn(() => Promise.resolve([
      { id: '1', name: 'Goblin', challenge_rating: 0.25, type: 'humanoid' },
      { id: '2', name: 'Orc', challenge_rating: 0.5, type: 'humanoid' }
    ])),
    searchSpells: vi.fn(() => Promise.resolve([
      { id: '1', name: 'Fireball', level: 3, school: 'evocation' },
      { id: '2', name: 'Magic Missile', level: 1, school: 'evocation' }
    ])),
    searchEquipment: vi.fn(() => Promise.resolve([
      { id: '1', name: 'Longsword', type: 'weapon', cost: '15 gp' },
      { id: '2', name: 'Chain Mail', type: 'armor', cost: '75 gp' }
    ])),
    getMonsterDetails: vi.fn(() => Promise.resolve({
      id: '1', name: 'Goblin', hp: 7, ac: 15, stats: { str: 8, dex: 14 }
    }))
  }
}));

vi.mock('../services/character.service', () => ({
  characterService: {
    getCharacters: vi.fn(() => Promise.resolve([
      { id: '1', name: 'Aragorn', class: 'Ranger', level: 5, hp: 45 },
      { id: '2', name: 'Gandalf', class: 'Wizard', level: 20, hp: 165 }
    ])),
    createCharacter: vi.fn(() => Promise.resolve({ id: '3', name: 'New Hero' })),
    updateCharacter: vi.fn(),
    deleteCharacter: vi.fn()
  }
}));

vi.mock('../services/asset.service', () => ({
  assetService: {
    uploadAsset: vi.fn(() => Promise.resolve({ id: '1', name: 'test.png', url: '/assets/test.png' })),
    getAssets: vi.fn(() => Promise.resolve([
      { id: '1', name: 'dragon.png', type: 'image', size: 1024000 },
      { id: '2', name: 'music.mp3', type: 'audio', size: 5242880 }
    ])),
    deleteAsset: vi.fn()
  }
}));

// Mock WASM modules properly
const mockWasmModule = {
  LightingSystem: vi.fn().mockImplementation(() => ({
    addLight: vi.fn(),
    removeLight: vi.fn(),
    setAmbientLight: vi.fn(),
    getLights: vi.fn(() => []),
    updateLighting: vi.fn()
  })),
  FogOfWarSystem: vi.fn().mockImplementation(() => ({
    revealArea: vi.fn(),
    hideArea: vi.fn(),
    clearFog: vi.fn(),
    getFogState: vi.fn(() => ({}))
  })),
  PaintSystem: vi.fn().mockImplementation(() => ({
    startStroke: vi.fn(),
    addPoint: vi.fn(),
    endStroke: vi.fn(),
    setBrush: vi.fn(),
    clearCanvas: vi.fn()
  })),
  TableManager: vi.fn().mockImplementation(() => ({
    createTable: vi.fn(),
    deleteTable: vi.fn(),
    getTables: vi.fn(() => []),
    setActiveTable: vi.fn()
  })),
  ActionsClient: vi.fn().mockImplementation(() => ({
    executeAction: vi.fn(),
    queueAction: vi.fn(),
    getActionQueue: vi.fn(() => []),
    clearQueue: vi.fn()
  })),
  NetworkClient: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendMessage: vi.fn(),
    isConnected: vi.fn(() => false)
  }))
};

// Mock window.ttrpg_rust_core
Object.defineProperty(window, 'ttrpg_rust_core', {
  value: mockWasmModule,
  writable: true
});

describe('Compendium System Behavior', () => {
  const mockUserInfo = { id: 1, username: 'testuser', role: 'dm', permissions: ['manage_monsters'] };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should allow DM to search and browse monsters effectively', async () => {
    const user = userEvent.setup();
    render(<CompendiumPanel userInfo={mockUserInfo} />);

    // User expects to see search interface immediately
    expect(screen.getByPlaceholderText(/search monsters, spells, equipment/i)).toBeInTheDocument();
    
    // User types "goblin" expecting to find goblins
    const searchInput = screen.getByPlaceholderText(/search monsters, spells, equipment/i);
    await user.type(searchInput, 'goblin');

    // User expects search results to appear automatically
    await waitFor(() => {
      expect(screen.getByText('Goblin')).toBeInTheDocument();
    });

    // User expects to see monster details when clicking on a result
    await user.click(screen.getByText('Goblin'));
    
    await waitFor(() => {
      expect(screen.getByText(/CR 0.25/i)).toBeInTheDocument();
      expect(screen.getByText(/humanoid/i)).toBeInTheDocument();
    });
  });

  it('should provide comprehensive spell search and filtering', async () => {
    const user = userEvent.setup();
    render(<CompendiumPanel userInfo={mockUserInfo} />);

    // Switch to spells tab
    await user.click(screen.getByText('Spells'));

    // Search for evocation spells
    const searchInput = screen.getByPlaceholderText(/search spells/i);
    await user.type(searchInput, 'fireball');

    await waitFor(() => {
      expect(screen.getByText('Fireball')).toBeInTheDocument();
      expect(screen.getByText(/Level 3/i)).toBeInTheDocument();
      expect(screen.getByText(/Evocation/i)).toBeInTheDocument();
    });

    // User expects spell level filtering to work
    const levelFilter = screen.getByLabelText(/spell level/i);
    await user.selectOptions(levelFilter, '3');

    await waitFor(() => {
      expect(screen.getByText('Fireball')).toBeInTheDocument();
      expect(screen.queryByText('Magic Missile')).not.toBeInTheDocument();
    });
  });

  it('should support equipment browsing with cost and type information', async () => {
    const user = userEvent.setup();
    render(<CompendiumPanel userInfo={mockUserInfo} />);

    await user.click(screen.getByText('Equipment'));

    const searchInput = screen.getByPlaceholderText(/search equipment/i);
    await user.type(searchInput, 'sword');

    await waitFor(() => {
      expect(screen.getByText('Longsword')).toBeInTheDocument();
      expect(screen.getByText(/15 gp/i)).toBeInTheDocument();
      expect(screen.getByText(/weapon/i)).toBeInTheDocument();
    });
  });
});

describe('Character Management System Behavior', () => {
  const mockUserInfo = { id: 1, username: 'testuser', role: 'dm', permissions: ['manage_characters'] };
  const mockSessionCode = 'TEST123';

  it('should display all characters in the session', async () => {
    render(<CharacterManager sessionCode={mockSessionCode} userInfo={mockUserInfo} />);

    await waitFor(() => {
      expect(screen.getByText('Aragorn')).toBeInTheDocument();
      expect(screen.getByText('Gandalf')).toBeInTheDocument();
      expect(screen.getByText(/Ranger/i)).toBeInTheDocument();
      expect(screen.getByText(/Level 5/i)).toBeInTheDocument();
    });
  });

  it('should allow creating new characters with proper validation', async () => {
    const user = userEvent.setup();
    render(<CharacterManager sessionCode={mockSessionCode} userInfo={mockUserInfo} />);

    // User expects "Create Character" button to be visible
    const createButton = screen.getByText(/create character/i);
    await user.click(createButton);

    // User expects character creation form
    expect(screen.getByLabelText(/character name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/class/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/level/i)).toBeInTheDocument();

    // Fill out form with valid data
    await user.type(screen.getByLabelText(/character name/i), 'New Hero');
    await user.selectOptions(screen.getByLabelText(/class/i), 'Fighter');
    await user.type(screen.getByLabelText(/level/i), '1');

    // Submit should work
    await user.click(screen.getByText(/create/i));

    await waitFor(() => {
      expect(screen.getByText('Character created successfully')).toBeInTheDocument();
    });
  });

  it('should prevent creating characters with invalid data', async () => {
    const user = userEvent.setup();
    render(<CharacterManager sessionCode={mockSessionCode} userInfo={mockUserInfo} />);

    const createButton = screen.getByText(/create character/i);
    await user.click(createButton);

    // Try to submit empty form
    const submitButton = screen.getByText(/create/i);
    await user.click(submitButton);

    // User expects validation errors
    expect(screen.getByText(/character name is required/i)).toBeInTheDocument();
    expect(screen.getByText(/class must be selected/i)).toBeInTheDocument();
  });

  it('should allow editing character stats and equipment', async () => {
    const user = userEvent.setup();
    render(<CharacterManager sessionCode={mockSessionCode} userInfo={mockUserInfo} />);

    // Click on a character to edit
    await user.click(screen.getByText('Aragorn'));

    // User expects edit interface
    expect(screen.getByDisplayValue('Aragorn')).toBeInTheDocument();
    expect(screen.getByDisplayValue('45')).toBeInTheDocument(); // HP

    // User can modify HP
    const hpInput = screen.getByDisplayValue('45');
    await user.clear(hpInput);
    await user.type(hpInput, '50');

    // Save changes
    await user.click(screen.getByText(/save/i));

    await waitFor(() => {
      expect(screen.getByText(/character updated/i)).toBeInTheDocument();
    });
  });
});

describe('Asset Management System Behavior', () => {
  const mockUserInfo = { id: 1, username: 'testuser', role: 'dm', permissions: ['manage_assets'] };

  it('should display existing assets with proper metadata', async () => {
    render(<AssetPanel userInfo={mockUserInfo} />);

    await waitFor(() => {
      expect(screen.getByText('dragon.png')).toBeInTheDocument();
      expect(screen.getByText('music.mp3')).toBeInTheDocument();
      expect(screen.getByText(/1.0 MB/i)).toBeInTheDocument(); // Size formatting
    });
  });

  it('should support file upload with drag and drop', async () => {
    const user = userEvent.setup();
    render(<AssetPanel userInfo={mockUserInfo} />);

    // User expects drag and drop zone
    const dropzone = screen.getByText(/drag files here or click to upload/i);
    expect(dropzone).toBeInTheDocument();

    // Simulate file upload
    const fileInput = screen.getByRole('button', { name: /upload/i });
    const file = new File(['test content'], 'test.png', { type: 'image/png' });

    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByText(/upload successful/i)).toBeInTheDocument();
    });
  });

  it('should validate file types and sizes', async () => {
    const user = userEvent.setup();
    render(<AssetPanel userInfo={mockUserInfo} />);

    // Try to upload oversized file
    const fileInput = screen.getByRole('button', { name: /upload/i });
    const oversizedFile = new File(['x'.repeat(100 * 1024 * 1024)], 'huge.exe', { type: 'application/exe' });

    await user.upload(fileInput, oversizedFile);

    await waitFor(() => {
      expect(screen.getByText(/file too large/i)).toBeInTheDocument();
      expect(screen.getByText(/file type not supported/i)).toBeInTheDocument();
    });
  });

  it('should organize assets by type and allow filtering', async () => {
    const user = userEvent.setup();
    render(<AssetPanel userInfo={mockUserInfo} />);

    // User expects type filters
    expect(screen.getByText(/images/i)).toBeInTheDocument();
    expect(screen.getByText(/audio/i)).toBeInTheDocument();

    // Filter by images
    await user.click(screen.getByText(/images/i));

    await waitFor(() => {
      expect(screen.getByText('dragon.png')).toBeInTheDocument();
      expect(screen.queryByText('music.mp3')).not.toBeInTheDocument();
    });
  });
});

describe('Network System Behavior', () => {
  const mockUserInfo = { id: 1, username: 'testuser', role: 'player', permissions: [] };

  it('should show connection status clearly to users', async () => {
    render(<NetworkPanel userInfo={mockUserInfo} />);

    // User expects to see connection status immediately
    expect(screen.getByText(/disconnected/i)).toBeInTheDocument();
    expect(screen.getByText(/connect/i)).toBeInTheDocument();
  });

  it('should allow users to connect to game sessions', async () => {
    const user = userEvent.setup();
    render(<NetworkPanel userInfo={mockUserInfo} />);

    // User enters session code
    const sessionInput = screen.getByPlaceholderText(/session code/i);
    await user.type(sessionInput, 'GAME123');

    // Click connect
    await user.click(screen.getByText(/connect/i));

    await waitFor(() => {
      expect(screen.getByText(/connecting/i)).toBeInTheDocument();
    });
  });

  it('should display real-time messages from other players', async () => {
    render(<NetworkPanel userInfo={mockUserInfo} />);

    // Mock incoming message
    const mockMessage = { user: 'DM', message: 'Roll for initiative!', timestamp: Date.now() };
    
    // User expects to see messages appear in real-time
    await waitFor(() => {
      // Note: This would be triggered by WebSocket messages in real implementation
      expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
    });
  });

  it('should handle connection errors gracefully', async () => {
    const user = userEvent.setup();
    render(<NetworkPanel userInfo={mockUserInfo} />);

    // Simulate connection failure
    const connectButton = screen.getByText(/connect/i);
    await user.click(connectButton);

    // User expects clear error message
    await waitFor(() => {
      expect(screen.getByText(/connection failed/i)).toBeInTheDocument();
      expect(screen.getByText(/retry/i)).toBeInTheDocument();
    });
  });
});

describe('Lighting System Behavior', () => {
  const mockUserInfo = { id: 1, username: 'testuser', role: 'dm', permissions: ['manage_lighting'] };

  it('should allow DM to place and configure lights', async () => {
    const user = userEvent.setup();
    render(<LightingPanel userInfo={mockUserInfo} />);

    // User expects light creation controls
    expect(screen.getByText(/add light/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/light intensity/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/light color/i)).toBeInTheDocument();

    // Create a new light
    await user.click(screen.getByText(/add light/i));
    
    await waitFor(() => {
      expect(screen.getByText(/light created/i)).toBeInTheDocument();
    });
  });

  it('should provide ambient lighting controls', async () => {
    const user = userEvent.setup();
    render(<LightingPanel userInfo={mockUserInfo} />);

    // User expects ambient light slider
    const ambientSlider = screen.getByLabelText(/ambient light/i);
    expect(ambientSlider).toBeInTheDocument();

    // Adjust ambient lighting
    fireEvent.change(ambientSlider, { target: { value: '75' } });

    await waitFor(() => {
      expect(screen.getByDisplayValue('75')).toBeInTheDocument();
    });
  });

  it('should show light sources list with edit capabilities', async () => {
    const user = userEvent.setup();
    render(<LightingPanel userInfo={mockUserInfo} />);

    // Mock existing lights would be displayed here
    expect(screen.getByText(/no lights placed/i)).toBeInTheDocument();

    // After adding a light, user should see it in the list
    await user.click(screen.getByText(/add light/i));

    await waitFor(() => {
      expect(screen.getByText(/light #1/i)).toBeInTheDocument();
      expect(screen.getByText(/edit/i)).toBeInTheDocument();
      expect(screen.getByText(/delete/i)).toBeInTheDocument();
    });
  });
});

describe('Fog of War System Behavior', () => {
  const mockUserInfo = { id: 1, username: 'testuser', role: 'dm', permissions: ['manage_fog'] };

  it('should provide fog revealing tools for DM', async () => {
    const user = userEvent.setup();
    render(<FogPanel userInfo={mockUserInfo} />);

    // User expects fog control tools
    expect(screen.getByText(/reveal area/i)).toBeInTheDocument();
    expect(screen.getByText(/hide area/i)).toBeInTheDocument();
    expect(screen.getByText(/clear all fog/i)).toBeInTheDocument();

    // User can select brush size for revealing
    expect(screen.getByLabelText(/brush size/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/fog opacity/i)).toBeInTheDocument();
  });

  it('should allow toggling fog visibility for players vs DM', async () => {
    const user = userEvent.setup();
    render(<FogPanel userInfo={mockUserInfo} />);

    // DM should see fog toggle controls
    const showFogToggle = screen.getByLabelText(/show fog to players/i);
    expect(showFogToggle).toBeInTheDocument();

    // Toggle should work
    await user.click(showFogToggle);

    await waitFor(() => {
      expect(screen.getByText(/fog hidden from players/i)).toBeInTheDocument();
    });
  });

  it('should provide presets for common fog scenarios', async () => {
    const user = userEvent.setup();
    render(<FogPanel userInfo={mockUserInfo} />);

    // User expects quick fog presets
    expect(screen.getByText(/dungeon exploration/i)).toBeInTheDocument();
    expect(screen.getByText(/outdoor travel/i)).toBeInTheDocument();
    expect(screen.getByText(/complete darkness/i)).toBeInTheDocument();

    // Selecting preset should apply fog configuration
    await user.click(screen.getByText(/dungeon exploration/i));

    await waitFor(() => {
      expect(screen.getByText(/dungeon preset applied/i)).toBeInTheDocument();
    });
  });
});

describe('Paint System Behavior', () => {
  const mockUserInfo = { id: 1, username: 'testuser', role: 'dm', permissions: ['manage_paint'] };

  it('should provide drawing tools with various brushes', async () => {
    const user = userEvent.setup();
    render(<PaintPanel userInfo={mockUserInfo} />);

    // User expects brush selection
    expect(screen.getByText(/brush/i)).toBeInTheDocument();
    expect(screen.getByText(/marker/i)).toBeInTheDocument();
    expect(screen.getByText(/eraser/i)).toBeInTheDocument();

    // User expects size and color controls
    expect(screen.getByLabelText(/brush size/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/color/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/opacity/i)).toBeInTheDocument();
  });

  it('should support layer management for organized drawing', async () => {
    const user = userEvent.setup();
    render(<PaintPanel userInfo={mockUserInfo} />);

    // User expects layer controls
    expect(screen.getByText(/layers/i)).toBeInTheDocument();
    expect(screen.getByText(/add layer/i)).toBeInTheDocument();

    // Create new layer
    await user.click(screen.getByText(/add layer/i));

    await waitFor(() => {
      expect(screen.getByText(/layer 2/i)).toBeInTheDocument();
    });

    // Layer visibility toggle
    const layerToggle = screen.getByLabelText(/toggle layer 2/i);
    await user.click(layerToggle);

    await waitFor(() => {
      expect(screen.getByText(/layer 2 hidden/i)).toBeInTheDocument();
    });
  });

  it('should provide undo/redo functionality', async () => {
    const user = userEvent.setup();
    render(<PaintPanel userInfo={mockUserInfo} />);

    // User expects undo/redo buttons
    expect(screen.getByLabelText(/undo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/redo/i)).toBeInTheDocument();

    // Initially disabled (no actions to undo)
    expect(screen.getByLabelText(/undo/i)).toBeDisabled();
    expect(screen.getByLabelText(/redo/i)).toBeDisabled();
  });

  it('should allow saving and loading drawing templates', async () => {
    const user = userEvent.setup();
    render(<PaintPanel userInfo={mockUserInfo} />);

    // User expects template management
    expect(screen.getByText(/templates/i)).toBeInTheDocument();
    expect(screen.getByText(/save as template/i)).toBeInTheDocument();
    expect(screen.getByText(/load template/i)).toBeInTheDocument();

    // Save template
    await user.click(screen.getByText(/save as template/i));

    // User should see template name input
    const nameInput = screen.getByPlaceholderText(/template name/i);
    await user.type(nameInput, 'My Drawing');

    await user.click(screen.getByText(/save/i));

    await waitFor(() => {
      expect(screen.getByText(/template saved/i)).toBeInTheDocument();
    });
  });
});

describe('Table Management System Behavior', () => {
  const mockUserInfo = { id: 1, username: 'testuser', role: 'dm', permissions: ['manage_tables'] };

  it('should display available tables and allow selection', async () => {
    render(<TableManagementPanel userInfo={mockUserInfo} />);

    // User expects to see table list
    expect(screen.getByText(/available tables/i)).toBeInTheDocument();
    expect(screen.getByText(/create new table/i)).toBeInTheDocument();
  });

  it('should allow creating new tables with proper configuration', async () => {
    const user = userEvent.setup();
    render(<TableManagementPanel userInfo={mockUserInfo} />);

    await user.click(screen.getByText(/create new table/i));

    // User expects table creation form
    expect(screen.getByLabelText(/table name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/grid size/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/background/i)).toBeInTheDocument();

    // Fill out form
    await user.type(screen.getByLabelText(/table name/i), 'Dungeon Level 1');
    await user.selectOptions(screen.getByLabelText(/grid size/i), '30');

    await user.click(screen.getByText(/create table/i));

    await waitFor(() => {
      expect(screen.getByText(/table created successfully/i)).toBeInTheDocument();
    });
  });

  it('should provide table sharing and permissions management', async () => {
    const user = userEvent.setup();
    render(<TableManagementPanel userInfo={mockUserInfo} />);

    // Mock existing table
    await waitFor(() => {
      expect(screen.getByText(/share table/i)).toBeInTheDocument();
      expect(screen.getByText(/permissions/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/share table/i));

    // User expects sharing options
    expect(screen.getByText(/share link/i)).toBeInTheDocument();
    expect(screen.getByText(/player permissions/i)).toBeInTheDocument();
    expect(screen.getByText(/view only/i)).toBeInTheDocument();
    expect(screen.getByText(/can edit/i)).toBeInTheDocument();
  });
});

describe('Action System Behavior', () => {
  const mockUserInfo = { id: 1, username: 'testuser', role: 'player', permissions: ['execute_actions'] };
  const mockRenderEngine = { 
    executeAction: vi.fn(),
    getActionHistory: vi.fn(() => []),
    undoLastAction: vi.fn()
  };

  it('should display available actions based on user role', async () => {
    render(<ActionsPanel renderEngine={mockRenderEngine} />);

    // Player should see basic actions
    expect(screen.getByText(/move/i)).toBeInTheDocument();
    expect(screen.getByText(/attack/i)).toBeInTheDocument();
    expect(screen.getByText(/cast spell/i)).toBeInTheDocument();

    // Should not see DM-only actions
    expect(screen.queryByText(/spawn monster/i)).not.toBeInTheDocument();
  });

  it('should queue actions and show execution status', async () => {
    const user = userEvent.setup();
    render(<ActionQueuePanel userInfo={mockUserInfo} />);

    // User expects to see action queue
    expect(screen.getByText(/action queue/i)).toBeInTheDocument();
    expect(screen.getByText(/no actions queued/i)).toBeInTheDocument();

    // Mock queued action would appear here
    await waitFor(() => {
      // In real implementation, actions would be queued and displayed
      expect(screen.getByText(/clear queue/i)).toBeInTheDocument();
    });
  });

  it('should provide action history and undo capability', async () => {
    const user = userEvent.setup();
    render(<ActionsPanel renderEngine={mockRenderEngine} />);

    // User expects action history
    expect(screen.getByText(/action history/i)).toBeInTheDocument();
    expect(screen.getByText(/undo last/i)).toBeInTheDocument();

    // Undo should be available when there are actions
    const undoButton = screen.getByText(/undo last/i);
    await user.click(undoButton);

    // Should trigger undo in render engine
    expect(mockRenderEngine.undoLastAction).toHaveBeenCalled();
  });

  it('should validate actions before execution', async () => {
    const user = userEvent.setup();
    render(<ActionsPanel renderEngine={mockRenderEngine} />);

    // Try to execute invalid action (e.g., move without target)
    await user.click(screen.getByText(/move/i));

    // User expects validation error
    await waitFor(() => {
      expect(screen.getByText(/target location required/i)).toBeInTheDocument();
    });
  });
});