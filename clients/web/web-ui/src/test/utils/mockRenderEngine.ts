import { vi } from 'vitest';

let __singleton: any = null;

export function createMockRenderEngine() {
  if (__singleton) return __singleton;

  __singleton = {
    // GM Mode and Status
    setGmMode: vi.fn(),
    setStatusMessage: vi.fn(),
    clearStatusMessage: vi.fn(),
    getGmMode: vi.fn(() => false),
    set_gm_mode: vi.fn(),

    // Fog Draw Mode
    is_in_fog_draw_mode: vi.fn(() => false),
    get_current_input_mode: vi.fn(() => 'normal'),
    set_fog_draw_mode: vi.fn(),
    set_fog_erase_mode: vi.fn(),

    // Fog Management
    add_fog_rectangle: vi.fn(),
    remove_fog_rectangle: vi.fn(),
    clear_fog: vi.fn(),
    get_fog_count: vi.fn(() => 0),

    // Lighting System
    add_light: vi.fn(),
    remove_light: vi.fn(),
    set_light_color: vi.fn(),
    set_light_intensity: vi.fn(),
    set_light_radius: vi.fn(),
    get_light_count: vi.fn(() => 0),

    // Paint System
    paint_set_brush_color: vi.fn(),
    paint_set_brush_size: vi.fn(),
    paint_set_brush_width: vi.fn(),
    paint_add_point: vi.fn(),
    paint_start_stroke: vi.fn(),
    paint_continue_stroke: vi.fn(),
    paint_end_stroke: vi.fn(),
    paint_clear: vi.fn(),
    paint_clear_all: vi.fn(),
    paint_save_strokes_as_sprites: vi.fn(() => []),
    paint_get_stroke_count: vi.fn(() => 0),
    paint_get_strokes: vi.fn(() => []),
    paint_get_current_stroke: vi.fn(() => null),
    paint_is_mode: vi.fn(() => false),
    paint_exit_mode: vi.fn(),
    set_input_mode_select: vi.fn(),
    set_input_mode_create_rectangle: vi.fn(),
    paint_is_drawing: vi.fn(() => false),
    paint_get_brush_color: vi.fn(() => '#000000'),
    paint_get_brush_size: vi.fn(() => 5),
    paint_get_brush_width: vi.fn(() => 5),
    paint_undo_stroke: vi.fn(),
    redo_last_stroke: vi.fn(),
    paint_undo: vi.fn(),
    paint_redo: vi.fn(),
    paint_can_undo: vi.fn(() => false),
    paint_can_redo: vi.fn(() => false),
    paint_save_template: vi.fn(() => 'template_id_123'),
    paint_load_template: vi.fn(),
    paint_get_templates: vi.fn(() => []),
    paint_delete_template: vi.fn(),
    paint_set_blend_mode: vi.fn(),
    paint_get_blend_mode: vi.fn(() => 'normal'),
    screen_to_world: vi.fn((x: number, y: number) => [x, y]),
    screen_to_world_coordinates: vi.fn((x: number, y: number) => [x, y]),
    world_to_screen: vi.fn((x: number, y: number) => [x, y]),
    get_grid_size: vi.fn(() => 50),

    // Camera and background helpers expected by MapPanel
    set_background_color: vi.fn(),
    reset_camera: vi.fn(),
    set_camera_position: vi.fn(),
    set_camera_scale: vi.fn(),
    set_grid_enabled: vi.fn(),
    set_grid_size: vi.fn(),
    set_grid_color: vi.fn(),
    set_snap_to_grid: vi.fn(),

    // Text Sprite System
    create_text_sprite: vi.fn(() => 'text_sprite_1'),
    register_movable_entity: vi.fn(),
    add_sprite_to_layer: vi.fn(),
    enable_sprite_movement: vi.fn(),
    add_sprite: vi.fn(),
    remove_sprite: vi.fn(),
    get_all_sprites_network_data: vi.fn(() => []),
  // Sprite helpers used in tests
  get_sprite_info: vi.fn((id: string) => ({ id, x: 0, y: 0, width: 32, height: 32 })),
  get_sprite_count: vi.fn(() => 0),
  find_sprites_at: vi.fn(( _x: number, _y: number) => []),

  // Actions subsystem hooks expected by useActions
  set_action_handler: vi.fn((fn: any) => { /* store if tests need to trigger */ }),
  set_state_change_handler: vi.fn((fn: any) => { /* store if tests need to trigger */ }),
  set_actions_error_handler: vi.fn((fn: any) => { /* store if tests need to trigger */ }),
  can_undo: vi.fn(() => false),
  can_redo: vi.fn(() => false),
  get_all_tables: vi.fn(() => []),
  // History and actions introspection
  get_action_history: vi.fn(() => ([])),

    // Rendering
    render: vi.fn(),
    updateLighting: vi.fn(),
    updateFog: vi.fn()
    ,
    // Performance metrics queried by several integration tests
    get_performance_metrics: vi.fn(() => ({
      fps: 60,
      frame_time: 16.67,
      memory_usage: 1024 * 1024,
      sprite_count: 0
    }))
  } as any;

  // Provide a minimal manager object for asset manager initialization paths
  (__singleton as any).manager = {
    initialize: vi.fn().mockResolvedValue(undefined),
  };

  return __singleton;
}

export function resetMockRenderEngine() {
  __singleton = null;
}
