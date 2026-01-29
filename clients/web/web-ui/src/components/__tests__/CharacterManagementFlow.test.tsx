import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../../store';
import type { Character } from '../../types';

// Mock dependencies
vi.mock('../../services/auth.service', () => ({
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
    isConnected: false, // Offline mode for tests
  }),
}));

vi.mock('@shared/utils/characterImportExport', () => ({
  cloneCharacter: vi.fn((char: Character, userId: number) => ({
    ...char,
    id: `cloned-${Date.now()}`,
    name: `${char.name} (Copy)`,
    ownerId: userId,
    version: 1,
    syncStatus: 'local' as const,
  })),
  downloadCharacterAsJSON: vi.fn(),
  downloadMultipleCharactersAsJSON: vi.fn(),
  pickAndImportCharacter: vi.fn(),
}));

vi.mock('../../utils/toast', () => ({
  showToast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../CharacterWizard/EnhancedCharacterWizard', () => ({
  EnhancedCharacterWizard: ({ isOpen, onFinish, onCancel }: any) => {
    if (!isOpen) return null;
    return (
      <div data-testid="character-wizard-modal">
        <h2>Character Wizard</h2>
        <button
          onClick={() => onFinish({
            name: 'New Hero',
            class: 'Paladin',
            race: 'Human',
            level: 1,
            stats: { hp: 12, maxHp: 12, ac: 16, speed: 30 },
          })}
        >
          Create Character
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    );
  },
}));

vi.mock('../ShareCharacterDialog', () => ({
  ShareCharacterDialog: ({ isOpen, onClose }: any) => {
    if (!isOpen) return null;
    return (
      <div data-testid="share-dialog">
        <h2>Share Character</h2>
        <button onClick={onClose}>Close</button>
      </div>
    );
  },
}));

function createCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: `char-${Date.now()}-${Math.random()}`,
    sessionId: 'test-session',
    name: 'Test Character',
    ownerId: 1,
    controlledBy: [],
    data: {
      class: 'Fighter',
      race: 'Human',
      level: 5,
      stats: { hp: 45, maxHp: 45, ac: 16, speed: 30 },
    },
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    syncStatus: 'local' as const,
    ...overrides,
  };
}

describe('E2E Character Management Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset store completely
    const initial = useGameStore.getState();
    useGameStore.setState({
      ...initial,
      characters: [],
      sprites: [],
      selectedSprites: [],
      tables: [],
      activeTableId: null,
    }, true);
    
    // Set session/user id
    (useGameStore.getState() as any).sessionId = 1;
    
    // Mock window.confirm
    window.confirm = vi.fn(() => true);
  });

  describe('Character Creation Flow', () => {
    it('should open wizard, create character, and display in list', async () => {
      const user = userEvent.setup();
      render(<CharacterPanelRedesigned />);

      // Initially no characters
      expect(screen.getByText(/no characters yet/i)).toBeInTheDocument();

      // Click create button
      const createButton = screen.getByTitle('Create New Character');
      await user.click(createButton);

      // Wizard should open
      await waitFor(() => {
        expect(screen.getByTestId('character-wizard-modal')).toBeInTheDocument();
      });

      // Complete wizard
      const wizardCreateButton = screen.getByText('Create Character');
      await user.click(wizardCreateButton);

      // Character should appear in list
      await waitFor(() => {
        expect(screen.getByText('New Hero')).toBeInTheDocument();
      });

      // Verify character was added to store
      const characters = useGameStore.getState().characters;
      expect(characters).toHaveLength(1);
      expect(characters[0].name).toBe('New Hero');
      expect(characters[0].data.class).toBe('Paladin');
    });

    it('should cancel wizard without creating character', async () => {
      const user = userEvent.setup();
      render(<CharacterPanelRedesigned />);

      const createButton = screen.getByTitle('Create New Character');
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByTestId('character-wizard-modal')).toBeInTheDocument();
      });

      // Cancel wizard
      const cancelButton = screen.getByText('Cancel');
      await user.click(cancelButton);

      // Wizard should close, no character created
      await waitFor(() => {
        expect(screen.queryByTestId('character-wizard-modal')).not.toBeInTheDocument();
      });

      expect(useGameStore.getState().characters).toHaveLength(0);
    });
  });

  describe('Character Edit Flow', () => {
    it('should expand character, edit stats, and save changes', async () => {
      const user = userEvent.setup();
      const testChar = createCharacter({
        id: 'edit-1',
        name: 'Edit Me',
        data: {
          stats: { hp: 30, maxHp: 40, ac: 15, speed: 30 },
        },
      });
      
      useGameStore.getState().addCharacter(testChar);
      render(<CharacterPanelRedesigned />);

      // Expand character card
      const characterName = screen.getByText('Edit Me');
      const card = characterName.closest('[class*="characterCard"]');
      const expandButton = card?.querySelector('[class*="charExpandBtn"]');
      
      if (expandButton) {
        await user.click(expandButton as HTMLElement);
      }

      // Click Edit Stats button
      await waitFor(() => {
        const editButton = screen.getByText('Edit Stats');
        expect(editButton).toBeInTheDocument();
      });

      const editButton = screen.getByText('Edit Stats');
      await user.click(editButton);

      // Find HP input and change value
      await waitFor(() => {
        const hpInputs = screen.getAllByDisplayValue('30');
        expect(hpInputs.length).toBeGreaterThan(0);
      });

      const hpInput = screen.getAllByDisplayValue('30')[0];
      await user.clear(hpInput);
      await user.type(hpInput, '35');

      // Save changes
      const saveButton = screen.getByText('Save');
      await user.click(saveButton);

      // Verify changes were saved
      await waitFor(() => {
        const updatedChar = useGameStore.getState().characters.find(c => c.id === 'edit-1');
        expect(updatedChar?.data.stats.hp).toBe(35);
      });
    });

    it('should cancel edit without saving changes', async () => {
      const user = userEvent.setup();
      const testChar = createCharacter({
        id: 'cancel-edit-1',
        name: 'Cancel Edit',
        data: {
          stats: { hp: 30, maxHp: 40, ac: 15, speed: 30 },
        },
      });
      
      useGameStore.getState().addCharacter(testChar);
      render(<CharacterPanelRedesigned />);

      const characterName = screen.getByText('Cancel Edit');
      const card = characterName.closest('[class*="characterCard"]');
      const expandButton = card?.querySelector('[class*="charExpandBtn"]');
      
      if (expandButton) {
        await user.click(expandButton as HTMLElement);
      }

      const editButton = await screen.findByText('Edit Stats');
      await user.click(editButton);

      const hpInput = screen.getAllByDisplayValue('30')[0];
      await user.clear(hpInput);
      await user.type(hpInput, '99');

      // Cancel instead of save
      const cancelButton = screen.getByText('Cancel');
      await user.click(cancelButton);

      // Verify changes were NOT saved
      const character = useGameStore.getState().characters.find(c => c.id === 'cancel-edit-1');
      expect(character?.data.stats.hp).toBe(30);
    });
  });

  describe('Character Delete Flow', () => {
    it('should delete character after confirmation', async () => {
      const testChar = createCharacter({
        id: 'delete-1',
        name: 'Delete Me',
      });
      
      useGameStore.getState().addCharacter(testChar);
      render(<CharacterPanelRedesigned />);

      expect(screen.getByText('Delete Me')).toBeInTheDocument();

      // Expand card
      const card = screen.getByText('Delete Me').closest('[class*="characterCard"]');
      const expandButton = card?.querySelector('[class*="charExpandBtn"]');
      
      if (expandButton) {
        const clickEvent = new MouseEvent('click', { bubbles: true });
        expandButton.dispatchEvent(clickEvent);
      }

      // Find and click delete button
      await waitFor(() => {
        const deleteButton = screen.getByTitle(/delete this character/i);
        expect(deleteButton).toBeInTheDocument();
      });

      const deleteButton = screen.getByTitle(/delete this character/i);
      const clickEvent = new MouseEvent('click', { bubbles: true });
      deleteButton.dispatchEvent(clickEvent);

      // Character should be removed
      await waitFor(() => {
        expect(screen.queryByText('Delete Me')).not.toBeInTheDocument();
      });

      expect(useGameStore.getState().characters).toHaveLength(0);
    });

    it('should not delete if user cancels confirmation', async () => {
      window.confirm = vi.fn(() => false);
      
      const testChar = createCharacter({
        id: 'keep-1',
        name: 'Keep Me',
      });
      
      useGameStore.getState().addCharacter(testChar);
      render(<CharacterPanelRedesigned />);

      const card = screen.getByText('Keep Me').closest('[class*="characterCard"]');
      const expandButton = card?.querySelector('[class*="charExpandBtn"]');
      
      if (expandButton) {
        expandButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }

      await waitFor(() => {
        const deleteButton = screen.getByTitle(/delete this character/i);
        expect(deleteButton).toBeInTheDocument();
      });

      const deleteButton = screen.getByTitle(/delete this character/i);
      deleteButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // Character should still be there
      await waitFor(() => {
        expect(screen.getByText('Keep Me')).toBeInTheDocument();
      });

      expect(useGameStore.getState().characters).toHaveLength(1);
    });
  });

  describe('Character Share Flow', () => {
    it('should have share button available for owned character', async () => {
      const user = userEvent.setup();
      const testChar = createCharacter({
        id: 'share-1',
        name: 'Share Me',
      });
      
      useGameStore.getState().addCharacter(testChar);
      render(<CharacterPanelRedesigned />);

      // Expand card
      const card = screen.getByText('Share Me').closest('[class*="characterCard"]');
      const expandButton = card?.querySelector('[class*="charExpandBtn"]');
      
      if (expandButton) {
        await user.click(expandButton as HTMLElement);
      }

      // Share button should be available (clicking would open dialog in production)
      const shareButton = await screen.findByText('Share');
      expect(shareButton).toBeInTheDocument();
      expect(shareButton).not.toBeDisabled();
    });
  });

  describe('Character Clone Flow', () => {
    it('should clone character with copy indicator', async () => {
      const user = userEvent.setup();
      const testChar = createCharacter({
        id: 'original-1',
        name: 'Original Character',
        data: {
          class: 'Wizard',
          race: 'Elf',
          level: 10,
        },
      });
      
      useGameStore.getState().addCharacter(testChar);
      render(<CharacterPanelRedesigned />);

      // Expand card
      const card = screen.getByText('Original Character').closest('[class*="characterCard"]');
      const expandButton = card?.querySelector('[class*="charExpandBtn"]');
      
      if (expandButton) {
        await user.click(expandButton as HTMLElement);
      }

      // Click Clone button
      const cloneButton = await screen.findByTitle(/create a duplicate/i);
      await user.click(cloneButton);

      // Cloned character should appear
      await waitFor(() => {
        expect(screen.getByText(/Original Character \(Copy\)/i)).toBeInTheDocument();
      });

      // Verify both characters exist
      const characters = useGameStore.getState().characters;
      expect(characters).toHaveLength(2);
      expect(characters.some(c => c.name === 'Original Character')).toBe(true);
      expect(characters.some(c => c.name.includes('(Copy)'))).toBe(true);
    });
  });

  describe('Bulk Operations Flow', () => {
    it('should enable bulk mode, select multiple, and delete all', async () => {
      const user = userEvent.setup();
      
      useGameStore.getState().addCharacter(createCharacter({ id: 'bulk-1', name: 'Bulk 1' }));
      useGameStore.getState().addCharacter(createCharacter({ id: 'bulk-2', name: 'Bulk 2' }));
      useGameStore.getState().addCharacter(createCharacter({ id: 'bulk-3', name: 'Bulk 3' }));
      
      render(<CharacterPanelRedesigned />);

      // Enter bulk mode
      const selectButton = screen.getByTitle(/enter bulk selection mode/i);
      await user.click(selectButton);

      // Checkboxes should appear
      await waitFor(() => {
        const checkboxes = screen.getAllByRole('checkbox');
        expect(checkboxes.length).toBe(3);
      });

      // Select all
      const selectAllButton = screen.getByText('Select All');
      await user.click(selectAllButton);

      // All should be checked
      await waitFor(() => {
        const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
        expect(checkboxes.every(cb => cb.checked)).toBe(true);
      });

      // Delete selected
      const bulkDeleteButton = screen.getByText(/delete selected/i);
      await user.click(bulkDeleteButton);

      // All characters should be removed
      await waitFor(() => {
        expect(useGameStore.getState().characters).toHaveLength(0);
      });
    });

    it('should export selected characters in bulk', async () => {
      const user = userEvent.setup();
      const { downloadMultipleCharactersAsJSON } = await import('@shared/utils/characterImportExport');
      
      useGameStore.getState().addCharacter(createCharacter({ id: 'export-1', name: 'Export 1' }));
      useGameStore.getState().addCharacter(createCharacter({ id: 'export-2', name: 'Export 2' }));
      
      render(<CharacterPanelRedesigned />);

      // Enter bulk mode
      const selectButton = screen.getByTitle(/enter bulk selection mode/i);
      await user.click(selectButton);

      // Select first two checkboxes
      const checkboxes = await screen.findAllByRole('checkbox');
      await user.click(checkboxes[0]);
      await user.click(checkboxes[1]);

      // Export selected
      const exportButton = screen.getByText(/export selected/i);
      await user.click(exportButton);

      // Should call export function
      await waitFor(() => {
        expect(downloadMultipleCharactersAsJSON).toHaveBeenCalled();
      });
    });

    it('should deselect all characters', async () => {
      const user = userEvent.setup();
      
      useGameStore.getState().addCharacter(createCharacter({ id: 'deselect-1', name: 'Deselect 1' }));
      useGameStore.getState().addCharacter(createCharacter({ id: 'deselect-2', name: 'Deselect 2' }));
      
      render(<CharacterPanelRedesigned />);

      const selectButton = screen.getByTitle(/enter bulk selection mode/i);
      await user.click(selectButton);

      // Select all
      const selectAllButton = screen.getByText('Select All');
      await user.click(selectAllButton);

      await waitFor(() => {
        const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
        expect(checkboxes.every(cb => cb.checked)).toBe(true);
      });

      // Deselect all
      const deselectAllButton = screen.getByText('Deselect All');
      await user.click(deselectAllButton);

      await waitFor(() => {
        const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
        expect(checkboxes.every(cb => !cb.checked)).toBe(true);
      });
    });
  });

  describe('Search Integration Flow', () => {
    it('should create character and immediately find it via search', async () => {
      const user = userEvent.setup();
      render(<CharacterPanelRedesigned />);

      // Create character via wizard
      const createButton = screen.getByTitle('Create New Character');
      await user.click(createButton);

      const wizardCreateButton = await screen.findByText('Create Character');
      await user.click(wizardCreateButton);

      // Character appears
      await waitFor(() => {
        expect(screen.getByText('New Hero')).toBeInTheDocument();
      });

      // Search for it
      const searchInput = screen.getByPlaceholderText(/search/i);
      await user.type(searchInput, 'paladin');

      // Should still be visible (matches class)
      expect(screen.getByText('New Hero')).toBeInTheDocument();

      // Search for non-match
      await user.clear(searchInput);
      await user.type(searchInput, 'wizard');

      // Should not be visible
      await waitFor(() => {
        expect(screen.queryByText('New Hero')).not.toBeInTheDocument();
      });
    });
  });

  describe('Token Integration Flow', () => {
    it('should create character and add token sprite', async () => {
      const user = userEvent.setup();
      const testChar = createCharacter({
        id: 'token-1',
        name: 'Token Test',
      });
      
      useGameStore.getState().addCharacter(testChar);
      render(<CharacterPanelRedesigned />);

      // Expand card
      const card = screen.getByText('Token Test').closest('[class*="characterCard"]');
      const expandButton = card?.querySelector('[class*="charExpandBtn"]');
      
      if (expandButton) {
        await user.click(expandButton as HTMLElement);
      }

      // Click Add Token
      const addTokenButton = await screen.findByText('Add Token');
      await user.click(addTokenButton);

      // Verify sprite was added via store
      await waitFor(() => {
        const sprites = useGameStore.getState().sprites;
        expect(sprites.length).toBeGreaterThan(0);
        expect(sprites[0].characterId).toBe('token-1');
      });
    });
  });

  describe('Complete Workflow: Create → Clone → Delete', () => {
    it('should execute full character lifecycle', async () => {
      const user = userEvent.setup();
      render(<CharacterPanelRedesigned />);

      // 1. CREATE character via wizard
      const createButton = screen.getByTitle('Create New Character');
      await user.click(createButton);
      const wizardCreateButton = await screen.findByText('Create Character');
      await user.click(wizardCreateButton);

      await waitFor(() => {
        expect(screen.getByText('New Hero')).toBeInTheDocument();
        expect(useGameStore.getState().characters).toHaveLength(1);
      });

      const createdCharId = useGameStore.getState().characters[0].id;
      const sessionId = useGameStore.getState().sessionId;
      const userId = typeof sessionId === 'string' ? parseInt(sessionId, 10) : (sessionId || 1);

      // 2. CLONE character (using utility function - UI clone tested separately)
      const { cloneCharacter } = await import('@shared/utils/characterImportExport');
      const originalChar = useGameStore.getState().characters[0];
      const clonedChar = cloneCharacter(originalChar, userId);
      useGameStore.getState().addCharacter(clonedChar);

      await waitFor(() => {
        expect(useGameStore.getState().characters).toHaveLength(2);
      });

      // Verify clone appears in UI
      await waitFor(() => {
        expect(screen.getByText(/New Hero \(Copy\)/i)).toBeInTheDocument();
      });

      // 3. DELETE original character (using store method)
      useGameStore.getState().removeCharacter(createdCharId);

      await waitFor(() => {
        const chars = useGameStore.getState().characters;
        expect(chars).toHaveLength(1);
        expect(chars[0].name).toContain('(Copy)');
      });

      // Verify UI reflects deletion
      await waitFor(() => {
        // Should only find the copy
        const copyText = screen.getByText(/New Hero \(Copy\)/i);
        expect(copyText).toBeInTheDocument();
        
        // Original "New Hero" without "(Copy)" should not exist
        const allHeroes = screen.queryAllByText(/New Hero/i);
        expect(allHeroes.length).toBe(1); // Only the copy
      });
    });
  });
});
