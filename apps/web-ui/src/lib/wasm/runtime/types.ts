import type {
  ActionsClient as GeneratedActionsClient,
  AssetManager as GeneratedAssetManager,
  NetworkClient as GeneratedNetworkClient,
  PlanningManager as GeneratedPlanningManager,
  RenderEngine as GeneratedRenderEngine,
  TableManager as GeneratedTableManager,
  TableSync as GeneratedTableSync,
} from '../generated/ttrpg_rust_core';

export type ActionsClient = GeneratedActionsClient;
export type AssetManager = GeneratedAssetManager;
export type NetworkClient = GeneratedNetworkClient;
export type RenderEngine = GeneratedRenderEngine;
export type PlanningManager = GeneratedPlanningManager;
export type TableManager = GeneratedTableManager;
export type TableSync = GeneratedTableSync;

export interface BrushPreset {
  color: [number, number, number, number];
  width: number;
  blend_mode: 'Alpha' | 'Additive' | 'Modulate' | 'Multiply' | 'alpha' | 'additive' | 'modulate' | 'multiply';
}
