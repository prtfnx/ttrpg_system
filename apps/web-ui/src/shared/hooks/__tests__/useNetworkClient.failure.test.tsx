import { afterEach, describe, expect, it, vi } from 'vitest';
// WASM is auto-mocked via vitest.config.ts
// wasmManager mock for specific test behavior
vi.mock('../utils/wasmManager', () => ({
  wasmManager: {
    // getNetworkClient resolves to an object WITHOUT set_message_handler
    getNetworkClient: () => Promise.resolve({}),
  }
}));

import { useNetworkClient } from '@shared/hooks/useNetworkClient';
import { render, waitFor } from '@testing-library/react';
import React from 'react';

// Small helper component to expose the hook's state for assertions
const HookConsumer: React.FC<{
  onError?: (err: string) => void;
  onConnectionChange?: (state: string, err?: string) => void;
}> = ({ onError, onConnectionChange }) => {
  const { networkState } = useNetworkClient({ onError, onConnectionChange });

  return (
    <div>
      <span data-testid="state">{networkState.connectionState}</span>
      <span data-testid="lastError">{networkState.lastError || ''}</span>
      <span data-testid="clientId">{networkState.clientId}</span>
    </div>
  );
};

afterEach(() => {
  // Reset modules so other tests can re-mock wasmManager as needed
  vi.resetModules();
  vi.clearAllMocks();
});

describe('useNetworkClient failure path', () => {
  it('surfaces deterministic error when set_message_handler is missing and calls callbacks asynchronously', async () => {
    const onError = vi.fn();
    const onConnectionChange = vi.fn();

    const { getByTestId } = render(
      <HookConsumer onError={onError} onConnectionChange={onConnectionChange} />
    );

    // The hook will set error state asynchronously; wait for it
    await waitFor(() => expect(getByTestId('state').textContent).toBe('error'));

    // lastError should contain the deterministic 'Connection failed:' message
    await waitFor(() => expect(getByTestId('lastError').textContent).toContain('Connection failed:'));

    // onError and onConnectionChange should have been called
    await waitFor(() => {
      expect(onError).toHaveBeenCalled();
      expect(onConnectionChange).toHaveBeenCalledWith('error', expect.stringContaining('Connection failed:'));
    });
  });
});
