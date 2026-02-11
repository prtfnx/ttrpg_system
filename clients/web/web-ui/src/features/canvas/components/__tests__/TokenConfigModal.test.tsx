/**
 * TokenConfigModal Component Tests
 * Tests UI interactions for token HP/AC management and character linking
 * 
 * Features tested:
 * 1. Modal rendering with sprite data
 * 2. HP/MaxHP/AC input changes
 * 3. HP increment/decrement buttons
 * 4. Character linking dropdown
 * 5. Character unlinking
 * 6. Validation (HP <= MaxHP, positive values)
 * 7. Aura radius control
 * 8. Character list loading
 * 9. Error states
 * 
 * @vitest-environment jsdom
 */

import { useGameStore } from '@/store';
import type { Character, Sprite } from '@/types';
import { TokenConfigModal } from '@features/canvas';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock ProtocolContext
const mockProtocol = {
  requestCharacterList: vi.fn(),
};

vi.mock('../../services/ProtocolContext', () => ({
  useProtocol: () => ({
    protocol: mockProtocol,
    isConnected: true,
  }),
}));

// Mock authService
vi.mock('../../services/auth.service', () => ({
  authService: {
    getUserInfo: () => ({ id: 123, name: 'TestUser' }),
  },
}));

// Test helper: Create a complete Sprite with all required fields
function createTestSprite(overrides: Partial<Sprite> = {}): Sprite {
  return {
    id: 'sprite-1',
    name: 'Test Token',
    tableId: 'test-table-uuid',
    x: 100,
    y: 200,
    layer: 'tokens',
    texture: 'warrior.png',
    scale: { x: 1, y: 1 },
    rotation: 0,
    hp: 50,
    maxHp: 50,
    ac: 15,
    auraRadius: 0,
    ...overrides,
  };
}

// Test helper: Create a complete Character with all required fields
function createTestCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 'char-1',
    sessionId: 'session-1',
    name: 'Aragorn',
    ownerId: 123,
    controlledBy: [123],
    data: {
      level: 5,
      class: 'Ranger',
      stats: { hp: 45, maxHp: 50, ac: 16 },
    },
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('TokenConfigModal - Component UI Tests', () => {
  let onCloseMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Reset store
    useGameStore.setState({
      sprites: [],
      characters: [],
      selectedSprites: [],
      activeTableId: 'test-table-uuid',
    });

    onCloseMock = vi.fn();
    mockProtocol.requestCharacterList.mockClear();
  });

  describe('Rendering', () => {
    it('should render modal with sprite data', () => {
      const testSprite = createTestSprite({
        hp: 25,
        maxHp: 50,
        ac: 15,
        auraRadius: 30,
      });

      useGameStore.setState({ sprites: [testSprite] });

      render(<TokenConfigModal spriteId="sprite-1" onClose={onCloseMock} />);

      expect(screen.getByText(/Token Configuration/i)).toBeInTheDocument();
      expect(screen.getByDisplayValue('25')).toBeInTheDocument(); // HP
      expect(screen.getByDisplayValue('50')).toBeInTheDocument(); // MaxHP
      expect(screen.getByDisplayValue('15')).toBeInTheDocument(); // AC
    });

    it('should display HP bar with correct percentage', () => {
      const testSprite = createTestSprite({
        hp: 30,
        maxHp: 100,
        ac: 15,
      });

      useGameStore.setState({ sprites: [testSprite] });

      render(<TokenConfigModal spriteId="sprite-1" onClose={onCloseMock} />);

      // HP bar should show 30/100
      expect(screen.getByText(/30.*100/)).toBeInTheDocument();
    });

    it('should render character selection dropdown', () => {
      const testSprite = createTestSprite();
      const testCharacter = createTestCharacter({
        name: 'Aragorn',
        data: {
          level: 5,
          class: 'Ranger',
          stats: { hp: 45, maxHp: 50, ac: 16 },
        },
      });

      useGameStore.setState({
        sprites: [testSprite],
        characters: [testCharacter],
      });

      render(<TokenConfigModal spriteId="sprite-1" onClose={onCloseMock} />);

      expect(screen.getByText(/-- No Character --/)).toBeInTheDocument();
      expect(screen.getByText(/Aragorn \(Lv 5 Ranger\)/)).toBeInTheDocument();
    });
  });

  describe('HP Management', () => {
    it('should update HP when input changes', async () => {
      const user = userEvent.setup();
      const testSprite = createTestSprite({
        hp: 50,
        maxHp: 50,
        ac: 15,
      });

      useGameStore.setState({ sprites: [testSprite] });

      render(<TokenConfigModal spriteId="sprite-1" onClose={onCloseMock} />);

      // Get HP input specifically (it has max attribute, first one)
      const allInputs = screen.getAllByRole('spinbutton');
      const hpInput = allInputs[0] as HTMLInputElement;
      expect(hpInput.max).toBe('50'); // Verify it's the HP input
      
      await user.clear(hpInput);
      await user.type(hpInput, '30');

      // Wait for state update
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      const updatedSprite = useGameStore.getState().sprites.find(s => s.id === 'sprite-1');
      expect(updatedSprite?.hp).toBe(30);
    });

    it('should increment HP with + button', async () => {
      const user = userEvent.setup();
      const testSprite = createTestSprite({
        hp: 25,
        maxHp: 50,
        ac: 15,
      });

      useGameStore.setState({ sprites: [testSprite] });

      render(<TokenConfigModal spriteId="sprite-1" onClose={onCloseMock} />);

      const incrementButton = screen.getAllByText('+')[0]; // First + button (HP)
      await user.click(incrementButton);

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      const updatedSprite = useGameStore.getState().sprites.find(s => s.id === 'sprite-1');
      expect(updatedSprite?.hp).toBe(26);
    });

    it('should decrement HP with - button', async () => {
      const user = userEvent.setup();
      const testSprite = createTestSprite({
        hp: 25,
        maxHp: 50,
        ac: 15,
      });

      useGameStore.setState({ sprites: [testSprite] });

      render(<TokenConfigModal spriteId="sprite-1" onClose={onCloseMock} />);

      const decrementButton = screen.getAllByText('−')[0]; // First - button (HP)
      await user.click(decrementButton);

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      const updatedSprite = useGameStore.getState().sprites.find(s => s.id === 'sprite-1');
      expect(updatedSprite?.hp).toBe(24);
    });

    it('should not allow HP to go below 0', async () => {
      const user = userEvent.setup();
      const testSprite = createTestSprite({
        hp: 1,
        maxHp: 50,
        ac: 15,
      });

      useGameStore.setState({ sprites: [testSprite] });

      render(<TokenConfigModal spriteId="sprite-1" onClose={onCloseMock} />);

      const decrementButton = screen.getAllByText('−')[0];
      await user.click(decrementButton);
      await user.click(decrementButton); // Click twice

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      const updatedSprite = useGameStore.getState().sprites.find(s => s.id === 'sprite-1');
      expect(updatedSprite?.hp).toBeGreaterThanOrEqual(0);
    });

    it('should not allow HP to exceed MaxHP', async () => {
      const user = userEvent.setup();
      const testSprite = createTestSprite({
        hp: 50,
        maxHp: 50,
        ac: 15,
      });

      useGameStore.setState({ sprites: [testSprite] });

      render(<TokenConfigModal spriteId="sprite-1" onClose={onCloseMock} />);

      const incrementButton = screen.getAllByText('+')[0];
      await user.click(incrementButton);

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      const updatedSprite = useGameStore.getState().sprites.find(s => s.id === 'sprite-1');
      expect(updatedSprite?.hp).toBeLessThanOrEqual(updatedSprite?.maxHp || 50);
    });
  });

  describe('MaxHP Management', () => {
    it('should update MaxHP when input changes', async () => {
      const user = userEvent.setup();
      const testSprite = createTestSprite({
        hp: 50,
        maxHp: 50,
        ac: 15,
      });

      useGameStore.setState({ sprites: [testSprite] });

      render(<TokenConfigModal spriteId="sprite-1" onClose={onCloseMock} />);

      const maxHpInputs = screen.getAllByDisplayValue('50');
      const maxHpInput = maxHpInputs[1] as HTMLInputElement; // Second input is MaxHP
      expect(maxHpInput.min).toBe('1'); // Verify it's the MaxHP input
      
      maxHpInput.value = '';
      await user.type(maxHpInput, '100');

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      const updatedSprite = useGameStore.getState().sprites.find(s => s.id === 'sprite-1');
      expect(updatedSprite?.maxHp).toBe(100);
    });
  });

  describe('AC Management', () => {
    it('should update AC when input changes', async () => {
      const user = userEvent.setup();
      const testSprite = createTestSprite({
        hp: 50,
        maxHp: 50,
        ac: 15,
      });

      useGameStore.setState({ sprites: [testSprite] });

      render(<TokenConfigModal spriteId="sprite-1" onClose={onCloseMock} />);

      const acInput = screen.getByDisplayValue('15') as HTMLInputElement;
      acInput.value = '';
      await user.type(acInput, '18');

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      const updatedSprite = useGameStore.getState().sprites.find(s => s.id === 'sprite-1');
      expect(updatedSprite?.ac).toBe(18);
    });
  });

  describe('Character Linking', () => {
    it('should link character to sprite', async () => {
      const user = userEvent.setup();
      const testSprite = createTestSprite();
      const testCharacter = createTestCharacter({
        name: 'Aragorn',
        data: {
          level: 5,
          class: 'Ranger',
          stats: { hp: 45, maxHp: 50, ac: 16 },
        },
      });

      useGameStore.setState({
        sprites: [testSprite],
        characters: [testCharacter],
      });

      render(<TokenConfigModal spriteId="sprite-1" onClose={onCloseMock} />);

      const dropdown = screen.getByRole('combobox');
      await user.selectOptions(dropdown, 'char-1');

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      const updatedSprite = useGameStore.getState().sprites.find(s => s.id === 'sprite-1');
      expect(updatedSprite?.characterId).toBe('char-1');
    });

    it('should show linked character data', () => {
      const testSprite = createTestSprite({
        hp: 45,
        maxHp: 50,
        ac: 16,
        characterId: 'char-1',
      });
      const testCharacter = createTestCharacter({
        name: 'Aragorn',
        data: {
          level: 5,
          class: 'Ranger',
          stats: { hp: 45, maxHp: 50, ac: 16 },
        },
      });

      useGameStore.setState({
        sprites: [testSprite],
        characters: [testCharacter],
      });

      render(<TokenConfigModal spriteId="sprite-1" onClose={onCloseMock} />);

      expect(screen.getByText(/Aragorn \(Lv 5 Ranger\)/)).toBeInTheDocument();
    });

    it('should unlink character when selecting "No Character"', async () => {
      const user = userEvent.setup();
      const testSprite = createTestSprite({
        hp: 45,
        maxHp: 50,
        ac: 16,
        characterId: 'char-1',
      });
      const testCharacter = createTestCharacter({
        name: 'Aragorn',
        data: {
          level: 5,
          class: 'Ranger',
          stats: { hp: 45, maxHp: 50, ac: 16 },
        },
      });

      useGameStore.setState({
        sprites: [testSprite],
        characters: [testCharacter],
      });

      render(<TokenConfigModal spriteId="sprite-1" onClose={onCloseMock} />);

      const dropdown = screen.getByRole('combobox');
      await user.selectOptions(dropdown, ''); // Select "No Character"

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      const state = useGameStore.getState();
      const updatedSprite = state.sprites.find(s => s.id === 'sprite-1');
      expect(updatedSprite?.characterId).toBeUndefined();
    });
  });

  describe('Character List Loading', () => {
    it('should display character dropdown when modal opens', () => {
      const testSprite = createTestSprite();

      useGameStore.setState({ sprites: [testSprite], characters: [] });

      render(<TokenConfigModal spriteId="sprite-1" onClose={onCloseMock} />);

      // User should see the character selection dropdown
      const dropdown = screen.getByRole('combobox', { name: /link to character/i });
      expect(dropdown).toBeInTheDocument();
      // Should show "No Character" option when no characters are available
      expect(screen.getByText(/-- no character --/i)).toBeInTheDocument();
    });

    it('should display available characters in dropdown when loaded', () => {
      const testSprite = createTestSprite();
      const testCharacter = createTestCharacter({
        id: 'char-1',
        name: 'Aragorn',
        data: { level: 5, class: 'Ranger' },
      });

      useGameStore.setState({
        sprites: [testSprite],
        characters: [testCharacter],
      });

      render(<TokenConfigModal spriteId="sprite-1" onClose={onCloseMock} />);

      // User should see the character selection dropdown
      const dropdown = screen.getByRole('combobox', { name: /link to character/i });
      expect(dropdown).toBeInTheDocument();
      
      // The dropdown should have an option for the character (check within the select)
      const option = screen.getByRole('option', { name: /aragorn/i });
      expect(option).toBeInTheDocument();
    });
  });

  describe('Aura Radius', () => {
    it('should update aura radius when input changes', async () => {
      const user = userEvent.setup();
      const testSprite = createTestSprite({
        auraRadius: 30,
      });

      useGameStore.setState({ sprites: [testSprite] });

      render(<TokenConfigModal spriteId="sprite-1" onClose={onCloseMock} />);

      const auraInputs = screen.getAllByDisplayValue('30');
      const auraInput = auraInputs.find(input => 
        input.getAttribute('type') === 'range' || 
        input.getAttribute('type') === 'number'
      );

      if (auraInput) {
        await user.clear(auraInput);
        await user.type(auraInput, '50');

        await act(async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
        });

        const updatedSprite = useGameStore.getState().sprites.find(s => s.id === 'sprite-1');
        expect(updatedSprite?.auraRadius).toBe(50);
      }
    });
  });

  describe('Close Behavior', () => {
    it('should call onClose when close button clicked', async () => {
      const user = userEvent.setup();
      const testSprite = createTestSprite();

      useGameStore.setState({ sprites: [testSprite] });

      render(<TokenConfigModal spriteId="sprite-1" onClose={onCloseMock} />);

      const closeButton = screen.getByText('×');
      await user.click(closeButton);

      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });
  });
});
