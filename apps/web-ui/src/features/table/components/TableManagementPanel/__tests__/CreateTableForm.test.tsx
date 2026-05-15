import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CreateTableForm } from '../CreateTableForm';

// CSS modules are identity-mapped in tests
vi.mock('../TableManagementPanel.module.css', () => ({ default: {} }));

const defaultProps = {
  tableName: 'My Table',
  tableWidth: 2000,
  tableHeight: 2000,
  onNameChange: vi.fn(),
  onWidthChange: vi.fn(),
  onHeightChange: vi.fn(),
  onApplyTemplate: vi.fn(),
  onCreate: vi.fn(),
  onCancel: vi.fn(),
};

function renderForm(overrides = {}) {
  return render(<CreateTableForm {...defaultProps} {...overrides} />);
}

describe('CreateTableForm', () => {
  it('renders heading and form inputs', () => {
    renderForm();
    expect(screen.getByText('Create New Table')).toBeTruthy();
    expect(screen.getByPlaceholderText('Enter table name')).toBeTruthy();
  });

  it('displays current prop values in inputs', () => {
    renderForm({ tableName: 'Arena', tableWidth: 3000, tableHeight: 1500 });
    expect((screen.getByPlaceholderText('Enter table name') as HTMLInputElement).value).toBe('Arena');
    const numberInputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    expect(numberInputs[0].value).toBe('3000');
    expect(numberInputs[1].value).toBe('1500');
  });

  it('calls onNameChange when text input changes', () => {
    const onNameChange = vi.fn();
    renderForm({ onNameChange });
    fireEvent.change(screen.getByPlaceholderText('Enter table name'), { target: { value: 'Dungeon' } });
    expect(onNameChange).toHaveBeenCalledWith('Dungeon');
  });

  it('calls onWidthChange with parsed number', () => {
    const onWidthChange = vi.fn();
    renderForm({ onWidthChange });
    const [widthInput] = screen.getAllByRole('spinbutton');
    fireEvent.change(widthInput, { target: { value: '4000' } });
    expect(onWidthChange).toHaveBeenCalledWith(4000);
  });

  it('calls onHeightChange with parsed number', () => {
    const onHeightChange = vi.fn();
    renderForm({ onHeightChange });
    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[1], { target: { value: '3500' } });
    expect(onHeightChange).toHaveBeenCalledWith(3500);
  });

  it('falls back to 2000 for non-numeric width input', () => {
    const onWidthChange = vi.fn();
    renderForm({ onWidthChange });
    const [widthInput] = screen.getAllByRole('spinbutton');
    fireEvent.change(widthInput, { target: { value: 'abc' } });
    expect(onWidthChange).toHaveBeenCalledWith(2000);
  });

  it('renders Quick Templates buttons', () => {
    renderForm();
    expect(screen.getByText('Quick Templates:')).toBeTruthy();
    // TABLE_TEMPLATES has at least one entry
    const templateButtons = screen.getAllByRole('button').filter(
      (b) => !['Create Table', 'Cancel'].includes(b.textContent ?? '')
    );
    expect(templateButtons.length).toBeGreaterThan(0);
  });

  it('calls onApplyTemplate with template key on template button click', () => {
    const onApplyTemplate = vi.fn();
    renderForm({ onApplyTemplate });
    const templateButtons = screen.getAllByRole('button').filter(
      (b) => !['Create Table', 'Cancel'].includes(b.textContent ?? '')
    );
    fireEvent.click(templateButtons[0]);
    expect(onApplyTemplate).toHaveBeenCalled();
  });

  it('calls onCreate when Create Table button clicked', () => {
    const onCreate = vi.fn();
    renderForm({ onCreate });
    fireEvent.click(screen.getByRole('button', { name: 'Create Table' }));
    expect(onCreate).toHaveBeenCalled();
  });

  it('calls onCancel when Cancel button clicked', () => {
    const onCancel = vi.fn();
    renderForm({ onCancel });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
