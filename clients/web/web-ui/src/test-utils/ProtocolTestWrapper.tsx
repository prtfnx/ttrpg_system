import React, { createContext, useContext } from 'react';
import type { WebClientProtocol } from '../protocol/clientProtocol';

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
      sendMessage: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      addCompendiumSprite: jest.fn(),
      removeSprite: jest.fn(),
    },
    connectionState: 'connected',
    isConnected: true,
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
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