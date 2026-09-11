import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@features/chat/chatStore';
import { MessageType } from '@lib/websocket';
import { DiceRoller } from '../DiceRoller';

const mockProtocol = {
  sendMessage: vi.fn(),
  isConnected: vi.fn(() => true),
  getSessionCode: vi.fn(() => 'ROOM'),
  registerHandler: vi.fn(),
  unregisterHandler: vi.fn(),
  onConnectionStateChange: vi.fn(() => vi.fn()),
};
let protocol: typeof mockProtocol | null = null;

vi.mock('@lib/api', () => ({
  useOptionalProtocol: vi.fn(() => protocol ? { protocol } : null),
}));

beforeEach(() => {
  protocol = null;
  mockProtocol.isConnected.mockReturnValue(true);
  useChatStore.setState({ activeSessionId: null, messages: [], messagesBySession: {} });
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
    protocol = mockProtocol;
    render(<DiceRoller user="Alice" />);
    fireEvent.click(screen.getByRole('button', { name: /roll/i }));
    const chatCall = mockProtocol.sendMessage.mock.calls.find(([message]) => message.type === MessageType.CHAT);
    expect(chatCall?.[0]).toEqual(expect.objectContaining({
      type: MessageType.CHAT,
      data: {
        message: expect.objectContaining({
          id: expect.stringMatching(/^[A-Za-z0-9._-]{1,64}$/),
          client_operation_id: expect.stringMatching(/^[A-Za-z0-9._-]{1,64}$/),
          user: 'Alice',
          text: expect.stringContaining('d20'),
        }),
      },
    }));
    expect(chatCall?.[0].data.message.id).toBe(chatCall?.[0].data.message.client_operation_id);
  });

  it('shows sent only after the matching server acknowledgement', () => {
    protocol = mockProtocol;
    render(<DiceRoller />);
    fireEvent.click(screen.getByRole('button', { name: /roll/i }));
    expect(screen.getByText(/Sending to chat/)).toBeTruthy();
    expect(screen.queryByText(/Sent to chat!/)).toBeNull();

    const pending = useChatStore.getState().messages[0];
    const confirmationHandler = mockProtocol.registerHandler.mock.calls.find(
      ([type]) => type === MessageType.CHAT_CONFIRMATION,
    )?.[1];
    act(() => confirmationHandler({
      type: MessageType.CHAT_CONFIRMATION,
      data: {
        client_operation_id: pending.client_operation_id,
        chat_message: { ...pending, id: 'server-1' },
      },
      version: '0.1',
      priority: 5,
    }));
    expect(screen.getByText(/Sent to chat!/)).toBeTruthy();
  });

  it('keeps the roll visible and offers an idempotent retry when disconnected', () => {
    protocol = mockProtocol;
    mockProtocol.isConnected.mockReturnValue(false);
    render(<DiceRoller />);
    fireEvent.click(screen.getByRole('button', { name: /roll/i }));
    const failed = useChatStore.getState().messages[0];

    expect(screen.getByText(/Result:/)).toBeTruthy();
    expect(screen.getByText(/Not sent to chat/)).toBeTruthy();
    expect(screen.queryByText(/Sent to chat!/)).toBeNull();

    mockProtocol.isConnected.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    const chatCall = mockProtocol.sendMessage.mock.calls.find(([message]) => message.type === MessageType.CHAT);
    expect(chatCall?.[0].data.message.client_operation_id).toBe(failed.client_operation_id);
    expect(chatCall?.[0].data.message.text).toBe(failed.text);
  });
});
