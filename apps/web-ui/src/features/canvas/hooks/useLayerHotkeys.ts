/**
 * useLayerHotkeys — Press 1-7 to switch the active DM layer instantly.
 * Keys mirror the layer order shown in LayerPanel.
 * Ignored when typing in a text input.
 */
import { useGameStore } from '@/store';
import { isDM } from '@features/session/types/roles';
import { useEffect } from 'react';

const LAYER_HOTKEYS: Record<string, string> = {
  '1': 'map',
  '2': 'tokens',
  '3': 'dungeon_master',
  '4': 'light',
  '5': 'height',
  '6': 'obstacles',
  '7': 'fog_of_war',
};

export function useLayerHotkeys() {
  const sessionRole = useGameStore(s => s.sessionRole);
  const setActiveLayer = useGameStore(s => s.setActiveLayer);

  useEffect(() => {
    if (!isDM(sessionRole)) return;

    const handler = (e: KeyboardEvent) => {
      // Skip when focus is inside a text control
      const tag = (e.target as HTMLElement)?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const layer = LAYER_HOTKEYS[e.key];
      if (!layer) return;

      e.preventDefault();
      setActiveLayer(layer);
      const rm = window.rustRenderManager as (typeof window.rustRenderManager) & { set_active_layer?: (id: string) => void } | undefined;
      if (rm?.set_active_layer) rm.set_active_layer(layer);
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sessionRole, setActiveLayer]);
}
