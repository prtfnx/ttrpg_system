import {
  useActions,
  type ActionResult,
  type ActionsCallbacks,
  type ActionsEngine,
  type SpriteInfo,
  type TableInfo,
} from '@shared/hooks/useActions';
import { act, render, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

type MockActionsEngine = ActionsEngine & {
  set_action_handler: ReturnType<typeof vi.fn>;
  set_state_change_handler: ReturnType<typeof vi.fn>;
  set_error_handler: ReturnType<typeof vi.fn>;
  can_undo: ReturnType<typeof vi.fn>;
  can_redo: ReturnType<typeof vi.fn>;
  create_table: ReturnType<typeof vi.fn>;
  delete_table: ReturnType<typeof vi.fn>;
  update_table: ReturnType<typeof vi.fn>;
  create_sprite: ReturnType<typeof vi.fn>;
  delete_sprite: ReturnType<typeof vi.fn>;
  update_sprite: ReturnType<typeof vi.fn>;
  set_layer_visibility: ReturnType<typeof vi.fn>;
  move_sprite_to_layer: ReturnType<typeof vi.fn>;
  batch_actions: ReturnType<typeof vi.fn>;
  undo: ReturnType<typeof vi.fn>;
  redo: ReturnType<typeof vi.fn>;
  get_all_tables: ReturnType<typeof vi.fn>;
  get_action_history: ReturnType<typeof vi.fn>;
};

const tableT1 = (overrides: Partial<TableInfo> = {}): TableInfo => ({
  table_id: 't1',
  name: 'Map',
  width: 1920,
  height: 1080,
  scale_x: 1,
  scale_y: 1,
  offset_x: 0,
  offset_y: 0,
  ...overrides,
});

const spriteS1 = (overrides: Partial<SpriteInfo> = {}): SpriteInfo => ({
  sprite_id: 's1',
  layer: 'tokens',
  position: { x: 0, y: 0 },
  size: { width: 64, height: 64 },
  rotation: 0,
  texture_name: 'goblin',
  visible: true,
  ...overrides,
});

function createMockActionsEngine(
  overrides: Partial<Record<keyof ActionsEngine, unknown>> = {},
): MockActionsEngine {
  const engine = {
    set_action_handler: vi.fn(),
    set_state_change_handler: vi.fn(),
    set_error_handler: vi.fn(),

    can_undo: vi.fn(() => false),
    can_redo: vi.fn(() => false),

    create_table: vi.fn((_name: string, _width: number, _height: number): ActionResult => ({
      success: true,
      message: 'created',
      data: tableT1(),
    })),

    delete_table: vi.fn((_tableId: string): ActionResult => ({
      success: true,
      message: 'deleted',
    })),

    // Intentionally no data: tests optimistic merge inside useActions.
    update_table: vi.fn((_tableId: string, _updates: Partial<TableInfo>): ActionResult => ({
      success: true,
      message: 'updated',
    })),

    create_sprite: vi.fn(
      (
        _tableId: string,
        _layer: string,
        _position: { x: number; y: number },
        _textureName: string,
      ): ActionResult => ({
        success: true,
        message: 'created',
        data: spriteS1(),
      }),
    ),

    delete_sprite: vi.fn((_spriteId: string): ActionResult => ({
      success: true,
      message: 'deleted',
    })),

    // Intentionally no data: tests optimistic merge inside useActions.
    update_sprite: vi.fn((_spriteId: string, _updates: Partial<SpriteInfo>): ActionResult => ({
      success: true,
      message: 'updated',
    })),

    set_layer_visibility: vi.fn((_layer: string, _visible: boolean): ActionResult => ({
      success: true,
      message: 'ok',
    })),

    move_sprite_to_layer: vi.fn((_spriteId: string, newLayer: string): ActionResult => ({
      success: true,
      message: 'moved',
      data: spriteS1({ layer: newLayer }),
    })),

    batch_actions: vi.fn((_actions: unknown[]): ActionResult => ({
      success: true,
      message: 'batch ok',
    })),

    undo: vi.fn((): ActionResult => ({
      success: true,
      message: 'undone',
    })),

    redo: vi.fn((): ActionResult => ({
      success: true,
      message: 'redone',
    })),

    get_all_tables: vi.fn(() => '[]'),
    get_action_history: vi.fn(() => []),

    ...overrides,
  };

  return engine as MockActionsEngine;
}

const HookConsumer: React.FC<{
  actionsEngine: ActionsEngine | null;
  callbacks?: ActionsCallbacks;
  onHook?: (hook: ReturnType<typeof useActions>) => void;
}> = ({ actionsEngine, callbacks, onHook }) => {
  const hook = useActions(actionsEngine, callbacks);

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
      <span data-testid="spriteCount">{hook.sprites.size}</span>
    </div>
  );
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('useActions', () => {
  it('returns initial state with null actionsEngine', () => {
    let hookRef: ReturnType<typeof useActions> | null = null;

    render(
      <HookConsumer
        actionsEngine={null}
        onHook={(hook) => {
          hookRef = hook;
        }}
      />,
    );

    expect(hookRef).not.toBeNull();
    expect(hookRef!.tables.size).toBe(0);
    expect(hookRef!.sprites.size).toBe(0);
    expect(hookRef!.isLoading).toBe(false);
    expect(hookRef!.error).toBeNull();
    expect(hookRef!.layerVisibility.get('tokens')).toBe(true);
  });

  it('registers ActionsEngine handlers', () => {
    const engine = createMockActionsEngine();

    render(<HookConsumer actionsEngine={engine} />);

    expect(engine.set_action_handler).toHaveBeenCalledOnce();
    expect(engine.set_state_change_handler).toHaveBeenCalledOnce();
    expect(engine.set_error_handler).toHaveBeenCalledOnce();
  });

  it('calls onAction when action handler fires', () => {
    const engine = createMockActionsEngine();
    const onAction = vi.fn();

    render(<HookConsumer actionsEngine={engine} callbacks={{ onAction }} />);

    const actionHandler = engine.set_action_handler.mock.calls[0][0];

    act(() => {
      actionHandler('sprite_moved', { id: 's1' });
    });

    expect(onAction).toHaveBeenCalledWith('sprite_moved', { id: 's1' });
  });

  it('calls onStateChange and refreshes canUndo/canRedo when state change handler fires', () => {
    const engine = createMockActionsEngine({
      can_undo: vi.fn(() => true),
      can_redo: vi.fn(() => false),
    });
    const onStateChange = vi.fn();

    const { getByTestId } = render(
      <HookConsumer actionsEngine={engine} callbacks={{ onStateChange }} />,
    );

    const stateChangeHandler = engine.set_state_change_handler.mock.calls[0][0];

    act(() => {
      stateChangeHandler('sprite_added', 's1');
    });

    expect(onStateChange).toHaveBeenCalledWith('sprite_added', 's1');
    expect(getByTestId('canUndo').textContent).toBe('true');
    expect(getByTestId('canRedo').textContent).toBe('false');
  });

  it('calls onError and sets error when error handler fires', async () => {
    const engine = createMockActionsEngine();
    const onError = vi.fn();

    const { getByTestId } = render(
      <HookConsumer actionsEngine={engine} callbacks={{ onError }} />,
    );

    const errorHandler = engine.set_error_handler.mock.calls[0][0];

    act(() => {
      errorHandler('Something went wrong');
    });

    expect(onError).toHaveBeenCalledWith('Something went wrong');
    expect(getByTestId('error').textContent).toBe('Something went wrong');
  });

  it('createTable calls actionsEngine.create_table and stores returned table', async () => {
    const engine = createMockActionsEngine();
    let hookRef: ReturnType<typeof useActions> | null = null;

    const { getByTestId } = render(
      <HookConsumer
        actionsEngine={engine}
        onHook={(hook) => {
          hookRef = hook;
        }}
      />,
    );

    await act(async () => {
      const result = await hookRef!.createTable('Map', 1920, 1080);
      expect(result.success).toBe(true);
    });

    expect(engine.create_table).toHaveBeenCalledWith('Map', 1920, 1080);
    await waitFor(() => expect(getByTestId('tableCount').textContent).toBe('1'));
    expect(hookRef!.tables.get('t1')).toEqual(tableT1());
  });

  it('createTable stores error when actionsEngine.create_table fails', async () => {
    const engine = createMockActionsEngine({
      create_table: vi.fn((): ActionResult => ({
        success: false,
        message: 'Duplicate name',
      })),
    });
    let hookRef: ReturnType<typeof useActions> | null = null;

    const { getByTestId } = render(
      <HookConsumer
        actionsEngine={engine}
        onHook={(hook) => {
          hookRef = hook;
        }}
      />,
    );

    await act(async () => {
      const result = await hookRef!.createTable('Map', 1920, 1080);
      expect(result.success).toBe(false);
    });

    expect(engine.create_table).toHaveBeenCalledWith('Map', 1920, 1080);
    expect(getByTestId('error').textContent).toBe('Duplicate name');
  });

  it('deleteTable calls actionsEngine.delete_table and removes table from state', async () => {
    const engine = createMockActionsEngine();
    let hookRef: ReturnType<typeof useActions> | null = null;

    render(
      <HookConsumer
        actionsEngine={engine}
        onHook={(hook) => {
          hookRef = hook;
        }}
      />,
    );

    await act(async () => {
      await hookRef!.createTable('Map', 1920, 1080);
    });

    expect(hookRef!.tables.has('t1')).toBe(true);

    await act(async () => {
      const result = await hookRef!.deleteTable('t1');
      expect(result.success).toBe(true);
    });

    expect(engine.delete_table).toHaveBeenCalledWith('t1');
    expect(hookRef!.tables.has('t1')).toBe(false);
  });

  it('updateTable calls actionsEngine.update_table and optimistically merges updates when result has no data', async () => {
    const engine = createMockActionsEngine({
      update_table: vi.fn((_tableId: string, _updates: Partial<TableInfo>): ActionResult => ({
        success: true,
        message: 'updated without data',
      })),
    });
    let hookRef: ReturnType<typeof useActions> | null = null;

    render(
      <HookConsumer
        actionsEngine={engine}
        onHook={(hook) => {
          hookRef = hook;
        }}
      />,
    );

    await act(async () => {
      await hookRef!.createTable('Map', 1920, 1080);
    });

    await act(async () => {
      const result = await hookRef!.updateTable('t1', { name: 'Renamed' });
      expect(result.success).toBe(true);
    });

    expect(engine.update_table).toHaveBeenCalledWith('t1', { name: 'Renamed' });
    expect(hookRef!.tables.get('t1')).toMatchObject({
      table_id: 't1',
      name: 'Renamed',
      width: 1920,
      height: 1080,
    });
  });

  it('updateTable uses returned data when actionsEngine.update_table returns data', async () => {
    const returnedTable = tableT1({
      name: 'Server Name',
      width: 3000,
      height: 2000,
    });

    const engine = createMockActionsEngine({
      update_table: vi.fn((): ActionResult => ({
        success: true,
        message: 'updated with data',
        data: returnedTable,
      })),
    });
    let hookRef: ReturnType<typeof useActions> | null = null;

    render(
      <HookConsumer
        actionsEngine={engine}
        onHook={(hook) => {
          hookRef = hook;
        }}
      />,
    );

    await act(async () => {
      await hookRef!.createTable('Map', 1920, 1080);
    });

    await act(async () => {
      const result = await hookRef!.updateTable('t1', { name: 'Ignored Local Name' });
      expect(result.success).toBe(true);
    });

    expect(engine.update_table).toHaveBeenCalledWith('t1', { name: 'Ignored Local Name' });
    expect(hookRef!.tables.get('t1')).toEqual(returnedTable);
  });

  it('createSprite calls actionsEngine.create_sprite and stores returned sprite', async () => {
    const engine = createMockActionsEngine();
    let hookRef: ReturnType<typeof useActions> | null = null;

    const { getByTestId } = render(
      <HookConsumer
        actionsEngine={engine}
        onHook={(hook) => {
          hookRef = hook;
        }}
      />,
    );

    await act(async () => {
      const result = await hookRef!.createSprite('t1', 'tokens', { x: 0, y: 0 }, 'goblin');
      expect(result.success).toBe(true);
    });

    expect(engine.create_sprite).toHaveBeenCalledWith('t1', 'tokens', { x: 0, y: 0 }, 'goblin');
    expect(getByTestId('spriteCount').textContent).toBe('1');
    expect(hookRef!.sprites.get('s1')).toEqual(spriteS1());
  });

  it('createSprite stores error when actionsEngine.create_sprite fails', async () => {
    const engine = createMockActionsEngine({
      create_sprite: vi.fn((): ActionResult => ({
        success: false,
        message: 'Layer not found',
      })),
    });
    let hookRef: ReturnType<typeof useActions> | null = null;

    const { getByTestId } = render(
      <HookConsumer
        actionsEngine={engine}
        onHook={(hook) => {
          hookRef = hook;
        }}
      />,
    );

    await act(async () => {
      const result = await hookRef!.createSprite('t1', 'bad_layer', { x: 0, y: 0 }, 'goblin');
      expect(result.success).toBe(false);
    });

    expect(engine.create_sprite).toHaveBeenCalledWith(
      't1',
      'bad_layer',
      { x: 0, y: 0 },
      'goblin',
    );
    expect(getByTestId('error').textContent).toBe('Layer not found');
  });

  it('deleteSprite calls actionsEngine.delete_sprite and removes sprite from state', async () => {
    const engine = createMockActionsEngine();
    let hookRef: ReturnType<typeof useActions> | null = null;

    render(
      <HookConsumer
        actionsEngine={engine}
        onHook={(hook) => {
          hookRef = hook;
        }}
      />,
    );

    await act(async () => {
      await hookRef!.createSprite('t1', 'tokens', { x: 0, y: 0 }, 'goblin');
    });

    expect(hookRef!.sprites.has('s1')).toBe(true);

    await act(async () => {
      const result = await hookRef!.deleteSprite('s1');
      expect(result.success).toBe(true);
    });

    expect(engine.delete_sprite).toHaveBeenCalledWith('s1');
    expect(hookRef!.sprites.has('s1')).toBe(false);
  });

  it('updateSprite calls actionsEngine.update_sprite and optimistically merges updates when result has no data', async () => {
    const engine = createMockActionsEngine({
      update_sprite: vi.fn((_spriteId: string, _updates: Partial<SpriteInfo>): ActionResult => ({
        success: true,
        message: 'updated without data',
      })),
    });
    let hookRef: ReturnType<typeof useActions> | null = null;

    render(
      <HookConsumer
        actionsEngine={engine}
        onHook={(hook) => {
          hookRef = hook;
        }}
      />,
    );

    await act(async () => {
      await hookRef!.createSprite('t1', 'tokens', { x: 0, y: 0 }, 'goblin');
    });

    await act(async () => {
      const result = await hookRef!.updateSprite('s1', { position: { x: 100, y: 100 } });
      expect(result.success).toBe(true);
    });

    expect(engine.update_sprite).toHaveBeenCalledWith('s1', { position: { x: 100, y: 100 } });
    expect(hookRef!.sprites.get('s1')).toMatchObject({
      sprite_id: 's1',
      layer: 'tokens',
      position: { x: 100, y: 100 },
    });
  });

  it('updateSprite uses returned data when actionsEngine.update_sprite returns data', async () => {
    const returnedSprite = spriteS1({
      layer: 'map',
      position: { x: 500, y: 600 },
      texture_name: 'orc',
    });

    const engine = createMockActionsEngine({
      update_sprite: vi.fn((): ActionResult => ({
        success: true,
        message: 'updated with data',
        data: returnedSprite,
      })),
    });
    let hookRef: ReturnType<typeof useActions> | null = null;

    render(
      <HookConsumer
        actionsEngine={engine}
        onHook={(hook) => {
          hookRef = hook;
        }}
      />,
    );

    await act(async () => {
      await hookRef!.createSprite('t1', 'tokens', { x: 0, y: 0 }, 'goblin');
    });

    await act(async () => {
      const result = await hookRef!.updateSprite('s1', { position: { x: 100, y: 100 } });
      expect(result.success).toBe(true);
    });

    expect(engine.update_sprite).toHaveBeenCalledWith('s1', { position: { x: 100, y: 100 } });
    expect(hookRef!.sprites.get('s1')).toEqual(returnedSprite);
  });

  it('setLayerVisibility calls actionsEngine.set_layer_visibility and updates local layer state', async () => {
    const engine = createMockActionsEngine();
    let hookRef: ReturnType<typeof useActions> | null = null;

    render(
      <HookConsumer
        actionsEngine={engine}
        onHook={(hook) => {
          hookRef = hook;
        }}
      />,
    );

    await act(async () => {
      const result = await hookRef!.setLayerVisibility('tokens', false);
      expect(result.success).toBe(true);
    });

    expect(engine.set_layer_visibility).toHaveBeenCalledWith('tokens', false);
    expect(hookRef!.layerVisibility.get('tokens')).toBe(false);
  });

  it('moveSpriteToLayer calls actionsEngine.move_sprite_to_layer and stores returned sprite', async () => {
    const engine = createMockActionsEngine({
      move_sprite_to_layer: vi.fn((_spriteId: string, newLayer: string): ActionResult => ({
        success: true,
        message: 'moved',
        data: spriteS1({ layer: newLayer }),
      })),
    });
    let hookRef: ReturnType<typeof useActions> | null = null;

    render(
      <HookConsumer
        actionsEngine={engine}
        onHook={(hook) => {
          hookRef = hook;
        }}
      />,
    );

    await act(async () => {
      await hookRef!.createSprite('t1', 'tokens', { x: 0, y: 0 }, 'goblin');
    });

    await act(async () => {
      const result = await hookRef!.moveSpriteToLayer('s1', 'map');
      expect(result.success).toBe(true);
    });

    expect(engine.move_sprite_to_layer).toHaveBeenCalledWith('s1', 'map');
    expect(hookRef!.sprites.get('s1')?.layer).toBe('map');
  });

  it('batchActions calls actionsEngine.batch_actions and refreshes canUndo/canRedo', async () => {
    const engine = createMockActionsEngine({
      can_undo: vi.fn(() => true),
      can_redo: vi.fn(() => false),
    });
    let hookRef: ReturnType<typeof useActions> | null = null;

    const { getByTestId } = render(
      <HookConsumer
        actionsEngine={engine}
        onHook={(hook) => {
          hookRef = hook;
        }}
      />,
    );

    const batch = [{ type: 'create_sprite', params: { layer: 'tokens' } }];

    await act(async () => {
      const result = await hookRef!.batchActions(batch);
      expect(result.success).toBe(true);
    });

    expect(engine.batch_actions).toHaveBeenCalledWith(batch);
    expect(getByTestId('canUndo').textContent).toBe('true');
    expect(getByTestId('canRedo').textContent).toBe('false');
  });

  it('undo calls actionsEngine.undo and refreshes canUndo/canRedo', async () => {
    const engine = createMockActionsEngine({
      can_undo: vi.fn(() => false),
      can_redo: vi.fn(() => true),
    });
    let hookRef: ReturnType<typeof useActions> | null = null;

    const { getByTestId } = render(
      <HookConsumer
        actionsEngine={engine}
        onHook={(hook) => {
          hookRef = hook;
        }}
      />,
    );

    await act(async () => {
      const result = await hookRef!.undo();
      expect(result.success).toBe(true);
    });

    expect(engine.undo).toHaveBeenCalledOnce();
    expect(getByTestId('canUndo').textContent).toBe('false');
    expect(getByTestId('canRedo').textContent).toBe('true');
  });

  it('redo calls actionsEngine.redo and refreshes canUndo/canRedo', async () => {
    const engine = createMockActionsEngine({
      can_undo: vi.fn(() => true),
      can_redo: vi.fn(() => false),
    });
    let hookRef: ReturnType<typeof useActions> | null = null;

    const { getByTestId } = render(
      <HookConsumer
        actionsEngine={engine}
        onHook={(hook) => {
          hookRef = hook;
        }}
      />,
    );

    await act(async () => {
      const result = await hookRef!.redo();
      expect(result.success).toBe(true);
    });

    expect(engine.redo).toHaveBeenCalledOnce();
    expect(getByTestId('canUndo').textContent).toBe('true');
    expect(getByTestId('canRedo').textContent).toBe('false');
  });

  it('refreshState calls get_all_tables/get_action_history and stores action history', async () => {
    const historyEntry = {
      action_type: 'create_sprite',
      timestamp: 1000,
      data: {},
      reversible: true,
    };

    const engine = createMockActionsEngine({
      get_action_history: vi.fn(() => [historyEntry]),
      can_undo: vi.fn(() => true),
      can_redo: vi.fn(() => true),
    });

    let hookRef: ReturnType<typeof useActions> | null = null;

    const { getByTestId } = render(
      <HookConsumer
        actionsEngine={engine}
        onHook={(hook) => {
          hookRef = hook;
        }}
      />,
    );

    await waitFor(() => {
      expect(engine.get_all_tables).toHaveBeenCalled();
      expect(engine.get_action_history).toHaveBeenCalled();
    });

    expect(hookRef!.actionHistory).toEqual([historyEntry]);
    expect(getByTestId('canUndo').textContent).toBe('true');
    expect(getByTestId('canRedo').textContent).toBe('true');
  });

  it('throws for operations that require actionsEngine when actionsEngine is null', async () => {
    let hookRef: ReturnType<typeof useActions> | null = null;

    render(
      <HookConsumer
        actionsEngine={null}
        onHook={(hook) => {
          hookRef = hook;
        }}
      />,
    );

    await expect(hookRef!.createTable('Map', 100, 100)).rejects.toThrow(
      'ActionsEngine not initialized',
    );
    await expect(hookRef!.deleteTable('t1')).rejects.toThrow('ActionsEngine not initialized');
    await expect(hookRef!.updateTable('t1', {})).rejects.toThrow('ActionsEngine not initialized');
    await expect(hookRef!.createSprite('t1', 'tokens', { x: 0, y: 0 }, 'goblin')).rejects.toThrow(
      'ActionsEngine not initialized',
    );
    await expect(hookRef!.deleteSprite('s1')).rejects.toThrow('ActionsEngine not initialized');
    await expect(hookRef!.updateSprite('s1', {})).rejects.toThrow('ActionsEngine not initialized');
    await expect(hookRef!.setLayerVisibility('tokens', false)).rejects.toThrow(
      'ActionsEngine not initialized',
    );
    await expect(hookRef!.moveSpriteToLayer('s1', 'map')).rejects.toThrow(
      'ActionsEngine not initialized',
    );
    await expect(hookRef!.batchActions([])).rejects.toThrow('ActionsEngine not initialized');
    await expect(hookRef!.undo()).rejects.toThrow('ActionsEngine not initialized');
    await expect(hookRef!.redo()).rejects.toThrow('ActionsEngine not initialized');
  });

  it('clearError clears stored error', async () => {
    const engine = createMockActionsEngine({
      create_table: vi.fn((): ActionResult => ({
        success: false,
        message: 'Duplicate name',
      })),
    });

    let hookRef: ReturnType<typeof useActions> | null = null;

    const { getByTestId } = render(
      <HookConsumer
        actionsEngine={engine}
        onHook={(hook) => {
          hookRef = hook;
        }}
      />,
    );

    await act(async () => {
      await hookRef!.createTable('Map', 1920, 1080);
    });

    expect(getByTestId('error').textContent).toBe('Duplicate name');

    act(() => {
      hookRef!.clearError();
    });

    expect(getByTestId('error').textContent).toBe('');
  });
});