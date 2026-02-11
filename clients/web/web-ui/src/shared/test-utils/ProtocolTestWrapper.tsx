import type { WebClientProtocol } from '@lib/websocket/clientProtocol';
import React, { createContext, useContext } from 'react';
import { vi } from 'vitest';

interface MockProtocolContextValue {
  protocol: Partial<WebClientProtocol> | null;
  socket?: WebSocket | null;
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'error';
  isConnected?: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const MockProtocolContext = createContext<MockProtocolContextValue | undefined>(undefined);

export function useMockProtocol() {
  const ctx = useContext(MockProtocolContext);
  if (!ctx) throw new Error('useMockProtocol must be used within a MockProtocolProvider');
  return ctx;
}

interface MockProtocolProviderProps {
  children: React.ReactNode;
  mockProtocol?: Partial<WebClientProtocol>;
}

export function MockProtocolProvider({ children, mockProtocol }: MockProtocolProviderProps) {
  const value: MockProtocolContextValue = {
    protocol: mockProtocol || {
      sendMessage: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      addCompendiumSprite: vi.fn(),
      removeSprite: vi.fn(),
    },
    connectionState: 'connected',
    isConnected: true,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
  };

  return (
    <MockProtocolContext.Provider value={value}>
      {children}
    </MockProtocolContext.Provider>
  );
}

// Mock the useProtocol hook for testing
export function mockUseProtocol() {
  return useMockProtocol();
}