let _current: any = {
  protocol: null,
  socket: null,
  connectionState: 'disconnected',
  isConnected: false,
  connect: async () => {},
  disconnect: () => {}
};

export function setMockProtocol(value: Partial<typeof _current>) {
  _current = { ..._current, ...value };
}

export function resetMockProtocol() {
  _current = {
    protocol: null,
    socket: null,
    connectionState: 'disconnected',
    isConnected: false,
    connect: async () => {},
    disconnect: () => {}
  };
}

export function defaultUseProtocol() {
  return _current;
}

export const ProtocolProviderMock = ({ children }: any) => children;

// expose for debugging/tests via global if needed
(globalThis as any).__mockProtocol = {
  set: setMockProtocol,
  reset: resetMockProtocol,
  current: () => _current
};

export default {
  setMockProtocol,
  resetMockProtocol,
  defaultUseProtocol,
  ProtocolProviderMock
};
