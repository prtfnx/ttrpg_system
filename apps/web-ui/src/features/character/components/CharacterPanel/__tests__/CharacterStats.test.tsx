import type { Character } from '@/types';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CharacterStats } from '../CharacterStats';

const makeChar = (overrides: Partial<Character['data']> = {}): Character => ({
  id: 'c1',
  sessionId: 's1',
  name: 'Tester',
  ownerId: 1,
  controlledBy: [],
  version: 3,
  createdAt: '',
  updatedAt: '',
  data: {
    stats: { hp: 25, maxHp: 40, ac: 15, speed: 35 },
    conditions: [],
    ...overrides,
  },
});

const defaults = {
  isEditing: false,
  canEdit: false,
  editFormData: {},
  onStartEdit: vi.fn(),
  onCancelEdit: vi.fn(),
  onSaveEdit: vi.fn(),
  onFormChange: vi.fn(),
  onAddCondition: vi.fn(),
  onRemoveCondition: vi.fn(),
};

describe('CharacterStats', () => {
  describe('view mode', () => {
    it('renders HP, AC, speed and version', () => {
      render(<CharacterStats {...defaults} character={makeChar()} />);
      expect(screen.getByText('25 / 40')).toBeInTheDocument();
      expect(screen.getByText('15')).toBeInTheDocument();
      expect(screen.getByText('35 ft')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('falls back to defaults when stats are empty', () => {
      const char = makeChar({ stats: {} });
      render(<CharacterStats {...defaults} character={char} />);
      expect(screen.getByText('0 / 10')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument(); // AC fallback
    });

    it('shows Edit Stats button when canEdit=true', () => {
      render(<CharacterStats {...defaults} canEdit character={makeChar()} />);
      expect(screen.getByRole('button', { name: 'Edit Stats' })).toBeInTheDocument();
    });

    it('hides Edit Stats button when canEdit=false', () => {
      render(<CharacterStats {...defaults} character={makeChar()} />);
      expect(screen.queryByRole('button', { name: 'Edit Stats' })).not.toBeInTheDocument();
    });

    it('calls onStartEdit when Edit Stats clicked', () => {
      const onStartEdit = vi.fn();
      render(<CharacterStats {...defaults} canEdit character={makeChar()} onStartEdit={onStartEdit} />);
      fireEvent.click(screen.getByRole('button', { name: 'Edit Stats' }));
      expect(onStartEdit).toHaveBeenCalledOnce();
    });
  });

  describe('conditions', () => {
    it('shows "No active conditions" when empty', () => {
      render(<CharacterStats {...defaults} character={makeChar()} />);
      expect(screen.getByText('No active conditions')).toBeInTheDocument();
    });

    it('renders condition tags', () => {
      const char = makeChar({ conditions: ['Poisoned', 'Frightened'] });
      render(<CharacterStats {...defaults} character={char} />);
      expect(screen.getByText('Poisoned')).toBeInTheDocument();
      expect(screen.getByText('Frightened')).toBeInTheDocument();
    });

    it('calls onRemoveCondition when × clicked', () => {
      const onRemoveCondition = vi.fn();
      const char = makeChar({ conditions: ['Blinded'] });
      render(
        <CharacterStats
          {...defaults}
          canEdit
          character={char}
          onRemoveCondition={onRemoveCondition}
        />
      );
      fireEvent.click(screen.getByTitle('Remove condition'));
      expect(onRemoveCondition).toHaveBeenCalledWith('Blinded');
    });

    it('shows add-condition input when canEdit=true and not editing', () => {
      render(<CharacterStats {...defaults} canEdit character={makeChar()} />);
      expect(screen.getByPlaceholderText('Add condition...')).toBeInTheDocument();
    });

    it('calls onAddCondition on button click', () => {
      const onAddCondition = vi.fn();
      render(
        <CharacterStats
          {...defaults}
          canEdit
          character={makeChar()}
          onAddCondition={onAddCondition}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Add condition' }));
      expect(onAddCondition).toHaveBeenCalledOnce();
    });

    it('calls onFormChange when condition input changes', () => {
      const onFormChange = vi.fn();
      render(
        <CharacterStats
          {...defaults}
          canEdit
          character={makeChar()}
          onFormChange={onFormChange}
        />
      );
      fireEvent.change(screen.getByPlaceholderText('Add condition...'), { target: { value: 'Stunned' } });
      expect(onFormChange).toHaveBeenCalled();
    });

    it('calls onAddCondition on Enter key in condition input', () => {
      const onAddCondition = vi.fn();
      render(
        <CharacterStats
          {...defaults}
          canEdit
          character={makeChar()}
          onAddCondition={onAddCondition}
        />
      );
      fireEvent.keyPress(screen.getByPlaceholderText('Add condition...'), { key: 'Enter', charCode: 13 });
      expect(onAddCondition).toHaveBeenCalledOnce();
    });
  });

  describe('edit mode', () => {
    const editProps = {
      ...defaults,
      isEditing: true,
      canEdit: true,
      editFormData: { hp: 20, maxHp: 30, ac: 14, speed: 25 },
    };

    it('renders edit inputs with current values', () => {
      render(<CharacterStats {...editProps} character={makeChar()} />);
      expect(screen.getByDisplayValue('20')).toBeInTheDocument(); // hp
      expect(screen.getByDisplayValue('30')).toBeInTheDocument(); // maxHp
    });

    it('calls onSaveEdit on Save click', () => {
      const onSaveEdit = vi.fn();
      render(<CharacterStats {...editProps} character={makeChar()} onSaveEdit={onSaveEdit} />);
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSaveEdit).toHaveBeenCalledOnce();
    });

    it('calls onCancelEdit on Cancel click', () => {
      const onCancelEdit = vi.fn();
      render(<CharacterStats {...editProps} character={makeChar()} onCancelEdit={onCancelEdit} />);
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onCancelEdit).toHaveBeenCalledOnce();
    });

    it('calls onFormChange when HP input changes', () => {
      const onFormChange = vi.fn();
      render(<CharacterStats {...editProps} character={makeChar()} onFormChange={onFormChange} />);
      const inputs = screen.getAllByRole('spinbutton');
      fireEvent.change(inputs[0], { target: { value: '18' } });
      expect(onFormChange).toHaveBeenCalled();
    });
  });
});
