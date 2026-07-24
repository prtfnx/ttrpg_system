import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '@/store';
import { useChatStore } from '../../chatStore';
import { ChatPanel } from '../ChatPanel';

// Mock heavy hooks
vi.mock('../../hooks/useChatWebSocket', () => ({
  useChatWebSocket: () => ({
    sendMessage: mockSendMessage,
    retryMessage: mockRetryMessage,
    moderateMessage: mockModerateMessage,
    loadOlderMessages: mockLoadOlderMessages,
  }),
}));
vi.mock('../../../auth', () => ({
  useAuth: () => ({ user: { id: 1, username: 'Tester' } }),
}));
vi.mock('@shared/config/appConfig', () => ({
  config: { getWebSocketUrl: () => 'ws://localhost' },
}));

const mockSendMessage = vi.fn();
const mockLoadOlderMessages = vi.fn();
const mockRetryMessage = vi.fn();
const mockModerateMessage = vi.fn();

beforeEach(() => {
  useChatStore.setState({ messages: [] });
  useGameStore.setState({ sessionRole: 'player' });
  mockSendMessage.mockReset();
  mockLoadOlderMessages.mockReset();
  mockRetryMessage.mockReset();
  mockModerateMessage.mockReset();
});

describe('ChatPanel', () => {
  it('renders input and send button', () => {
    render(<ChatPanel />);
    expect(screen.getByPlaceholderText('Type a message...')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Load older messages' })).toBeTruthy();
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

  it('rejects unsupported slash commands instead of sending public text', async () => {
    render(<ChatPanel />);
    await userEvent.type(screen.getByPlaceholderText('Type a message...'), '/badcmd{Enter}');
    expect(screen.getByText(/Slash commands are not supported/)).toBeTruthy();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('does not advertise roll text as a server command', async () => {
    render(<ChatPanel />);
    await userEvent.type(screen.getByPlaceholderText('Type a message...'), '/roll 1d6{Enter}');
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('renders existing messages', () => {
    useChatStore.setState({
      messages: [{ id: '1', user: 'Alice', text: 'Hello', timestamp: Date.now() }],
    });
    render(<ChatPanel />);
    expect(screen.getByText('Alice:')).toBeTruthy();
    expect(screen.getByText('Hello')).toBeTruthy();
  });

  it('loads an older bounded page on history button click', async () => {
    render(<ChatPanel />);
    await userEvent.click(screen.getByRole('button', { name: 'Load older messages' }));
    expect(mockLoadOlderMessages).toHaveBeenCalledOnce();
  });

  it('offers retry for failed messages', async () => {
    useChatStore.setState({
      messages: [{
        id: 'operation-1',
        client_operation_id: 'operation-1',
        user: 'Tester',
        text: 'Hello',
        timestamp: Date.now(),
        deliveryStatus: 'failed',
      }],
    });
    render(<ChatPanel />);

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mockRetryMessage).toHaveBeenCalledWith('operation-1');
  });

  it('lets a user redact their own persisted message', async () => {
    useChatStore.setState({
      messages: [{
        id: 'server-1',
        user: 'Tester',
        user_id: 1,
        text: 'Correction needed',
        timestamp: Date.now(),
        deliveryStatus: 'sent',
      }],
    });
    render(<ChatPanel />);

    await userEvent.click(screen.getByRole('button', {
      name: 'Redact message from Tester',
    }));

    expect(mockModerateMessage).toHaveBeenCalledWith(
      'server-1',
      'redact',
      undefined,
    );
  });
});
