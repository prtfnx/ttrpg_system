import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock wasmManager with a functional NetworkClient
const mockClient = {
  set_message_handler: vi.fn(),
  set_connection_handler: vi.fn(),
  set_error_handler: vi.fn(),
  get_client_id: vi.fn(() => 'test-client-123'),
  connect: vi.fn(),
  disconnect: vi.fn(),
  send_message: vi.fn(),
  send_sprite_update: vi.fn(),
  send_sprite_create: vi.fn(),
  send_sprite_remove: vi.fn(),
  send_table_update: vi.fn(),
  send_ping: vi.fn(),
  authenticate: vi.fn(),
  join_session: vi.fn(),
  request_table_list: vi.fn(),
  request_player_list: vi.fn(),
  request_asset_upload: vi.fn(),
  request_asset_download: vi.fn(),
  confirm_asset_upload: vi.fn(),
  set_user_info: vi.fn(),
  free: vi.fn(),
};

vi.mock('@lib/wasm/wasmManager', () => ({
  wasmManager: {
    getWasmModule: () =>
      Promise.resolve({
        NetworkClient: function MockNetworkClient() {
          return mockClient;
        },
      }),
  },
}));

import { useNetworkClient } from '@shared/hooks/useNetworkClient';
import { render, act, waitFor } from '@testing-library/react';
import React from 'react';

const HookConsumer: React.FC<{
  options?: Parameters<typeof useNetworkClient>[0];
  onHook?: (hook: ReturnType<typeof useNetworkClient>) => void;
}> = ({ options, onHook }) => {
  const hook = useNetworkClient(options);
  React.useEffect(() => {
    onHook?.(hook);
  });

  return (
    <div>
      <span data-testid="state">{hook.networkState.connectionState}</span>
      <span data-testid="clientId">{hook.networkState.clientId}</span>
      <span data-testid="connected">{String(hook.networkState.isConnected)}</span>
    </div>
  );
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('useNetworkClient happy path', () => {
  it('initializes client and sets client ID', async () => {
    const { getByTestId } = render(<HookConsumer />);

    await waitFor(() => expect(getByTestId('clientId').textContent).toBe('test-client-123'));
    expect(mockClient.set_message_handler).toHaveBeenCalledOnce();
    expect(mockClient.set_connection_handler).toHaveBeenCalledOnce();
    expect(mockClient.set_error_handler).toHaveBeenCalledOnce();
  });

  it('auto-connects when autoConnect and serverUrl are provided', async () => {
    render(
      <HookConsumer options={{ autoConnect: true, serverUrl: 'ws://localhost:8000/ws' }} />
    );

    await waitFor(() => expect(mockClient.connect).toHaveBeenCalledWith('ws://localhost:8000/ws'));
  });

  it('does not auto-connect without serverUrl', async () => {
    render(<HookConsumer options={{ autoConnect: true }} />);

    await waitFor(() => expect(mockClient.set_message_handler).toHaveBeenCalled());
    expect(mockClient.connect).not.toHaveBeenCalled();
  });

  it('calls onMessage callback when message handler fires', async () => {
    const onMessage = vi.fn();
    render(<HookConsumer options={{ onMessage }} />);

    await waitFor(() => expect(mockClient.set_message_handler).toHaveBeenCalled());

    const handler = mockClient.set_message_handler.mock.calls[0][0];
    act(() => handler('chat', { text: 'hello' }));

    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'chat', data: { text: 'hello' } })
    );
  });

  it('updates networkState when connection handler fires', async () => {
    const onConnectionChange = vi.fn();
    const { getByTestId } = render(
      <HookConsumer options={{ onConnectionChange }} />
    );

    await waitFor(() => expect(mockClient.set_connection_handler).toHaveBeenCalled());

    const handler = mockClient.set_connection_handler.mock.calls[0][0];
    act(() => handler('connected'));

    await waitFor(() => {
      expect(getByTestId('state').textContent).toBe('connected');
      expect(getByTestId('connected').textContent).toBe('true');
    });
    expect(onConnectionChange).toHaveBeenCalledWith('connected', undefined);
  });

  it('updates lastError when error handler fires', async () => {
    const onError = vi.fn();
    render(<HookConsumer options={{ onError }} />);

    await waitFor(() => expect(mockClient.set_error_handler).toHaveBeenCalled());

    const handler = mockClient.set_error_handler.mock.calls[0][0];
    act(() => handler('timeout'));

    expect(onError).toHaveBeenCalledWith('timeout');
  });

  it('exposes connect and disconnect methods', async () => {
    let hookRef: ReturnType<typeof useNetworkClient> | null = null;
    render(<HookConsumer onHook={(h) => { hookRef = h; }} />);

    await waitFor(() => expect(hookRef).not.toBeNull());

    act(() => hookRef!.connect('ws://test'));
    act(() => hookRef!.disconnect());
    // Methods should not throw
  });
});
