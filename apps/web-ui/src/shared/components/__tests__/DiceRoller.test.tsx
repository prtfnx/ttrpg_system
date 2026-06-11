import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiceRoller } from '../DiceRoller';

const mockProtocol = { sendMessage: vi.fn() };
let hasProtocol = false;

vi.mock('@lib/api', () => ({
  ProtocolService: {
    hasProtocol: vi.fn(() => hasProtocol),
    getProtocol: vi.fn(() => mockProtocol),
  },
}));

vi.mock('@lib/websocket', () => ({
  createMessage: vi.fn((type: string, data: unknown) => ({ type, data })),
  MessageType: { CHAT_MESSAGE: 'chat' },
}));

beforeEach(() => {
  hasProtocol = false;
  vi.clearAllMocks();
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

  it('sends to chat via protocol if available', () => {
    hasProtocol = true;
    render(<DiceRoller />);
    fireEvent.click(screen.getByRole('button', { name: /roll/i }));
    expect(mockProtocol.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'chat',
      data: expect.objectContaining({ text: expect.stringContaining('d20') }),
    }));
  });

  it('shows "Sent to chat!" after sending', async () => {
    vi.useFakeTimers();
    hasProtocol = true;
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
