import type { RenderEngine } from '../types';

// For now, we'll access the engine from window.rustRenderManager
// In a real app, you'd likely want to use React Context or a state management library
export const useRenderEngine = (): RenderEngine | null => {
  return window.rustRenderManager || null;
};
