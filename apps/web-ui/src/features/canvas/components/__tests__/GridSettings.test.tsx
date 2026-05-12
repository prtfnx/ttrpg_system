import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { GridSettings } from '../GridSettings';

describe('GridSettings', () => {
  it('renders with default values', () => {
    render(<GridSettings />);
    expect(screen.getByText('Grid Settings')).toBeTruthy();
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('square');
    const sizeInput = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(sizeInput.value).toBe('50');
  });

  it('renders initial prop values', () => {
    render(<GridSettings gridType="hex" gridSize={100} showGrid={false} snapToGrid={false} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('hex');
    const sizeInput = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(sizeInput.value).toBe('100');
  });

  it('calls onGridSettingsChange when grid type changes', async () => {
    const onChange = vi.fn();
    render(<GridSettings onGridSettingsChange={onChange} />);
    await userEvent.selectOptions(screen.getByRole('combobox'), 'hex');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ gridType: 'hex' }));
  });

  it('calls onGridSettingsChange when Show Grid checkbox toggled', async () => {
    const onChange = vi.fn();
    render(<GridSettings showGrid={true} onGridSettingsChange={onChange} />);
    const checkboxes = screen.getAllByRole('checkbox');
    // First checkbox is Show Grid
    await userEvent.click(checkboxes[0]);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ showGrid: false }));
  });

  it('calls onGridSettingsChange when Snap to Grid checkbox toggled', async () => {
    const onChange = vi.fn();
    render(<GridSettings snapToGrid={true} onGridSettingsChange={onChange} />);
    const checkboxes = screen.getAllByRole('checkbox');
    await userEvent.click(checkboxes[1]);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ snapToGrid: false }));
  });

  it('does not throw when onGridSettingsChange is not provided', async () => {
    render(<GridSettings />);
    await userEvent.selectOptions(screen.getByRole('combobox'), 'hex');
    // No error thrown
  });
});
