import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock CSS module
vi.mock('../ActionQueuePanel.module.css', () => ({
  default: {
    actionQueuePanel: 'actionQueuePanel',
    panelHeaderCompact: 'panelHeaderCompact',
    panelTitle: 'panelTitle',
    errorMessage: 'errorMessage',
    actionForm: 'actionForm',
    actionInput: 'actionInput',
    queueBtn: 'queueBtn',
    actionsList: 'actionsList',
    actionItem: 'actionItem',
    actionHeader: 'actionHeader',
    actionType: 'actionType',
    actionStatus: 'actionStatus',
    actionPayload: 'actionPayload',
  },
}));

const mockProtocol = { sendMessage: vi.fn(), isConnected: vi.fn(() => true) };

vi.mock('@features/auth', () => ({
  useAuthenticatedWebSocket: vi.fn(() => ({ protocol: mockProtocol, connectionState: 'connected', error: null, connect: vi.fn(), disconnect: vi.fn() })),
}));

vi.mock('@lib/websocket', () => ({
  MessageType: { PLAYER_ACTION: 'player_action' },
  createMessage: vi.fn((type, data) => ({ type, data })),
}));

import { ActionQueuePanel } from '../ActionQueuePanel';

const userInfo = { username: 'testUser', role: 'player' as const, userId: 'u1', token: 'tok' };

describe('ActionQueuePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders heading', () => {
    render(<ActionQueuePanel sessionCode="ABC123" userInfo={userInfo} />);
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('renders action type input', () => {
    render(<ActionQueuePanel sessionCode="ABC123" userInfo={userInfo} />);
    expect(screen.getByPlaceholderText(/Action/i)).toBeInTheDocument();
  });

  it('renders payload input', () => {
    render(<ActionQueuePanel sessionCode="ABC123" userInfo={userInfo} />);
    expect(screen.getByPlaceholderText(/target/)).toBeInTheDocument();
  });

  it('renders Add button', () => {
    render(<ActionQueuePanel sessionCode="ABC123" userInfo={userInfo} />);
    expect(screen.getByText('Add')).toBeInTheDocument();
  });

  it('shows error when Add clicked with empty inputs', () => {
    render(<ActionQueuePanel sessionCode="ABC123" userInfo={userInfo} />);
    fireEvent.click(screen.getByText('Add'));
    expect(screen.getByText(/required/i)).toBeInTheDocument();
  });

  it('shows error when payload is invalid JSON', () => {
    render(<ActionQueuePanel sessionCode="ABC123" userInfo={userInfo} />);
    fireEvent.change(screen.getByPlaceholderText(/Action/i), { target: { value: 'move' } });
    fireEvent.change(screen.getByPlaceholderText(/target/), { target: { value: 'not json' } });
    fireEvent.click(screen.getByText('Add'));
    expect(screen.getByText(/JSON/i)).toBeInTheDocument();
  });

  it('adds action to queue when valid input provided', () => {
    render(<ActionQueuePanel sessionCode="ABC123" userInfo={userInfo} />);
    fireEvent.change(screen.getByPlaceholderText(/Action/i), { target: { value: 'move' } });
    fireEvent.change(screen.getByPlaceholderText(/target/), { target: { value: '{"x":1}' } });
    fireEvent.click(screen.getByText('Add'));
    expect(screen.getByText('move')).toBeInTheDocument();
    expect(screen.queryByText(/required/i)).not.toBeInTheDocument();
  });

  it('updates queue status on action-confirmed event', () => {
    render(<ActionQueuePanel sessionCode="ABC123" userInfo={userInfo} />);
    // Add an action first
    fireEvent.change(screen.getByPlaceholderText(/Action/i), { target: { value: 'attack' } });
    fireEvent.change(screen.getByPlaceholderText(/target/), { target: { value: '{}' } });
    fireEvent.click(screen.getByText('Add'));
    // Confirm it via event (won't error)
    window.dispatchEvent(new CustomEvent('action-confirmed', { detail: { id: 'fake-id', status: 'confirmed' } }));
    expect(screen.getByText('attack')).toBeInTheDocument();
  });
});
