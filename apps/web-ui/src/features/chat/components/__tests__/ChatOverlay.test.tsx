import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatOverlay } from '../ChatOverlay';
import type { ChatMessage } from '../../chatStore';

// ── mocks ────────────────────────────────────────────────────────────────────
const mockSendMessage = vi.fn();

vi.mock('@app/providers', () => ({
  useAuth: vi.fn(() => ({ user: { username: 'TestUser' } })),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../../auth', () => ({
  useAuth: vi.fn(() => ({ user: { username: 'TestUser' } })),
}));

vi.mock('../../chatStore', () => ({
  useChatStore: vi.fn(() => ({ messages: [] })),
}));

vi.mock('../../hooks/useChatWebSocket', () => ({
  useChatWebSocket: vi.fn(() => ({ sendMessage: mockSendMessage })),
}));

vi.mock('@shared/config/appConfig', () => ({
  config: { getWebSocketUrl: vi.fn(() => 'ws://localhost:8000/ws') },
}));

import { useChatStore } from '../../chatStore';

const baseMsg: ChatMessage = { id: '1', user: 'Alice', text: 'Hello world', timestamp: Date.now() };

function setMessages(msgs: ChatMessage[]) {
  vi.mocked(useChatStore).mockReturnValue({ messages: msgs } as ReturnType<typeof useChatStore>);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.removeItem('chat-overlay-settings');
  setMessages([]);
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('ChatOverlay — render', () => {
  it('renders header when visible', () => {
    render(<ChatOverlay />);
    expect(screen.getByText('💬 Chat')).toBeInTheDocument();
  });

  it('renders settings and hide buttons', () => {
    render(<ChatOverlay />);
    expect(screen.getByTitle('Settings')).toBeInTheDocument();
    expect(screen.getByTitle('Hide chat')).toBeInTheDocument();
  });

  it('hides chat and shows 💬 button when hide is clicked', () => {
    render(<ChatOverlay />);
    fireEvent.click(screen.getByTitle('Hide chat'));
    expect(screen.queryByText('💬 Chat')).not.toBeInTheDocument();
    expect(screen.getByTitle('Show chat')).toBeInTheDocument();
  });

  it('shows chat again when 💬 button is clicked', () => {
    render(<ChatOverlay />);
    fireEvent.click(screen.getByTitle('Hide chat'));
    fireEvent.click(screen.getByTitle('Show chat'));
    expect(screen.getByText('💬 Chat')).toBeInTheDocument();
  });
});

describe('ChatOverlay — messages', () => {
  it('renders messages', () => {
    setMessages([baseMsg]);
    render(<ChatOverlay />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('shows No recent messages when focused and messages empty', async () => {
    render(<ChatOverlay />);
    const overlay = screen.getByText('💬 Chat').closest('div')!.parentElement!;
    fireEvent.mouseEnter(overlay);
    expect(screen.getByText('No recent messages')).toBeInTheDocument();
  });

  it('shows input when focused', () => {
    render(<ChatOverlay />);
    const overlay = screen.getByText('💬 Chat').closest('div')!.parentElement!;
    fireEvent.mouseEnter(overlay);
    expect(screen.getByPlaceholderText('Say something…')).toBeInTheDocument();
  });
});

describe('ChatOverlay — settings panel', () => {
  it('toggles settings panel', () => {
    render(<ChatOverlay />);
    expect(screen.queryByText(/Messages:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Settings'));
    expect(screen.getByText(/Messages:/)).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Settings'));
    expect(screen.queryByText(/Messages:/)).not.toBeInTheDocument();
  });

  it('settings panel closes on mouse leave', () => {
    render(<ChatOverlay />);
    fireEvent.click(screen.getByTitle('Settings'));
    expect(screen.getByText(/Messages:/)).toBeInTheDocument();
    const overlay = screen.getByText('💬 Chat').closest('div')!.parentElement!;
    fireEvent.mouseLeave(overlay);
    expect(screen.queryByText(/Messages:/)).not.toBeInTheDocument();
  });
});

describe('ChatOverlay — send message', () => {
  it('calls sendMessage on form submit and clears input', async () => {
    render(<ChatOverlay />);
    const overlay = screen.getByText('💬 Chat').closest('div')!.parentElement!;
    fireEvent.mouseEnter(overlay);
    const input = screen.getByPlaceholderText('Say something…');
    fireEvent.change(input, { target: { value: 'Hi there' } });
    fireEvent.submit(input.closest('form')!);
    expect(mockSendMessage).toHaveBeenCalledWith('Hi there');
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('does not send empty messages', () => {
    render(<ChatOverlay />);
    const overlay = screen.getByText('💬 Chat').closest('div')!.parentElement!;
    fireEvent.mouseEnter(overlay);
    fireEvent.submit(screen.getByPlaceholderText('Say something…').closest('form')!);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});
