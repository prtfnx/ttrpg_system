import { useGameStore } from '@/store';
import type { Color } from '@/types';
import { useRenderEngine } from '@features/canvas';
import { useProtocol } from '@lib/api';
import {
  Flame,
  Lightbulb,
  Moon,
  MoveHorizontal,
  Sparkles,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import styles from './LightingPanel.module.css';

function lightToSprite(light: Light, tableId: string): Record<string, any> {
  const converter = useGameStore.getState().getUnitConverter();
  const radiusUnits = converter.toUnits(light.radius);
  return {
    id: light.id,
    x: light.x,
    y: light.y,
    scale_x: light.radius * 2,
    scale_y: light.radius * 2,
    rotation: 0,
    texture_path: '__LIGHT__',
    layer: 'light',
    table_id: tableId,
    metadata: JSON.stringify({
      isLight: true,
      presetName: light.presetName,
      color: light.color,
      intensity: light.intensity,
      radius: light.radius,
      radius_units: radiusUnits,
      isOn: light.isOn,
    }),
  };
}

function spriteToLight(sprite: any): Light | null {
  const texturePath = sprite.texture_path || sprite.texture;
  if (sprite.layer !== 'light' || texturePath !== '__LIGHT__') return null;

  let meta: any = {};
  try {
    meta = typeof sprite.metadata === 'string' ? JSON.parse(sprite.metadata) : (sprite.metadata ?? {});
  } catch {
    // keep defaults
  }

  if (meta.isLight === false) return null;

  // Prefer radius_units (game units) → convert to px; fall back to legacy radius (px)
  let radius: number;
  if (meta.radius_units != null) {
    const converter = useGameStore.getState().getUnitConverter();
    radius = converter.toPixels(meta.radius_units);
  } else {
    radius = meta.radius ?? 100;
  }

  return {
    id: sprite.id || sprite.sprite_id,
    x: sprite.x ?? 0,
    y: sprite.y ?? 0,
    presetName: meta.presetName,
    color: meta.color || { r: 1, g: 1, b: 1, a: 1 },
    intensity: meta.intensity ?? 1.0,
    radius,
    isOn: meta.isOn !== false,
  };
}

interface Light {
  id: string;
  x: number;
  y: number;
  presetName?: string;
  color: Color;
  intensity: number;
  radius: number;
  isOn: boolean;
}

// Preset radii in game units (feet) — D&D PHB values
const LIGHT_PRESETS = [
  { name: 'Torch',     radiusFt: 20, intensity: 1.0, color: { r: 1.0, g: 0.6, b: 0.2, a: 1.0 }, Icon: Flame },
  { name: 'Candle',   radiusFt: 5,  intensity: 0.7, color: { r: 1.0, g: 0.7, b: 0.3, a: 1.0 }, Icon: Lightbulb },
  { name: 'Daylight', radiusFt: 60, intensity: 1.0, color: { r: 1.0, g: 1.0, b: 0.9, a: 1.0 }, Icon: Sun },
  { name: 'Moonlight',radiusFt: 40, intensity: 0.4, color: { r: 0.6, g: 0.7, b: 1.0, a: 1.0 }, Icon: Moon },
  { name: 'Fire',     radiusFt: 20, intensity: 0.9, color: { r: 1.0, g: 0.4, b: 0.1, a: 1.0 }, Icon: Flame },
  { name: 'Magic',    radiusFt: 30, intensity: 0.8, color: { r: 0.5, g: 0.2, b: 1.0, a: 1.0 }, Icon: Sparkles },
];

export const LightingPanel: React.FC = () => {
  const engine = useRenderEngine();
  const { protocol } = useProtocol();
  const sprites = useGameStore(s => s.sprites);
  const activeTableId = useGameStore(s => s.activeTableId);
  const ambientLight = useGameStore(s => s.ambientLight);
  const setAmbientLight = useGameStore(s => s.setAmbientLight);
  const getUnitConverter = useGameStore(s => s.getUnitConverter);
  const distanceUnit = useGameStore(s => s.distanceUnit);

  const [selectedLightId, setSelectedLightId] = useState<string | null>(null);
  const [placementMode, setPlacementMode] = useState<typeof LIGHT_PRESETS[0] | null>(null);

  // Derive lights directly from store  single source of truth
  const lights = useMemo(() => {
    return sprites
      .filter(s => s.layer === 'light' && (!activeTableId || (s as any).tableId === activeTableId || (s as any).table_id === activeTableId))
      .map(spriteToLight)
      .filter((l): l is Light => l !== null);
  }, [sprites, activeTableId]);

  // Track which light IDs are in WASM so we can add/remove incrementally
  const prevLightIdsRef = useRef<Set<string>>(new Set());

  // Single WASM sync effect  replaces the 3 competing ones
  useEffect(() => {
    if (!engine) return;

    const currentIds = new Set(lights.map(l => l.id));
    const prev = prevLightIdsRef.current;

    for (const light of lights) {
      if (!prev.has(light.id)) {
        try {
          engine.add_light(light.id, light.x, light.y);
          engine.set_light_color(light.id, light.color.r, light.color.g, light.color.b, light.color.a);
          engine.set_light_intensity(light.id, light.intensity);
          engine.set_light_radius(light.id, light.radius);
          if (!light.isOn) engine.toggle_light(light.id);
        } catch {}
      }
    }

    for (const id of prev) {
      if (!currentIds.has(id)) {
        try { engine.remove_light(id); } catch {}
      }
    }

    prevLightIdsRef.current = currentIds;
  }, [engine, lights]);

  // Handle light placed on canvas
  useEffect(() => {
    const handler = (e: Event) => {
      const { x, y, preset } = (e as CustomEvent).detail;
      if (!engine || !preset) return;

      if (preset.isMoving && preset.existingLightId) {
        try { engine.update_light_position(preset.existingLightId, x, y); } catch {}
        protocol?.moveSprite(preset.existingLightId, x, y);
        setPlacementMode(null);
        return;
      }

      const lightId = `${preset.name}_${Date.now()}`;
      const converter = useGameStore.getState().getUnitConverter();
      const radiusPx = converter.toPixels(converter.fromFeet(preset.radiusFt));
      const newLight: Light = { id: lightId, x, y, presetName: preset.name, color: preset.color, intensity: preset.intensity, radius: radiusPx, isOn: true };

      // Add to WASM immediately
      try {
        engine.add_light(lightId, x, y);
        engine.set_light_color(lightId, newLight.color.r, newLight.color.g, newLight.color.b, newLight.color.a);
        engine.set_light_intensity(lightId, newLight.intensity);
        engine.set_light_radius(lightId, newLight.radius);
      } catch {}

      prevLightIdsRef.current.add(lightId);
      // Add to Zustand immediately (optimistic) so WASM sync effect seeds prevLightIdsRef
      // and server confirmation doesn't reset the position if user moves it first
      if (activeTableId) {
        const spritePayload = lightToSprite(newLight, activeTableId);
        useGameStore.getState().addSprite({ ...spritePayload, texture: '__LIGHT__' } as any);
      }

      setSelectedLightId(lightId);
      setPlacementMode(null);

      if (protocol && activeTableId) {
        protocol.createSprite(lightToSprite(newLight, activeTableId));
      }
    };

    window.addEventListener('lightPlaced', handler);
    return () => window.removeEventListener('lightPlaced', handler);
  }, [engine, protocol, activeTableId]);

  const removeLight = (lightId: string) => {
    if (!engine) return;
    try { engine.remove_light(lightId); } catch {}
    if (selectedLightId === lightId) setSelectedLightId(null);
    // Optimistically remove from store so the panel updates immediately
    useGameStore.getState().removeSprite(lightId);
    protocol?.removeSprite(lightId);
  };

  const updateLightProperty = (lightId: string, property: keyof Light, value: any) => {
    if (!engine) return;
    const light = lights.find(l => l.id === lightId);
    if (!light) return;

    try {
      switch (property) {
        case 'color': engine.set_light_color(lightId, value.r, value.g, value.b, value.a); break;
        case 'intensity': engine.set_light_intensity(lightId, value); break;
        case 'radius': engine.set_light_radius(lightId, value); break;
        case 'isOn': engine.toggle_light(lightId); break;
        case 'x': case 'y': engine.update_light_position(lightId, property === 'x' ? value : light.x, property === 'y' ? value : light.y); break;
      }
    } catch {}

    const updated = { ...light, [property]: value };
    const spriteData = lightToSprite(updated, activeTableId ?? 'default_table');
    if (protocol) protocol.updateSprite(lightId, spriteData);
    useGameStore.getState().updateSprite(lightId, { x: updated.x, y: updated.y, metadata: spriteData.metadata } as any);
  };

  const startPlacingLight = (preset: typeof LIGHT_PRESETS[0]) => {
    setPlacementMode(preset);
    window.dispatchEvent(new CustomEvent('startLightPlacement', { detail: { preset } }));
  };

  const startMovingLight = (light: Light) => {
    const movePreset = { ...LIGHT_PRESETS[0], name: light.id, radius: light.radius, intensity: light.intensity, color: light.color, isMoving: true, existingLightId: light.id };
    setPlacementMode(movePreset as any);
    window.dispatchEvent(new CustomEvent('startLightPlacement', { detail: { preset: movePreset } }));
  };

  const toggleAllLights = () => {
    if (!engine) return;
    const allOn = lights.every(l => l.isOn);
    for (const l of lights) {
      if (l.isOn === allOn) try { engine.toggle_light(l.id); } catch {}
    }
    for (const l of lights) {
      const updated = { ...l, isOn: !allOn };
      protocol?.updateSprite(l.id, lightToSprite(updated, activeTableId ?? ''));
      useGameStore.getState().updateSprite(l.id, { metadata: lightToSprite(updated, activeTableId ?? '').metadata } as any);
    }
  };

  const clearAllLights = () => {
    if (!engine) return;
    for (const l of lights) {
      try { engine.remove_light(l.id); } catch {}
      protocol?.removeSprite(l.id);
    }
    setSelectedLightId(null);
  };

  const selectedLight = lights.find(l => l.id === selectedLightId);

  return (
    <div className={styles['lighting-panel']}>
      <div className={styles['panel-header']}>
        <h3>Lighting System</h3>
      </div>

      {placementMode && (
        <div className={styles['placement-indicator']}>
          <span>Placing: {placementMode.name}</span>
          <button aria-label="Cancel" onClick={() => { setPlacementMode(null); window.dispatchEvent(new CustomEvent('cancelLightPlacement')); }}>
            <X size={14} />
          </button>
        </div>
      )}

      <div className={styles['preset-section']}>
        <h4>Quick Place Lights</h4>
        <div className={styles['preset-buttons']}>
          {LIGHT_PRESETS.map((preset) => (
            <button
              key={preset.name}
              className={styles['preset-button']}
              onClick={() => startPlacingLight(preset)}
              style={{
                background: `radial-gradient(circle, rgba(${preset.color.r * 255}, ${preset.color.g * 255}, ${preset.color.b * 255}, 0.3), rgba(${preset.color.r * 255}, ${preset.color.g * 255}, ${preset.color.b * 255}, 0))`,
                border: `2px solid rgba(${preset.color.r * 255}, ${preset.color.g * 255}, ${preset.color.b * 255}, 0.8)`,
              }}
              title={`${preset.name} — ${preset.radiusFt} ft • I:${preset.intensity}`}
            >
              <preset.Icon size={16} />
              <span>{preset.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles['ambient-controls']}>
        <h4>Ambient Lighting</h4>
        <label htmlFor="ambient-light">Ambient Light: {(ambientLight * 100).toFixed(0)}%</label>
        <input
          id="ambient-light"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={ambientLight}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            setAmbientLight(v);
            try { (engine as any)?.set_ambient_light(v); } catch {}
          }}
        />
      </div>

      <div className={styles['light-controls']}>
        <button onClick={toggleAllLights} disabled={lights.length === 0}>
          {lights.every(l => l.isOn) ? 'Turn Off All' : 'Turn On All'}
        </button>
        <button onClick={clearAllLights} disabled={lights.length === 0}>
          <Trash2 size={14} /> Clear All
        </button>
      </div>

      <div className={styles['light-list']}>
        <h4>Lights ({lights.length})</h4>
        {lights.length === 0 ? (
          <p className={styles['empty-message']}>No lights placed</p>
        ) : (
          lights.map(light => {
            const Preset = LIGHT_PRESETS.find(p => p.name === light.presetName);
            const Icon = Preset?.Icon ?? Lightbulb;
            return (
              <div
                key={light.id}
                className={`${styles['light-item']} ${selectedLightId === light.id ? styles.selected : ''}`}
                onClick={() => setSelectedLightId(light.id)}
              >
                <div className={styles['light-header']}>
                  <span className={styles['light-name']}>
                    <Icon size={14} /> {light.presetName ?? light.id}
                  </span>
                  <div className={styles['light-actions']}>
                    <button title="Move" onClick={(e) => { e.stopPropagation(); startMovingLight(light); }}>
                      <MoveHorizontal size={14} />
                    </button>
                    <button
                      title="Toggle"
                      className={styles[light.isOn ? 'on' : 'off']}
                      onClick={(e) => { e.stopPropagation(); updateLightProperty(light.id, 'isOn', !light.isOn); }}
                    >
                      <Sun size={14} />
                    </button>
                    <button title="Remove" onClick={(e) => { e.stopPropagation(); removeLight(light.id); }}>
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <div className={styles['light-preview']}>
                  <div
                    className={styles['color-indicator']}
                    style={{
                      backgroundColor: `rgba(${Math.round(light.color.r * 255)}, ${Math.round(light.color.g * 255)}, ${Math.round(light.color.b * 255)}, ${light.color.a})`,
                      opacity: light.intensity,
                    }}
                  />
                  <span className={styles['light-stats']}>{getUnitConverter().toUnits(light.radius).toFixed(0)} {distanceUnit} • I:{light.intensity.toFixed(2)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {selectedLight && (
        <div className={styles['light-properties']}>
          <h4>Properties: {selectedLight.id}</h4>

          <div className={styles['property-group']}>
            <label>Position</label>
            <div className={styles['position-controls']}>
              <input type="number" placeholder="X" value={selectedLight.x} onChange={(e) => updateLightProperty(selectedLight.id, 'x', parseFloat(e.target.value) || 0)} />
              <input type="number" placeholder="Y" value={selectedLight.y} onChange={(e) => updateLightProperty(selectedLight.id, 'y', parseFloat(e.target.value) || 0)} />
            </div>
          </div>

          <div className={styles['property-group']}>
            <label>Color</label>
            <div className={styles['color-controls']}>
              <input
                type="color"
                value={`#${Math.round(selectedLight.color.r * 255).toString(16).padStart(2, '0')}${Math.round(selectedLight.color.g * 255).toString(16).padStart(2, '0')}${Math.round(selectedLight.color.b * 255).toString(16).padStart(2, '0')}`}
                onChange={(e) => {
                  const h = e.target.value;
                  updateLightProperty(selectedLight.id, 'color', {
                    r: parseInt(h.slice(1, 3), 16) / 255,
                    g: parseInt(h.slice(3, 5), 16) / 255,
                    b: parseInt(h.slice(5, 7), 16) / 255,
                    a: selectedLight.color.a,
                  });
                }}
              />
            </div>
          </div>

          <div className={styles['property-group']}>
            <label>Intensity: {selectedLight.intensity.toFixed(2)}</label>
            <input type="range" min="0" max="2" step="0.01" value={selectedLight.intensity} onChange={(e) => updateLightProperty(selectedLight.id, 'intensity', parseFloat(e.target.value))} />
          </div>

          <div className={styles['property-group']}>
            {(() => {
              const conv = getUnitConverter();
              const radiusUnits = conv.toUnits(selectedLight.radius);
              return (
                <>
                  <label>Radius: {radiusUnits.toFixed(0)} {distanceUnit}</label>
                  <input
                    type="range"
                    min="5"
                    max="300"
                    step="5"
                    value={radiusUnits}
                    onChange={(e) => {
                      const px = conv.toPixels(parseFloat(e.target.value));
                      updateLightProperty(selectedLight.id, 'radius', px);
                    }}
                  />
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
