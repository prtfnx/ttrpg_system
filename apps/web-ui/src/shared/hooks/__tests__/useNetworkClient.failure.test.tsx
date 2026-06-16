import { waitFor } from '@testing-library/react';
import { createMockWasmRuntime, renderWithWasmRuntime } from '@test/utils/wasmRuntimeTestUtils';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useNetworkClient } from '@shared/hooks/useNetworkClient';

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
  vi.resetModules();
  vi.clearAllMocks();
});

describe('useNetworkClient failure path', () => {
  it('surfaces deterministic error when set_message_handler is missing and calls callbacks asynchronously', async () => {
    const onError = vi.fn();
    const onConnectionChange = vi.fn();

    const { getByTestId } = renderWithWasmRuntime(
      <HookConsumer onError={onError} onConnectionChange={onConnectionChange} />,
      createMockWasmRuntime({ getNetworkClient: vi.fn(() => ({} as never)) }),
    );

    await waitFor(() => expect(getByTestId('state').textContent).toBe('error'));
    await waitFor(() => expect(getByTestId('lastError').textContent).toContain('Connection failed:'));

    await waitFor(() => {
      expect(onError).toHaveBeenCalled();
      expect(onConnectionChange).toHaveBeenCalledWith('error', expect.stringContaining('Connection failed:'));
    });
  });
});
