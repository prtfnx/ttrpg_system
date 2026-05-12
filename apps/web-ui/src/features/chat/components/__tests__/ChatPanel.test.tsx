import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatPanel } from '../ChatPanel';
import { useChatStore } from '../../chatStore';

// Mock heavy hooks
vi.mock('../../hooks/useChatWebSocket', () => ({
  useChatWebSocket: () => ({ sendMessage: mockSendMessage }),
}));
vi.mock('../../../auth', () => ({
  useAuth: () => ({ user: { username: 'Tester' } }),
}));
vi.mock('@shared/config/appConfig', () => ({
  config: { getWebSocketUrl: () => 'ws://localhost' },
}));

const mockSendMessage = vi.fn();

beforeEach(() => {
  useChatStore.setState({ messages: [] });
  mockSendMessage.mockReset();
});

describe('ChatPanel', () => {
  it('renders input and send button', () => {
    render(<ChatPanel />);
    expect(screen.getByPlaceholderText('Type a message...')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
  });

  it('sends message on button click', async () => {
    render(<ChatPanel />);
    await userEvent.type(screen.getByPlaceholderText('Type a message...'), 'Hello');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(mockSendMessage).toHaveBeenCalledWith('Hello');
  });

  it('sends message on Enter key', async () => {
    render(<ChatPanel />);
    const input = screen.getByPlaceholderText('Type a message...');
    await userEvent.type(input, 'Hi{Enter}');
    expect(mockSendMessage).toHaveBeenCalledWith('Hi');
  });

  it('clears input after sending', async () => {
    render(<ChatPanel />);
    const input = screen.getByPlaceholderText('Type a message...') as HTMLInputElement;
    await userEvent.type(input, 'test{Enter}');
    expect(input.value).toBe('');
  });

  it('does not send empty message', async () => {
    render(<ChatPanel />);
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('shows unknown command error', async () => {
    render(<ChatPanel />);
    await userEvent.type(screen.getByPlaceholderText('Type a message...'), '/badcmd{Enter}');
    expect(screen.getByText(/Unknown command/)).toBeTruthy();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('sends valid command /roll', async () => {
    render(<ChatPanel />);
    await userEvent.type(screen.getByPlaceholderText('Type a message...'), '/roll 1d6{Enter}');
    expect(mockSendMessage).toHaveBeenCalledWith('/roll 1d6');
  });

  it('renders existing messages', () => {
    useChatStore.setState({
      messages: [{ id: '1', user: 'Alice', text: 'Hello', timestamp: Date.now() }],
    });
    render(<ChatPanel />);
    expect(screen.getByText('Alice:')).toBeTruthy();
    expect(screen.getByText('Hello')).toBeTruthy();
  });
});
