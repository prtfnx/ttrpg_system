import { useGameStore } from '@/store';
import { isDM } from '@features/session/types/roles';
import { BrickWall, CloudFog, Crown, Lightbulb, Map, Mountain, Users } from 'lucide-react';
import styles from './FloatingLayerPicker.module.css';

const LAYERS = [
  { id: 'map',            label: 'Map',     Icon: Map,       hotkey: '1' },
  { id: 'tokens',         label: 'Tokens',  Icon: Users,     hotkey: '2' },
  { id: 'dungeon_master', label: 'DM',      Icon: Crown,     hotkey: '3' },
  { id: 'light',          label: 'Light',   Icon: Lightbulb, hotkey: '4' },
  { id: 'height',         label: 'Height',  Icon: Mountain,  hotkey: '5' },
  { id: 'obstacles',      label: 'Walls',   Icon: BrickWall, hotkey: '6' },
  { id: 'fog_of_war',     label: 'Fog',     Icon: CloudFog,  hotkey: '7' },
] as const;

export function FloatingLayerPicker() {
  const sessionRole = useGameStore(s => s.sessionRole);
  const activeLayer = useGameStore(s => s.activeLayer);
  const setActiveLayer = useGameStore(s => s.setActiveLayer);

  // sessionRole is null until WS welcome message; fall back to injected initial role
  const effectiveRole = sessionRole ?? ((window as any).__INITIAL_DATA__?.userRole ?? null);
  if (!isDM(effectiveRole)) return null;

  const switchLayer = (id: string) => {
    setActiveLayer(id);
    const rm = (window as any).rustRenderManager;
    if (rm?.set_active_layer) rm.set_active_layer(id);
  };

  const active = LAYERS.find(l => l.id === activeLayer);

  return (
    <div className={styles.picker} role="toolbar" aria-label="Layer switcher">
      {LAYERS.map(({ id, label, Icon, hotkey }) => (
        <button
          key={id}
          className={`${styles.btn} ${activeLayer === id ? styles.active : ''}`}
          onClick={() => switchLayer(id)}
          title={`${label} [${hotkey}]`}
          aria-pressed={activeLayer === id}
          aria-label={`Switch to ${label} layer`}
        >
          <Icon size={14} aria-hidden />
        </button>
      ))}
      {active && (
        <span className={styles.label}>{active.label}</span>
      )}
    </div>
  );
}
