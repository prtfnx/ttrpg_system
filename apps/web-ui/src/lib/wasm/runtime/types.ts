export interface ActionsClient {
  batch_actions(actions: unknown): unknown;
  can_redo(): boolean;
  can_undo(): boolean;
  create_sprite(tableId: string, layer: string, position: unknown, textureName: string): unknown;
  create_table(name: string, width: number, height: number): unknown;
  delete_sprite(spriteId: string): unknown;
  delete_table(tableId: string): unknown;
  get_action_history(): unknown;
  get_all_tables(): unknown;
  get_layer_visibility(layer: string): boolean;
  get_sprite_info(spriteId: string): unknown;
  get_sprites_by_layer(layer: string): unknown;
  get_table_info(tableId: string): unknown;
  move_sprite_to_layer(spriteId: string, newLayer: string): unknown;
  redo(): unknown;
  set_action_handler(callback: Function): void;
  set_error_handler(callback: Function): void;
  set_layer_visibility(layer: string, visible: boolean): unknown;
  set_state_change_handler(callback: Function): void;
  undo(): unknown;
  update_sprite(spriteId: string, updates: unknown): unknown;
  update_table(tableId: string, updates: unknown): unknown;
}

export interface AssetManager {
  calculate_asset_hash(data: Uint8Array): string;
  cleanup_cache(): Promise<void>;
  clear_cache(): Promise<void>;
  clear_download_queue(): void;
  download_asset(url: string, expectedHash?: string | null): Promise<string>;
  get_asset_by_hash(xxhash: string): string | undefined;
  get_asset_data(assetId: string): Uint8Array | undefined;
  get_asset_info(assetId: string): string | undefined;
  get_cache_stats(): string;
  get_download_queue_size(): number;
  get_queued_downloads(): string[];
  has_asset(assetId: string): boolean;
  has_asset_by_hash(xxhash: string): boolean;
  initialize(): Promise<void>;
  list_assets(): string;
  remove_asset(assetId: string): boolean;
  remove_from_queue(url: string): boolean;
  set_max_age(ageMs: number): void;
  set_max_cache_size(sizeBytes: bigint): void;
}

export interface NetworkClient {
  authenticate(username: string, password: string): void;
  confirm_asset_upload(assetId: string, uploadSuccess: boolean): void;
  connect(url: string): void;
  disconnect(): void;
  get_client_id(): string;
  get_connection_state(): string;
  get_session_code(): string | undefined;
  get_username(): string | undefined;
  is_connected(): boolean;
  join_session(sessionCode: string): void;
  request_asset_download(assetId: string): void;
  request_asset_upload(filename: string, fileHash: string, fileSize: bigint): void;
  request_player_list(): void;
  request_table_list(): void;
  send_message(messageType: string, data: unknown): void;
  send_new_table_request(tableName: string): void;
  send_ping(): void;
  send_sprite_create(spriteData: unknown): void;
  send_sprite_remove(spriteId: string): void;
  send_sprite_update(spriteData: unknown): void;
  send_table_request(requestData: unknown): void;
  send_table_update(tableData: unknown): void;
  set_connection_handler(callback: Function): void;
  set_error_handler(callback: Function): void;
  set_message_handler(callback: Function): void;
  set_user_info(userId: number, username: string, sessionCode?: string | null, jwtToken?: string | null): void;
  sync_action(actionData: string): void;
}

export interface PlanningManager {
  clear_all(): void;
  clear_aoe(): void;
  clear_ghost(spriteId: string): void;
  free(): void;
  get_aoe(): unknown;
  get_ghost(spriteId: string): { sprite_id: string; x: number; y: number; [key: string]: unknown } | null;
  get_ghosts(): Array<{ sprite_id: string; x: number; y: number; [key: string]: unknown }>;
  has_los(x1: number, y1: number, x2: number, y2: number): boolean;
  measure_ft(x1: number, y1: number, x2: number, y2: number): number;
  movement_range(sx: number, sy: number, speedFt: number, diagonal_5_10_5: boolean): unknown;
  set_aoe_cone(ox: number, oy: number, angle: number, length: number): void;
  set_aoe_cube(cx: number, cy: number, side: number): void;
  set_aoe_line(x1: number, y1: number, x2: number, y2: number, width: number): void;
  set_aoe_sphere(cx: number, cy: number, radius: number): void;
  set_obstacles(json: string): void;
  set_walls(json: string): void;
  start_ghost(spriteId: string, realX: number, realY: number, previewX: number, previewY: number, speedFt: number): number;
  tokens_in_aoe(positionsFlat: Float32Array): string[];
}

export interface RenderEngine {
  add_fog_rectangle(id: string, startX: number, startY: number, endX: number, endY: number, mode: string): void;
  add_fog_polygon(id: string, polygon: VisibilityPoint[]): void;
  add_light(id: string, x: number, y: number): void;
  add_sprite_to_layer(layerName: string, spriteData: unknown): string;
  add_wall(wallJson: string): boolean;
  align_selected_to_grid(): void;
  batch_actions(actions: unknown): unknown;
  can_redo(): boolean;
  can_undo(): boolean;
  clear_fog(): void;
  clear_layer(layerName: string): boolean;
  clear_runtime_event_handler(): void;
  clear_runtime_operation_handler(): void;
  clear_selection(): void;
  clear_walls(): void;
  cancel_current_operation(): boolean;
  copy_sprite(spriteId: string): string | undefined;
  get_active_table_id(): string | undefined;
  get_active_table_world_bounds(): Float64Array;
  get_cursor_type(screenX: number, screenY: number): string;
  get_layer_names(): string[];
  get_layer_sprite_count(layerName: string): number;
  get_obstacle_segments_flat(): Float32Array;
  get_selected_sprites(): string[];
  get_selected_walls(): string[];
  get_sprite_position(spriteId: string): Float32Array | undefined;
  get_sprite_scale(spriteId: string): Float32Array | undefined;
  get_wall_ids(): string[];
  get_wall_render_data(): Float32Array;
  handle_mouse_down_full(screenX: number, screenY: number, ctrlPressed: boolean, altPressed: boolean): string | undefined;
  handle_mouse_move(screenX: number, screenY: number): void;
  handle_mouse_up(screenX: number, screenY: number): void;
  handle_right_click(screenX: number, screenY: number): string | undefined;
  handle_table_data(tableData: unknown): void;
  handle_wheel(screenX: number, screenY: number, deltaY: number): void;
  hide_entire_table(tableWidth: number, tableHeight: number): void;
  is_in_fog_draw_mode(): boolean;
  is_in_light_drag_mode(): boolean;
  is_point_in_fog(x: number, y: number): boolean;
  load_texture(name: string, image: HTMLImageElement): void;
  move_sprite_to_layer(spriteId: string, newLayer: string): boolean;
  paint_add_point(worldX: number, worldY: number, pressure: number): boolean;
  paint_add_remote_stroke(strokeJson: string): boolean;
  paint_can_redo(): boolean;
  paint_can_undo(): boolean;
  paint_cancel_stroke(): void;
  paint_clear_all(): void;
  paint_end_stroke(): boolean;
  paint_enter_mode(width: number, height: number): void;
  paint_exit_mode(): void;
  paint_get_strokes(): unknown;
  paint_load_strokes(strokesJson: string): boolean;
  paint_redo_stroke(): boolean;
  paint_remove_stroke(strokeId: string): boolean;
  paint_set_blend_mode(blendMode: string): void;
  paint_set_brush_color(r: number, g: number, b: number, a: number): void;
  paint_set_brush_width(width: number): void;
  paint_set_current_table(tableId: string): void;
  paint_start_stroke(worldX: number, worldY: number, pressure: number): boolean;
  paint_undo_stroke(): boolean;
  paste_sprite(layerName: string, spriteJson: string, offsetX: number, offsetY: number): string;
  remove_fog_rectangle(id: string): void;
  remove_fog_polygon(id: string): void;
  remove_light(id: string): void;
  remove_selected_walls(): string[];
  remove_sprite(spriteId: string): boolean;
  remove_wall(wallId: string): boolean;
  render(): void;
  resize_canvas(width: number, height: number): void;
  resize_sprite(spriteId: string, newWidth: number, newHeight: number): boolean;
  rotate_sprite(spriteId: string, rotationDegrees: number): boolean;
  screen_to_world(screenX: number, screenY: number): Float64Array;
  select_all_sprites(): void;
  set_active_layer(layerName: string): void;
  set_alt_pressed(alt: boolean): void;
  set_ambient_light(level: number): void;
  set_background_color(hex: string): void;
  set_camera(worldX: number, worldY: number, zoom: number): void;
  set_current_user_id(userId: number): void;
  set_dynamic_lighting_enabled(enabled: boolean): void;
  set_gm_mode(isGm: boolean): void;
  set_grid_enabled(enabled: boolean): void;
  set_grid_size(size: number): void;
  set_grid_snapping(enabled: boolean): void;
  set_input_mode_create_circle(): void;
  set_input_mode_create_line(): void;
  set_input_mode_create_polygon(): void;
  set_input_mode_create_rectangle(): void;
  set_input_mode_create_text(): void;
  set_input_mode_draw_wall(): void;
  set_input_mode_measurement(): void;
  set_input_mode_paint(): void;
  set_input_mode_select(): void;
  set_layer_blend_mode(layerName: string, blendMode: string): boolean;
  set_layer_color(layerName: string, r: number, g: number, b: number): boolean;
  set_layer_opacity(layerName: string, opacity: number): boolean;
  set_layer_visibility(layerName: string, visible: boolean): boolean;
  set_light_color(id: string, r: number, g: number, b: number, a: number): void;
  set_light_intensity(id: string, intensity: number): void;
  set_light_radius(id: string, radius: number): void;
  set_runtime_event_handler(callback: Function): void;
  set_runtime_operation_handler(callback: Function): void;
  set_shape_style(color: string, opacity: number, filled: boolean): void;
  set_tool_mode(mode: string): void;
  set_zoom(zoom: number): void;
  start_camera_pan(screenX: number, screenY: number): void;
  toggle_light(id: string): void;
  update_light_position(id: string, x: number, y: number): void;
  update_sprite_position(spriteId: string, x: number, y: number): boolean;
  update_sprite_scale(spriteId: string, scaleX: number, scaleY: number): boolean;
  translate_selected_walls(dx: number, dy: number): ArrayLike<WallMoveUpdate>;
  update_wall(wallId: string, updatesJson: string): boolean;
  world_to_screen(worldX: number, worldY: number): Float64Array;
}

export interface TableManager {
  create_table(tableId: string, tableName: string, width: number, height: number): void;
  get_active_table_id(): string | undefined;
  get_all_tables(): string;
  get_table_info(tableId: string): string | undefined;
  get_visible_bounds(tableId: string): Float64Array | undefined;
  is_point_in_table_area(tableId: string, screenX: number, screenY: number): boolean;
  pan_viewport(tableId: string, dx: number, dy: number): boolean;
  pixels_to_units(tableId: string, pixels: number): number;
  remove_table(tableId: string): boolean;
  screen_to_table(tableId: string, screenX: number, screenY: number): Float64Array | undefined;
  set_active_table(tableId: string): boolean;
  set_canvas_size(width: number, height: number): void;
  set_table_grid(tableId: string, showGrid: boolean, cellSize: number): boolean;
  set_table_screen_area(tableId: string, x: number, y: number, width: number, height: number): boolean;
  set_table_units(tableId: string, gridCellPx: number, cellDistance: number, unit: string): boolean;
  snap_to_grid(tableId: string, x: number, y: number): Float64Array | undefined;
  table_to_screen(tableId: string, tableX: number, tableY: number): Float64Array | undefined;
  units_to_pixels(tableId: string, gameDistance: number): number;
  zoom_table(tableId: string, zoomFactor: number, centerX: number, centerY: number): boolean;
}

export interface TableSync {
  check_timeouts(): void;
  confirm_action(actionId: string): boolean;
  get_sprites(): unknown;
  get_sprites_by_layer(layerName: string): unknown;
  get_table_data(): unknown;
  get_table_id(): string | undefined;
  handle_error(errorMessage: string): void;
  handle_sprite_update(updateData: unknown): void;
  handle_table_data(tableData: unknown): void;
  request_table(tableName: string): void;
  revert_action(actionId: string): void;
  send_sprite_create(spriteData: unknown): void;
  send_sprite_delete(spriteId: string): void;
  send_sprite_move(spriteId: string, x: number, y: number): string;
  send_sprite_rotate(spriteId: string, rotation: number): string;
  send_sprite_scale(spriteId: string, scaleX: number, scaleY: number): string;
  set_action_reverted_handler(callback: Function): void;
  set_error_handler(callback: Function): void;
  set_grace_period(ms: number): void;
  set_network_client(networkClient: unknown): void;
  set_sprite_update_handler(callback: Function): void;
  set_table_received_handler(callback: Function): void;
}

export interface BrushPreset {
  color: [number, number, number, number];
  width: number;
  blend_mode: 'Alpha' | 'Additive' | 'Modulate' | 'Multiply' | 'alpha' | 'additive' | 'modulate' | 'multiply';
}

export interface VisibilityPoint {
  x: number;
  y: number;
}

export interface WallMoveUpdate {
  wallId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
