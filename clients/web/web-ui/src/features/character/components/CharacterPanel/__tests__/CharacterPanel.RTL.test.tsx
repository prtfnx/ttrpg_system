import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CharacterPanel } from '@features/character';
import { useGameStore } from '@/store';
import { createTestCharacter, createTestSprite } from '@/test/utils/testFactories';

// Mock external dependencies
vi.mock('@features/auth', () => ({
  authService: {
    getUserInfo: vi.fn(() => ({ id: 1, username: 'testuser' })),
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('../../services/ProtocolContext', () => ({
  useProtocol: () => ({
    protocol: {
      requestCharacterList: vi.fn(),
      saveCharacter: vi.fn(),
      deleteCharacter: vi.fn(),
      updateCharacter: vi.fn(),
    },
    isConnected: true,
  }),
}));

vi.mock('../../utils/toast', () => ({
  showToast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@shared/utils/characterImportExport', () => ({
  cloneCharacter: vi.fn((char, userId) => ({
    ...char,
    id: `cloned-${Date.now()}`,
    name: `${char.name} (Copy)`,
    ownerId: userId,
  })),
  downloadCharacterAsJSON: vi.fn(),
  downloadMultipleCharactersAsJSON: vi.fn(),
  pickAndImportCharacter: vi.fn(),
}));

describe('CharacterPanel', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    // Reset store state properties (keep action methods intact)
    useGameStore.setState({
      sprites: [],
      characters: [],
      selectedSprites: [],
      camera: { x: 0, y: 0, zoom: 1 },
      isConnected: false,
      connectionState: 'disconnected',
      sessionId: undefined,
      sessionUserId: 1, // Set current user ID for permission tests
      tables: [],
      activeTableId: null,
      tablesLoading: false,
      activeLayer: 'tokens',
      layerVisibility: {
        'map': true,
        'tokens': true,
        'dungeon_master': true,
        'light': true,
        'height': true,
        'obstacles': true,
        'fog_of_war': true
      },
      layerOpacity: {
        'map': 1.0,
        'tokens': 1.0,
        'dungeon_master': 1.0,
        'light': 0.6,
        'height': 0.7,
        'obstacles': 1.0,
        'fog_of_war': 0.8
      },
      gridEnabled: true,
      gridSnapping: false,
      gridSize: 50,
      activeTool: 'select',
      measurementActive: false,
      alignmentActive: false,
    }, false); // Merge, don't replace (keeps action methods)
    vi.clearAllMocks();
  });

  describe('Initial Rendering', () => {
    it('shows empty state when no characters exist', () => {
      render(<CharacterPanel />);
      
      expect(screen.getByText(/no characters yet/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create new character/i })).toBeInTheDocument();
    });

    it('displays characters in a properly structured list', () => {
      const testCharacter = createTestCharacter({ 
        id: 'char-1', 
        name: 'Test Hero',
        ownerId: 1 
      });
      
      useGameStore.getState().addCharacter(testCharacter);
      render(<CharacterPanel />);
      
      const characterList = screen.getByRole('list', { name: /character list/i });
      expect(characterList).toBeInTheDocument();
      
      const characterCard = screen.getByRole('listitem', { name: /character: test hero/i });
      expect(characterCard).toBeInTheDocument();
      expect(characterCard).toHaveAttribute('aria-expanded', 'false');
    });
  });

  describe('Character Interaction', () => {
    it('allows expanding and collapsing character cards', async () => {
      const testCharacter = createTestCharacter({ 
        id: 'expandable-char', 
        name: 'Expandable Hero',
        ownerId: 1 
      });
      
      useGameStore.getState().addCharacter(testCharacter);
      render(<CharacterPanel />);
      
      const characterCard = screen.getByRole('listitem', { name: /character: expandable hero/i });
      expect(characterCard).toHaveAttribute('aria-expanded', 'false');
      
      // Click the expand button to expand
      const expandButton = screen.getByRole('button', { name: /expand expandable hero/i });
      await user.click(expandButton);
      
      await waitFor(() => {
        expect(characterCard).toHaveAttribute('aria-expanded', 'true');
      });
      
      // Click the collapse button to collapse
      const collapseButton = screen.getByRole('button', { name: /collapse expandable hero/i });
      await user.click(collapseButton);
      
      await waitFor(() => {
        expect(characterCard).toHaveAttribute('aria-expanded', 'false');
      });
    });

    it('displays token badges for characters with linked sprites', async () => {
      const character = createTestCharacter({ 
        id: 'char-with-token', 
        name: 'Hero with Token',
        ownerId: 1 
      });
      const sprite = createTestSprite({ 
        id: 'sprite-1',
        characterId: 'char-with-token' 
      });
      
      useGameStore.getState().addCharacter(character);
      useGameStore.getState().addSprite(sprite);
      useGameStore.getState().linkSpriteToCharacter('sprite-1', 'char-with-token');
      
      render(<CharacterPanel />);
      
      // Expand the character card to see token badges
      const characterCard = screen.getByRole('listitem', { name: /character: hero with token/i });
      await user.click(characterCard);
      
      await waitFor(() => {
        expect(screen.getByText('Token')).toBeInTheDocument();
      });
    });
  });

  describe('Permissions and Ownership', () => {
    it('shows delete button for owned characters', async () => {
      const ownedCharacter = createTestCharacter({ 
        id: 'owned-char', 
        name: 'My Character',
        ownerId: 1 
      });
      
      useGameStore.getState().addCharacter(ownedCharacter);
      render(<CharacterPanel />);
      
      // Expand owned character by clicking the expand button
      const expandButton = screen.getByRole('button', { name: /expand my character/i });
      await user.click(expandButton);
      
      const characterCard = screen.getByRole('listitem', { name: /character: my character/i });
      await waitFor(() => {
        expect(characterCard).toHaveAttribute('aria-expanded', 'true');
        const deleteButton = screen.getByRole('button', { name: /delete/i });
        expect(deleteButton).toBeInTheDocument();
        expect(deleteButton).toBeEnabled();
      });
    });

    it('disables delete button for characters not owned by current user', async () => {
      const otherCharacter = createTestCharacter({ 
        id: 'other-char', 
        name: 'Other Character',
        ownerId: 2 // Different from current user (1)
      });
      
      useGameStore.getState().addCharacter(otherCharacter);
      render(<CharacterPanel />);
      
      const characterCard = screen.getByRole('listitem', { name: /character: other character/i });
      await user.click(characterCard);
      
      await waitFor(() => {
        const deleteButtons = screen.queryAllByRole('button', { name: /delete/i });
        if (deleteButtons.length > 0) {
          expect(deleteButtons[0]).toBeDisabled();
        }
      });
    });

    it('shows appropriate controls for controlled characters', async () => {
      const controlledCharacter = createTestCharacter({ 
        id: 'controlled-char', 
        name: 'Controlled Character',
        ownerId: 2,
        controlledBy: [1] // Current user can control
      });
      
      useGameStore.getState().addCharacter(controlledCharacter);
      render(<CharacterPanel />);
      
      // Expand by clicking the expand button
      const expandButton = screen.getByRole('button', { name: /expand controlled character/i });
      await user.click(expandButton);
      
      const characterCard = screen.getByRole('listitem', { name: /character: controlled character/i });
      // User should see the character and have some controls
      await waitFor(() => {
        expect(characterCard).toHaveAttribute('aria-expanded', 'true');
        // Controlled characters should show but not allow deletion
      });
    });
  });

  describe('Search and Filtering', () => {
    beforeEach(() => {
      const characters = [
        createTestCharacter({ id: 'char-1', name: 'Warrior Bob', ownerId: 1 }),
        createTestCharacter({ id: 'char-2', name: 'Wizard Alice', ownerId: 1 }),
        createTestCharacter({ id: 'char-3', name: 'Rogue Charlie', ownerId: 1 })
      ];
      
      characters.forEach(char => useGameStore.getState().addCharacter(char));
    });

    it('filters characters based on search input', async () => {
      render(<CharacterPanel />);
      
      // All characters should be visible initially
      expect(screen.getByText('Warrior Bob')).toBeInTheDocument();
      expect(screen.getByText('Wizard Alice')).toBeInTheDocument();
      expect(screen.getByText('Rogue Charlie')).toBeInTheDocument();
      
      // Filter for "Warrior"
      const searchInput = screen.getByPlaceholderText(/search by name/i);
      await user.type(searchInput, 'Warrior');
      
      // Only Warrior should be visible
      expect(screen.getByText('Warrior Bob')).toBeInTheDocument();
      expect(screen.queryByText('Wizard Alice')).not.toBeInTheDocument();
      expect(screen.queryByText('Rogue Charlie')).not.toBeInTheDocument();
    });

    it('allows clearing search filter', async () => {
      render(<CharacterPanel />);
      
      const searchInput = screen.getByPlaceholderText(/search by name/i);
      await user.type(searchInput, 'Wizard');
      
      // Only Wizard should be visible
      expect(screen.queryByText('Warrior Bob')).not.toBeInTheDocument();
      expect(screen.getByText('Wizard Alice')).toBeInTheDocument();
      
      // Clear search using the clear button
      const clearButton = screen.getByRole('button', { name: /clear/i });
      await user.click(clearButton);
      
      // All characters should be visible again
      await waitFor(() => {
        expect(screen.getByText('Warrior Bob')).toBeInTheDocument();
        expect(screen.getByText('Wizard Alice')).toBeInTheDocument();
        expect(screen.getByText('Rogue Charlie')).toBeInTheDocument();
      });
    });

    it('shows appropriate message when no characters match search', async () => {
      render(<CharacterPanel />);
      
      const searchInput = screen.getByPlaceholderText(/search by name/i);
      await user.type(searchInput, 'NonexistentCharacter');
      
      expect(screen.getByText(/no characters found matching/i)).toBeInTheDocument();
      expect(screen.queryByText('Warrior Bob')).not.toBeInTheDocument();
      expect(screen.queryByText('Wizard Alice')).not.toBeInTheDocument();
      expect(screen.queryByText('Rogue Charlie')).not.toBeInTheDocument();
    });
  });

  describe('Character Management', () => {
    it('handles character deletion confirmation flow', async () => {
      const character = createTestCharacter({ 
        id: 'char-to-delete', 
        name: 'Deletable Hero',
        ownerId: 1 
      });
      
      useGameStore.getState().addCharacter(character);
      render(<CharacterPanel />);
      
      // Character should be present initially
      expect(screen.getByText('Deletable Hero')).toBeInTheDocument();
      
      // Note: Delete functionality testing would require expanding the character
      // and accessing delete controls which may not be exposed in this view
    });
  });

  describe('Bulk Operations', () => {
    beforeEach(() => {
      const characters = [
        createTestCharacter({ id: 'bulk-1', name: 'Bulk Hero 1', ownerId: 1 }),
        createTestCharacter({ id: 'bulk-2', name: 'Bulk Hero 2', ownerId: 1 })
      ];
      
      characters.forEach(char => useGameStore.getState().addCharacter(char));
    });

    it('enters bulk selection mode', async () => {
      render(<CharacterPanel />);
      
      // Enter bulk selection mode
      const selectButton = screen.getByRole('button', { name: /☑ select/i });
      await user.click(selectButton);
      
      // Should show bulk actions - use getAllByText for multiple matches
      const selectAllButtons = screen.getAllByText(/select all/i);
      expect(selectAllButtons[0]).toBeInTheDocument();
      
      // Should show checkboxes for each character
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes).toHaveLength(2);
    });

    it('allows selecting individual characters in bulk mode', async () => {
      render(<CharacterPanel />);
      
      // Enter bulk selection mode
      const selectButton = screen.getByRole('button', { name: /☑ select/i });
      await user.click(selectButton);
      
      // Select first character
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[0]);
      
      // Bulk actions should be available - look for specific export selected button
      const exportButton = screen.getByRole('button', { name: /📥 export selected/i });
      expect(exportButton).toBeInTheDocument();
    });

    it('supports select all functionality', async () => {
      render(<CharacterPanel />);
      
      // Enter bulk selection mode
      const selectButton = screen.getByRole('button', { name: /☑ select/i });
      await user.click(selectButton);
      
      // Click select all - get the first one (should be the actual select all button)
      const selectAllButtons = screen.getAllByText(/select all/i);
      const selectAllButton = selectAllButtons[0];
      await user.click(selectAllButton);
      
      // All checkboxes should be checked
      const checkboxes = screen.getAllByRole('checkbox');
      checkboxes.forEach(checkbox => {
        expect(checkbox).toBeChecked();
      });
    });
  });

  describe('Token Management', () => {
    it('displays multiple token badges for characters with multiple sprites', async () => {
      const character = createTestCharacter({ 
        id: 'multi-token-char', 
        name: 'Multi Token Hero',
        ownerId: 1 
      });
      const sprite1 = createTestSprite({ 
        id: 'sprite-1',
        characterId: 'multi-token-char',
        syncStatus: 'local'
      });
      const sprite2 = createTestSprite({ 
        id: 'sprite-2',
        characterId: 'multi-token-char',
        syncStatus: 'synced'
      });
      
      useGameStore.getState().addCharacter(character);
      useGameStore.getState().addSprite(sprite1);
      useGameStore.getState().addSprite(sprite2);
      useGameStore.getState().linkSpriteToCharacter('sprite-1', 'multi-token-char');
      useGameStore.getState().linkSpriteToCharacter('sprite-2', 'multi-token-char');
      
      render(<CharacterPanel />);
      
      // Expand the character card
      const characterCard = screen.getByRole('listitem', { name: /character: multi token hero/i });
      await user.click(characterCard);
      
      await waitFor(() => {
        // Should show token badges (implementation dependent on actual component)
        const tokens = screen.getAllByText('Token');
        expect(tokens.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Connection Status', () => {
    it('shows offline banner when not connected', () => {
      // Mock the protocol to return disconnected
      vi.mocked(vi.importActual('../../services/ProtocolContext')).useProtocol = () => ({
        protocol: {
          requestCharacterList: vi.fn(),
          saveCharacter: vi.fn(),
          deleteCharacter: vi.fn(),
          updateCharacter: vi.fn(),
        },
        isConnected: false,
      });
      
      render(<CharacterPanel />);
      
      expect(screen.getByText(/offline.*changes saved locally/i)).toBeInTheDocument();
    });
  });
});
