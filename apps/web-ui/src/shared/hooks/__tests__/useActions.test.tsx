import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import React from 'react';
import { useActions, type ActionsCallbacks } from '@shared/hooks/useActions';
import type { RenderEngine } from '@lib/wasm/wasm';

function createMockRenderEngine(overrides: Partial<Record<string, unknown>> = {}): RenderEngine {
  return {
    set_action_handler: vi.fn(),
    set_state_change_handler: vi.fn(),
    set_actions_error_handler: vi.fn(),
    can_undo: vi.fn(() => false),
    can_redo: vi.fn(() => false),
    create_table_action: vi.fn(() => ({
      success: true,
      message: 'created',
      data: { table_id: 't1', name: 'Map', width: 1920, height: 1080, scale_x: 1, scale_y: 1, offset_x: 0, offset_y: 0 },
    })),
    delete_table_action: vi.fn(() => ({ success: true, message: 'deleted' })),
    update_table_action: vi.fn(() => ({
      success: true,
      message: 'updated',
      data: { table_id: 't1', name: 'Renamed', width: 1920, height: 1080, scale_x: 1, scale_y: 1, offset_x: 0, offset_y: 0 },
    })),
    create_sprite_action: vi.fn(() => ({
      success: true,
      message: 'created',
      data: { sprite_id: 's1', layer: 'tokens', position: { x: 0, y: 0 }, size: { width: 64, height: 64 }, rotation: 0, texture_name: 'goblin', visible: true },
    })),
    delete_sprite_action: vi.fn(() => ({ success: true, message: 'deleted' })),
    update_sprite_action: vi.fn(() => ({
      success: true,
      message: 'updated',
      data: { sprite_id: 's1', layer: 'tokens', position: { x: 100, y: 100 }, size: { width: 64, height: 64 }, rotation: 0, texture_name: 'goblin', visible: true },
    })),
    set_layer_visibility_action: vi.fn(() => ({ success: true, message: 'ok' })),
    move_sprite_to_layer_action: vi.fn(() => ({ success: true, message: 'moved' })),
    batch_actions: vi.fn(() => ({ success: true, message: 'batch ok' })),
    undo_action: vi.fn(() => ({ success: true, message: 'undone' })),
    redo_action: vi.fn(() => ({ success: true, message: 'redone' })),
    get_all_tables: vi.fn(() => '[]'),
    get_all_sprites: vi.fn(() => '[]'),
    ...overrides,
  } as unknown as RenderEngine;
}

// Helper component that exposes the hook
const HookConsumer: React.FC<{
  renderEngine: RenderEngine | null;
  callbacks?: ActionsCallbacks;
  onHook?: (hook: ReturnType<typeof useActions>) => void;
}> = ({ renderEngine, callbacks, onHook }) => {
  const hook = useActions(renderEngine, callbacks);
  React.useEffect(() => {
    onHook?.(hook);
  });

  return (
    <div>
      <span data-testid="isLoading">{String(hook.isLoading)}</span>
      <span data-testid="error">{hook.error || ''}</span>
      <span data-testid="canUndo">{String(hook.canUndo)}</span>
      <span data-testid="canRedo">{String(hook.canRedo)}</span>
      <span data-testid="tableCount">{hook.tables.size}</span>
    </div>
  );
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('useActions', () => {
  it('returns initial state with null render engine', () => {
    let hookRef: ReturnType<typeof useActions> | null = null;
    render(<HookConsumer renderEngine={null} onHook={(h) => { hookRef = h; }} />);

    expect(hookRef).not.toBeNull();
    expect(hookRef!.tables.size).toBe(0);
    expect(hookRef!.isLoading).toBe(false);
    expect(hookRef!.error).toBeNull();
    expect(hookRef!.layerVisibility.get('tokens')).toBe(true);
  });

  it('sets up handlers when renderEngine is provided', () => {
    const engine = createMockRenderEngine();
    render(<HookConsumer renderEngine={engine} />);

    expect(engine.set_action_handler).toHaveBeenCalledOnce();
    expect(engine.set_state_change_handler).toHaveBeenCalledOnce();
    expect(engine.set_actions_error_handler).toHaveBeenCalledOnce();
  });

  it('createTable updates state on success', async () => {
    const engine = createMockRenderEngine();
    let hookRef: ReturnType<typeof useActions> | null = null;

    const { getByTestId } = render(
      <HookConsumer renderEngine={engine} onHook={(h) => { hookRef = h; }} />
    );

    await act(async () => {
      const result = await hookRef!.createTable('Map', 1920, 1080);
      expect(result.success).toBe(true);
    });

    await waitFor(() => expect(getByTestId('tableCount').textContent).toBe('1'));
  });

  it('deleteTable removes table from state', async () => {
    const engine = createMockRenderEngine();
    let hookRef: ReturnType<typeof useActions> | null = null;

    render(<HookConsumer renderEngine={engine} onHook={(h) => { hookRef = h; }} />);

    await act(async () => {
      await hookRef!.createTable('Map', 1920, 1080);
    });
    await act(async () => {
      const result = await hookRef!.deleteTable('t1');
      expect(result.success).toBe(true);
    });
  });

  it('throws when calling actions without renderEngine', async () => {
    let hookRef: ReturnType<typeof useActions> | null = null;
    render(<HookConsumer renderEngine={null} onHook={(h) => { hookRef = h; }} />);

    await expect(hookRef!.createTable('Map', 100, 100)).rejects.toThrow('RenderEngine not initialized');
  });

  it('calls onError callback when error handler fires', async () => {
    const engine = createMockRenderEngine();
    const onError = vi.fn();

    render(<HookConsumer renderEngine={engine} callbacks={{ onError }} />);

    // Get the error handler that was registered
    const errorHandler = (engine.set_actions_error_handler as ReturnType<typeof vi.fn>).mock.calls[0][0];
    act(() => errorHandler('Something went wrong'));

    expect(onError).toHaveBeenCalledWith('Something went wrong');
  });

  it('calls onAction callback when action handler fires', () => {
    const engine = createMockRenderEngine();
    const onAction = vi.fn();

    render(<HookConsumer renderEngine={engine} callbacks={{ onAction }} />);

    const actionHandler = (engine.set_action_handler as ReturnType<typeof vi.fn>).mock.calls[0][0];
    act(() => actionHandler('sprite_moved', { id: 's1' }));

    expect(onAction).toHaveBeenCalledWith('sprite_moved', { id: 's1' });
  });

  it('sets error state when createTable fails', async () => {
    const engine = createMockRenderEngine({
      create_table_action: vi.fn(() => ({ success: false, message: 'Duplicate name' })),
    });
    let hookRef: ReturnType<typeof useActions> | null = null;

    const { getByTestId } = render(
      <HookConsumer renderEngine={engine} onHook={(h) => { hookRef = h; }} />
    );

    await act(async () => {
      const result = await hookRef!.createTable('Map', 1920, 1080);
      expect(result.success).toBe(false);
    });

    await waitFor(() => expect(getByTestId('error').textContent).toBe('Duplicate name'));
  });
});
