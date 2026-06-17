import type {
  ActionsClient as GeneratedActionsClient,
  AssetManager as GeneratedAssetManager,
  PlanningManager as GeneratedPlanningManager,
  RenderEngine as GeneratedRenderEngine,
} from '../ttrpg_rust_core';

export type ActionsClient = GeneratedActionsClient;
export type AssetManager = GeneratedAssetManager;
export type RenderEngine = GeneratedRenderEngine;
export type PlanningManager = GeneratedPlanningManager;

export interface BrushPreset {
  color: [number, number, number, number];
  width: number;
  blend_mode: 'Alpha' | 'Additive' | 'Modulate' | 'Multiply' | 'alpha' | 'additive' | 'modulate' | 'multiply';
}
