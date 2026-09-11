import type { Sprite } from '@/types';

const TABLE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const RENDERER_LAYER_NAMES = [
  'map',
  'tokens',
  'dungeon_master',
  'light',
  'height',
  'obstacles',
  'fog_of_war',
] as const;

export type RendererLayerName = typeof RENDERER_LAYER_NAMES[number];

export interface TableSummary {
  table_id: string;
  table_name: string;
  width: number;
  height: number;
}

export interface WireTableSnapshot extends TableSummary {
  scale?: number | [number, number];
  position?: [number, number];
  x_moved?: number;
  y_moved?: number;
  grid_cell_px?: number;
  grid_size?: number;
  cell_distance?: number;
  distance_unit?: string;
  grid_enabled?: boolean;
  snap_to_grid?: boolean;
  grid_snapping?: boolean;
  layer_visibility?: Partial<Record<RendererLayerName, boolean>>;
  layers: Partial<Record<RendererLayerName, unknown>>;
  walls?: unknown[];
  background_image?: string;
}

export interface RendererSpriteInput {
  sprite_id: string;
  texture_path: string;
  coord_x: number;
  coord_y: number;
  scale_x: number;
  scale_y: number;
  layer: RendererLayerName;
  moving: boolean;
  collidable: boolean;
  width: number;
  height: number;
  rotation?: number;
  character_id?: string;
  controlled_by?: number[];
  hp?: number;
  max_hp?: number;
  ac?: number;
  aura_radius?: number;
  aura_radius_units?: number;
  aura_color?: string;
  speed?: number;
  compendium_entity?: unknown;
  entity_type?: string;
  asset_id?: string;
  obstacle_type?: string;
  obstacle_data?: unknown;
  metadata?: string;
}

export interface RendererTableInput {
  table_id: string;
  table_name: string;
  name: string;
  width: number;
  height: number;
  scale: number;
  x_moved: number;
  y_moved: number;
  show_grid: boolean;
  cell_side: number;
  grid_cell_px: number;
  cell_distance: number;
  distance_unit: string;
  layers: Record<RendererLayerName, RendererSpriteInput[]>;
}

export interface RendererWallInput {
  wall_id: string;
  table_id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  wall_type: 'normal' | 'terrain' | 'invisible' | 'ethereal' | 'window';
  blocks_movement: boolean;
  blocks_light: boolean;
  blocks_sight: boolean;
  blocks_sound: boolean;
  is_door: boolean;
  door_state: 'closed' | 'open' | 'locked';
  is_secret: boolean;
  direction: 'both' | 'left' | 'right';
}

export interface NormalizedTableSnapshot {
  wire: WireTableSnapshot;
  renderer: RendererTableInput;
  specialSprites: RendererSpriteInput[];
  storeSprites: Sprite[];
  walls: RendererWallInput[];
  snapToGrid: boolean;
  layerVisibility: Partial<Record<RendererLayerName, boolean>>;
  backgroundColor: string | null;
}

export class TableSnapshotValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TableSnapshotValidationError';
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TableSnapshotValidationError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function finiteNumber(value: unknown, path: string, fallback?: number): number {
  if (value === undefined || value === null) {
    if (fallback !== undefined) return fallback;
    throw new TableSnapshotValidationError(`${path} is required`);
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TableSnapshotValidationError(`${path} must be a finite number`);
  }
  return value;
}

function positiveNumber(value: unknown, path: string, fallback?: number): number {
  const parsed = finiteNumber(value, path, fallback);
  if (parsed <= 0) throw new TableSnapshotValidationError(`${path} must be greater than zero`);
  return parsed;
}

function optionalFiniteNumber(value: unknown, path: string): number | undefined {
  return value === undefined || value === null ? undefined : finiteNumber(value, path);
}

function optionalInteger(value: unknown, path: string): number | undefined {
  const parsed = optionalFiniteNumber(value, path);
  if (parsed !== undefined && !Number.isSafeInteger(parsed)) {
    throw new TableSnapshotValidationError(`${path} must be an integer`);
  }
  return parsed;
}

function requiredText(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TableSnapshotValidationError(`${path} must be non-empty text`);
  }
  return value.trim();
}

function optionalText(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new TableSnapshotValidationError(`${path} must be text`);
  return value;
}

function booleanValue(value: unknown, path: string, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'boolean') throw new TableSnapshotValidationError(`${path} must be boolean`);
  return value;
}

function tableScale(value: unknown): number {
  if (value === undefined || value === null) return 1;
  if (typeof value === 'number') return positiveNumber(value, 'table.scale');
  if (!Array.isArray(value) || value.length !== 2) {
    throw new TableSnapshotValidationError('table.scale must be a number or a two-number tuple');
  }
  const x = positiveNumber(value[0], 'table.scale[0]');
  const y = positiveNumber(value[1], 'table.scale[1]');
  if (Math.abs(x - y) > Number.EPSILON * Math.max(1, Math.abs(x), Math.abs(y))) {
    throw new TableSnapshotValidationError('table.scale must be uniform; non-uniform table scale is not supported by the renderer');
  }
  return x;
}

function tablePosition(value: unknown, table: Record<string, unknown>): [number, number] {
  if (value === undefined || value === null) {
    return [
      finiteNumber(table.x_moved, 'table.x_moved', 0),
      finiteNumber(table.y_moved, 'table.y_moved', 0),
    ];
  }
  if (!Array.isArray(value) || value.length !== 2) {
    throw new TableSnapshotValidationError('table.position must be a two-number tuple');
  }
  return [finiteNumber(value[0], 'table.position[0]'), finiteNumber(value[1], 'table.position[1]')];
}

function controllers(value: unknown, path: string): number[] | undefined {
  if (value === undefined || value === null) return undefined;
  let parsed: unknown = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      throw new TableSnapshotValidationError(`${path} must contain a JSON array`);
    }
  }
  if (!Array.isArray(parsed)) throw new TableSnapshotValidationError(`${path} must be an array`);
  return parsed.map((entry, index) => {
    const id = optionalInteger(entry, `${path}[${index}]`);
    if (id === undefined) throw new TableSnapshotValidationError(`${path}[${index}] is required`);
    return id;
  });
}

function metadata(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    throw new TableSnapshotValidationError(`${path} must be JSON serializable`);
  }
}

function coordinate(sprite: Record<string, unknown>, axis: 'x' | 'y', path: string): number {
  const direct = sprite[`coord_${axis}`] ?? sprite[axis] ?? sprite[`world_${axis}`];
  if (direct !== undefined && direct !== null) return finiteNumber(direct, `${path}.coord_${axis}`);
  const position = sprite.position;
  if (Array.isArray(position) && position.length >= 2) {
    return finiteNumber(position[axis === 'x' ? 0 : 1], `${path}.position`);
  }
  if (position && typeof position === 'object' && !Array.isArray(position)) {
    return finiteNumber((position as Record<string, unknown>)[axis], `${path}.position.${axis}`);
  }
  return 0;
}

function normalizeSprite(
  value: unknown,
  layer: RendererLayerName,
  tableId: string,
  path: string,
): { renderer: RendererSpriteInput; store: Sprite } {
  const sprite = record(value, path);
  const spriteId = requiredText(sprite.sprite_id ?? sprite.id, `${path}.sprite_id`);
  const texturePath = optionalText(sprite.texture_path ?? sprite.texture_id ?? sprite.asset_id ?? '', `${path}.texture_path`) ?? '';
  const normalized: RendererSpriteInput = {
    sprite_id: spriteId,
    texture_path: texturePath,
    coord_x: coordinate(sprite, 'x', path),
    coord_y: coordinate(sprite, 'y', path),
    scale_x: positiveNumber(sprite.scale_x, `${path}.scale_x`, 1),
    scale_y: positiveNumber(sprite.scale_y, `${path}.scale_y`, 1),
    layer,
    moving: booleanValue(sprite.moving, `${path}.moving`, false),
    collidable: booleanValue(sprite.collidable, `${path}.collidable`, false),
    width: finiteNumber(sprite.width ?? sprite.size_x, `${path}.width`, 0),
    height: finiteNumber(sprite.height ?? sprite.size_y, `${path}.height`, 0),
  };

  const optionalNumbers: Array<[keyof RendererSpriteInput, unknown, boolean]> = [
    ['rotation', sprite.rotation, false],
    ['hp', sprite.hp, true],
    ['max_hp', sprite.max_hp, true],
    ['ac', sprite.ac, true],
    ['aura_radius', sprite.aura_radius, false],
    ['aura_radius_units', sprite.aura_radius_units, false],
    ['speed', sprite.speed, false],
  ];
  for (const [key, raw, integer] of optionalNumbers) {
    const parsed = integer ? optionalInteger(raw, `${path}.${key}`) : optionalFiniteNumber(raw, `${path}.${key}`);
    if (parsed !== undefined) Object.assign(normalized, { [key]: parsed });
  }

  const optionalStrings: Array<[keyof RendererSpriteInput, unknown]> = [
    ['character_id', sprite.character_id],
    ['aura_color', sprite.aura_color],
    ['entity_type', sprite.entity_type],
    ['asset_id', sprite.asset_id],
    ['obstacle_type', sprite.obstacle_type],
  ];
  for (const [key, raw] of optionalStrings) {
    const parsed = optionalText(raw, `${path}.${key}`);
    if (parsed !== undefined) Object.assign(normalized, { [key]: parsed });
  }

  const controlledBy = controllers(sprite.controlled_by, `${path}.controlled_by`);
  if (controlledBy !== undefined) normalized.controlled_by = controlledBy;
  const encodedMetadata = metadata(sprite.metadata, `${path}.metadata`);
  if (encodedMetadata !== undefined) normalized.metadata = encodedMetadata;
  if (sprite.compendium_entity !== undefined && sprite.compendium_entity !== null) {
    normalized.compendium_entity = sprite.compendium_entity;
  }
  if (sprite.obstacle_data !== undefined && sprite.obstacle_data !== null) {
    normalized.obstacle_data = sprite.obstacle_data;
  }
  const visible = sprite.visible === undefined || sprite.visible === null
    ? undefined
    : booleanValue(sprite.visible, `${path}.visible`, true);
  const visionRadius = optionalFiniteNumber(sprite.vision_radius, `${path}.vision_radius`);
  const visionRadiusUnits = optionalFiniteNumber(sprite.vision_radius_units, `${path}.vision_radius_units`);
  const darkvisionRadius = optionalFiniteNumber(sprite.darkvision_radius, `${path}.darkvision_radius`);
  const darkvisionRadiusUnits = optionalFiniteNumber(sprite.darkvision_radius_units, `${path}.darkvision_radius_units`);
  const hasDarkvision = sprite.has_darkvision === undefined || sprite.has_darkvision === null
    ? undefined
    : booleanValue(sprite.has_darkvision, `${path}.has_darkvision`, false);
  const store: Sprite = {
    id: normalized.sprite_id,
    name: optionalText(sprite.name ?? sprite.sprite_name, `${path}.name`) || `Sprite ${normalized.sprite_id}`,
    tableId,
    x: normalized.coord_x,
    y: normalized.coord_y,
    layer,
    texture: normalized.texture_path,
    scale: { x: normalized.scale_x, y: normalized.scale_y },
    rotation: normalized.rotation ?? 0,
    syncStatus: 'synced',
    ...(normalized.character_id ? { characterId: normalized.character_id } : {}),
    ...(normalized.controlled_by ? { controlledBy: normalized.controlled_by.map(String) } : {}),
    ...(normalized.hp !== undefined ? { hp: normalized.hp } : {}),
    ...(normalized.max_hp !== undefined ? { maxHp: normalized.max_hp } : {}),
    ...(normalized.ac !== undefined ? { ac: normalized.ac } : {}),
    ...(normalized.aura_radius !== undefined ? { auraRadius: normalized.aura_radius } : {}),
    ...(normalized.aura_radius_units !== undefined ? { auraRadiusUnits: normalized.aura_radius_units } : {}),
    ...(normalized.aura_color ? { auraColor: normalized.aura_color } : {}),
    ...(normalized.metadata !== undefined ? { metadata: normalized.metadata } : {}),
    ...(visible !== undefined ? { isVisible: visible } : {}),
    ...(visionRadius !== undefined ? { visionRadius } : {}),
    ...(visionRadiusUnits !== undefined ? { visionRadiusUnits } : {}),
    ...(hasDarkvision !== undefined ? { hasDarkvision } : {}),
    ...(darkvisionRadius !== undefined ? { darkvisionRadius } : {}),
    ...(darkvisionRadiusUnits !== undefined ? { darkvisionRadiusUnits } : {}),
  };
  return { renderer: normalized, store };
}

function layerEntries(value: unknown, path: string): unknown[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  const layer = record(value, path);
  if ('sprites' in layer) {
    if (!Array.isArray(layer.sprites)) throw new TableSnapshotValidationError(`${path}.sprites must be an array`);
    return layer.sprites;
  }
  return Object.values(layer);
}

function normalizeWall(value: unknown, tableId: string, path: string): RendererWallInput {
  const wall = record(value, path);
  const wallType = optionalText(wall.wall_type, `${path}.wall_type`) ?? 'normal';
  const doorState = optionalText(wall.door_state, `${path}.door_state`) ?? 'closed';
  const direction = optionalText(wall.direction, `${path}.direction`) ?? 'both';
  if (!['normal', 'terrain', 'invisible', 'ethereal', 'window'].includes(wallType)) {
    throw new TableSnapshotValidationError(`${path}.wall_type is invalid`);
  }
  if (!['closed', 'open', 'locked'].includes(doorState)) {
    throw new TableSnapshotValidationError(`${path}.door_state is invalid`);
  }
  if (!['both', 'left', 'right'].includes(direction)) {
    throw new TableSnapshotValidationError(`${path}.direction is invalid`);
  }
  const wallTableId = optionalText(wall.table_id, `${path}.table_id`) ?? tableId;
  if (wallTableId !== tableId) throw new TableSnapshotValidationError(`${path}.table_id does not match the table snapshot`);
  return {
    wall_id: requiredText(wall.wall_id, `${path}.wall_id`),
    table_id: tableId,
    x1: finiteNumber(wall.x1, `${path}.x1`),
    y1: finiteNumber(wall.y1, `${path}.y1`),
    x2: finiteNumber(wall.x2, `${path}.x2`),
    y2: finiteNumber(wall.y2, `${path}.y2`),
    wall_type: wallType as RendererWallInput['wall_type'],
    blocks_movement: booleanValue(wall.blocks_movement, `${path}.blocks_movement`, true),
    blocks_light: booleanValue(wall.blocks_light, `${path}.blocks_light`, true),
    blocks_sight: booleanValue(wall.blocks_sight, `${path}.blocks_sight`, true),
    blocks_sound: booleanValue(wall.blocks_sound, `${path}.blocks_sound`, true),
    is_door: booleanValue(wall.is_door, `${path}.is_door`, false),
    door_state: doorState as RendererWallInput['door_state'],
    is_secret: booleanValue(wall.is_secret, `${path}.is_secret`, false),
    direction: direction as RendererWallInput['direction'],
  };
}

function unwrapSnapshot(input: unknown): { envelope: Record<string, unknown>; table: Record<string, unknown> } {
  const envelope = record(input, 'table response');
  const table = envelope.table_data === undefined ? envelope : record(envelope.table_data, 'table response.table_data');
  return { envelope, table };
}

export function normalizeTableSnapshot(input: unknown): NormalizedTableSnapshot {
  const { envelope, table } = unwrapSnapshot(input);
  const tableId = requiredText(table.table_id, 'table.table_id');
  if (!TABLE_ID_PATTERN.test(tableId)) {
    throw new TableSnapshotValidationError('table.table_id must be an authoritative UUID');
  }
  const tableName = requiredText(table.table_name ?? table.name, 'table.table_name');
  const width = positiveNumber(table.width, 'table.width');
  const height = positiveNumber(table.height, 'table.height');
  const [xMoved, yMoved] = tablePosition(table.position, table);
  const gridCellPx = positiveNumber(table.grid_cell_px ?? table.grid_size, 'table.grid_cell_px', 50);
  const cellDistance = positiveNumber(table.cell_distance, 'table.cell_distance', 5);
  const distanceUnit = optionalText(table.distance_unit, 'table.distance_unit') ?? 'ft';
  if (distanceUnit !== 'ft' && distanceUnit !== 'm') {
    throw new TableSnapshotValidationError('table.distance_unit must be "ft" or "m"');
  }
  const layersInput = table.layers === undefined ? {} : record(table.layers, 'table.layers');
  for (const name of Object.keys(layersInput)) {
    if (!RENDERER_LAYER_NAMES.includes(name as RendererLayerName)) {
      throw new TableSnapshotValidationError(`table.layers contains unsupported layer "${name}"`);
    }
  }

  const layers: Record<RendererLayerName, RendererSpriteInput[]> = {
    map: [],
    tokens: [],
    dungeon_master: [],
    light: [],
    height: [],
    obstacles: [],
    fog_of_war: [],
  };
  const specialSprites: RendererSpriteInput[] = [];
  const storeSprites: Sprite[] = [];
  for (const layerName of RENDERER_LAYER_NAMES) {
    const entries = layerEntries(layersInput[layerName], `table.layers.${layerName}`);
    entries.forEach((entry, index) => {
      const { renderer: sprite, store } = normalizeSprite(entry, layerName, tableId, `table.layers.${layerName}[${index}]`);
      storeSprites.push(store);
      if (sprite.texture_path === '__LIGHT__' || sprite.texture_path === '__FOG_HIDE__' || sprite.texture_path === '__FOG_REVEAL__') {
        specialSprites.push(sprite);
      } else {
        layers[layerName].push(sprite);
      }
    });
  }

  const backgroundImage = optionalText(table.background_image ?? envelope.background_image, 'table.background_image');
  if (backgroundImage) {
    layers.map.unshift({
      sprite_id: `table-background:${tableId}`,
      texture_path: backgroundImage,
      coord_x: 0,
      coord_y: 0,
      scale_x: 1,
      scale_y: 1,
      layer: 'map',
      moving: false,
      collidable: false,
      width,
      height,
    });
  }

  const rawVisibility = table.layer_visibility === undefined ? {} : record(table.layer_visibility, 'table.layer_visibility');
  const layerVisibility: Partial<Record<RendererLayerName, boolean>> = {};
  for (const [name, value] of Object.entries(rawVisibility)) {
    if (!RENDERER_LAYER_NAMES.includes(name as RendererLayerName)) continue;
    if (typeof value !== 'boolean') throw new TableSnapshotValidationError(`table.layer_visibility.${name} must be boolean`);
    layerVisibility[name as RendererLayerName] = value;
  }

  const rawWalls = table.walls ?? envelope.walls ?? [];
  if (!Array.isArray(rawWalls)) throw new TableSnapshotValidationError('table.walls must be an array');
  const walls = rawWalls.map((wall, index) => normalizeWall(wall, tableId, `table.walls[${index}]`));
  const gridEnabled = booleanValue(table.grid_enabled, 'table.grid_enabled', true);
  const snapToGrid = booleanValue(table.snap_to_grid ?? table.grid_snapping, 'table.snap_to_grid', true);

  const wire: WireTableSnapshot = {
    table_id: tableId,
    table_name: tableName,
    width,
    height,
    scale: table.scale as WireTableSnapshot['scale'],
    position: [xMoved, yMoved],
    grid_cell_px: gridCellPx,
    cell_distance: cellDistance,
    distance_unit: distanceUnit,
    grid_enabled: gridEnabled,
    snap_to_grid: snapToGrid,
    layer_visibility: layerVisibility,
    layers: layersInput,
    walls: rawWalls,
    background_image: backgroundImage,
  };

  return {
    wire,
    renderer: {
      table_id: tableId,
      table_name: tableName,
      name: tableName,
      width,
      height,
      scale: tableScale(table.scale),
      x_moved: xMoved,
      y_moved: yMoved,
      show_grid: gridEnabled,
      cell_side: gridCellPx,
      grid_cell_px: gridCellPx,
      cell_distance: cellDistance,
      distance_unit: distanceUnit,
      layers,
    },
    specialSprites,
    storeSprites,
    walls,
    snapToGrid,
    layerVisibility,
    backgroundColor: optionalText(table.background_color_hex, 'table.background_color_hex') ?? null,
  };
}
