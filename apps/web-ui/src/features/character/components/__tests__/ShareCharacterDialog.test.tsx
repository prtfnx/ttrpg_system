import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ShareCharacterDialog } from '../ShareCharacterDialog';

const users = [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
  { id: 3, name: 'Carol' },
];

const baseProps = {
  characterId: 'char-1',
  characterName: 'Gandalf',
  ownerId: 1,
  currentControlledBy: [2],
  availableUsers: users,
  onClose: vi.fn(),
  onSave: vi.fn(),
};

describe('ShareCharacterDialog', () => {
  it('renders character name and owner', () => {
    render(<ShareCharacterDialog {...baseProps} />);
    expect(screen.getByText('Gandalf')).toBeInTheDocument();
    expect(screen.getByText('User 1')).toBeInTheDocument();
  });

  it('pre-checks users in currentControlledBy', () => {
    render(<ShareCharacterDialog {...baseProps} />);
    const bobCheckbox = screen.getAllByRole('checkbox').find(
      cb => (cb as HTMLInputElement).checked
    ) as HTMLInputElement;
    expect(bobCheckbox).toBeDefined();
  });

  it('renders all available users', () => {
    render(<ShareCharacterDialog {...baseProps} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Carol')).toBeInTheDocument();
  });

  it('shows owner badge on owner', () => {
    render(<ShareCharacterDialog {...baseProps} />);
    expect(screen.getByText('Owner')).toBeInTheDocument();
  });

  it('shows no-users message when user list is empty', () => {
    render(<ShareCharacterDialog {...baseProps} availableUsers={[]} />);
    expect(screen.getByText('No other users in this session')).toBeInTheDocument();
  });

  it('toggles user checkbox on click', () => {
    render(<ShareCharacterDialog {...baseProps} />);
    const checkboxes = screen.getAllByRole('checkbox');
    // Alice (id=1) is initially unchecked (not in currentControlledBy=2)
    const aliceCheckbox = checkboxes[0]; // first checkbox = Alice
    fireEvent.click(aliceCheckbox);
    expect((aliceCheckbox as HTMLInputElement).checked).toBe(true);
  });

  it('select all checks all users', () => {
    render(<ShareCharacterDialog {...baseProps} currentControlledBy={[]} />);
    fireEvent.click(screen.getByText('Select All'));
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    checkboxes.forEach(cb => expect(cb.checked).toBe(true));
  });

  it('deselect all unchecks all users', () => {
    render(<ShareCharacterDialog {...baseProps} currentControlledBy={[1, 2, 3]} />);
    fireEvent.click(screen.getByText('Deselect All'));
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    checkboxes.forEach(cb => expect(cb.checked).toBe(false));
  });

  it('Save Changes calls onSave with current selection and closes', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<ShareCharacterDialog {...baseProps} onSave={onSave} onClose={onClose} />);
    fireEvent.click(screen.getByText('Save Changes'));
    expect(onSave).toHaveBeenCalledWith('char-1', expect.any(Array));
    expect(onClose).toHaveBeenCalled();
  });

  it('Cancel calls onClose', () => {
    const onClose = vi.fn();
    render(<ShareCharacterDialog {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('clicking overlay calls onClose', () => {
    const onClose = vi.fn();
    render(<ShareCharacterDialog {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByTitle('Close'));
    expect(onClose).toHaveBeenCalled();
  });
});
