import { waitFor } from '@testing-library/react';
import { createMockWasmRuntime, renderWithWasmRuntime } from '@test/utils/wasmRuntimeTestUtils';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useNetworkClient } from '@shared/hooks/useNetworkClient';
import { logger } from '@shared/utils/logger';

vi.mock('@shared/utils/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

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
  it('surfaces runtime client unavailability and calls callbacks asynchronously', async () => {
    const onError = vi.fn();
    const onConnectionChange = vi.fn();

    const { getByTestId } = renderWithWasmRuntime(
      <HookConsumer onError={onError} onConnectionChange={onConnectionChange} />,
      createMockWasmRuntime({ getNetworkClient: vi.fn(() => null) }),
    );

    await waitFor(() => expect(getByTestId('state').textContent).toBe('error'));
    await waitFor(() => expect(getByTestId('lastError').textContent).toContain('NetworkClient unavailable'));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(expect.stringContaining('NetworkClient unavailable'));
      expect(onConnectionChange).toHaveBeenCalledWith('error', expect.stringContaining('NetworkClient unavailable'));
    });
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to load WASM network client',
      expect.objectContaining({ message: 'NetworkClient unavailable from WASM runtime' }),
    );
  });
});
