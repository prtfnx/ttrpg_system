import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiceRoller } from '../DiceRoller';

beforeEach(() => {
  // Clean gameAPI between tests
  delete (window as unknown as Record<string, unknown>).gameAPI;
});

describe('DiceRoller', () => {
  it('renders with default d20 selected', () => {
    render(<DiceRoller />);
    expect(screen.getByRole('combobox')).toHaveValue('20');
    expect(screen.getByRole('button', { name: /roll/i })).toBeTruthy();
  });

  it('rolls dice and shows result', () => {
    render(<DiceRoller />);
    fireEvent.click(screen.getByRole('button', { name: /roll/i }));
    expect(screen.getByText(/Result:/)).toBeTruthy();
  });

  it('calls onRoll callback with results', () => {
    const onRoll = vi.fn();
    render(<DiceRoller count={2} onRoll={onRoll} />);
    fireEvent.click(screen.getByRole('button', { name: /roll/i }));
    expect(onRoll).toHaveBeenCalledTimes(1);
    const results: number[] = onRoll.mock.calls[0][0];
    expect(results).toHaveLength(2);
    results.forEach(r => expect(r).toBeGreaterThanOrEqual(1));
  });

  it('shows total for multi-dice rolls', () => {
    render(<DiceRoller count={2} />);
    fireEvent.click(screen.getByRole('button', { name: /roll/i }));
    expect(screen.getByText(/Total:/)).toBeTruthy();
  });

  it('does not show total for single die', () => {
    render(<DiceRoller count={1} />);
    fireEvent.click(screen.getByRole('button', { name: /roll/i }));
    expect(screen.queryByText(/Total:/)).toBeNull();
  });

  it('changes dice type via select', () => {
    render(<DiceRoller />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '6' } });
    expect(screen.getByRole('combobox')).toHaveValue('6');
    expect(screen.getByRole('button', { name: /roll.*d6/i })).toBeTruthy();
  });

  it('sends to chat via window.gameAPI if available', () => {
    const sendMessage = vi.fn();
    (window as unknown as Record<string, unknown>).gameAPI = { sendMessage };
    render(<DiceRoller />);
    fireEvent.click(screen.getByRole('button', { name: /roll/i }));
    expect(sendMessage).toHaveBeenCalledWith('chat', expect.objectContaining({ text: expect.stringContaining('d20') }));
  });

  it('shows "Sent to chat!" after sending', async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn();
    (window as unknown as Record<string, unknown>).gameAPI = { sendMessage };
    render(<DiceRoller />);
    fireEvent.click(screen.getByRole('button', { name: /roll/i }));
    expect(screen.getByText(/Sent to chat!/)).toBeTruthy();
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it('does not send to chat if gameAPI is missing', () => {
    render(<DiceRoller />);
    // No error and no "Sent to chat!" message
    fireEvent.click(screen.getByRole('button', { name: /roll/i }));
    expect(screen.queryByText(/Sent to chat!/)).toBeNull();
  });
});
