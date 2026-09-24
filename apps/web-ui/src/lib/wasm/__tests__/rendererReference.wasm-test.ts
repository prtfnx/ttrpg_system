import { beforeAll, describe, expect, it } from 'vitest';
import initWasm, { RenderEngine } from '../generated/ttrpg_rust_core';
import { normalizeTableSnapshot } from '../tableSnapshot';

const REFERENCE_ENABLED = import.meta.env.VITE_RENDERER_REFERENCE === '1';

beforeAll(async () => {
  await initWasm({ module_or_path: new URL('../generated/ttrpg_rust_core_bg.wasm', import.meta.url) });
});

function percentile(sorted: number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

function summarize(samples: number[]) {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    samples: samples.length,
    meanMs: samples.reduce((sum, value) => sum + value, 0) / samples.length,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted.at(-1),
  };
}

function nextFrame(engine: RenderEngine): Promise<number> {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      const startedAt = performance.now();
      engine.render();
      resolve(performance.now() - startedAt);
    });
  });
}

async function createReferenceTexture(): Promise<HTMLImageElement> {
  const source = document.createElement('canvas');
  source.width = 4;
  source.height = 4;
  const context = source.getContext('2d');
  context?.fillRect(0, 0, 4, 4);
  const image = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Could not create the reference texture'));
  });
  image.src = source.toDataURL('image/png');
  await loaded;
  return image;
}

describe.skipIf(!REFERENCE_ENABLED)('renderer reference measurement', () => {
  it('prints the deterministic ordinary-scene reference without timing assertions', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    document.body.append(canvas);
    const engine = new RenderEngine(canvas);
    const tableId = '550e8400-e29b-41d4-a716-446655440099';
    const tokens: Record<string, unknown> = {};
    for (let index = 0; index < 100; index += 1) {
      tokens[`ordinary-${index}`] = {
        sprite_id: `ordinary-${index}`,
        texture_path: 'reference-texture',
        position: [((index * 97) % 1900) - 200, ((index * 53) % 1300) - 150],
        width: 24 + (index % 5) * 8,
        height: 24 + (index % 7) * 6,
        rotation: (index % 16) * Math.PI / 8,
      };
    }

    try {
      engine.load_texture('reference-texture', await createReferenceTexture());
      const snapshot = normalizeTableSnapshot({ table_data: {
        table_id: tableId,
        table_name: 'Ordinary reference fixture',
        width: 2000,
        height: 1400,
        scale: 1,
        grid_enabled: false,
        layers: { tokens },
      } });
      engine.handle_table_data(snapshot.renderer);

      for (let index = 0; index < 200; index += 1) {
        const x = ((index * 71) % 2000) - 250;
        const y = ((index * 43) % 1400) - 200;
        expect(engine.add_wall(JSON.stringify({
          wall_id: `ordinary-wall-${index}`,
          table_id: tableId,
          x1: x,
          y1: y,
          x2: x + 32 + (index % 9) * 7,
          y2: y + 24,
          blocks_light: true,
          blocks_sight: true,
        }))).toBe(true);
      }

      const sources = new Float32Array(12);
      for (let index = 0; index < 4; index += 1) {
        const x = 100 + ((index * 173) % 1600);
        const y = 100 + ((index * 107) % 1000);
        const radius = 160 + (index % 4) * 40;
        const id = `ordinary-light-${index}`;
        engine.add_light_for_table(id, x, y, tableId);
        engine.set_light_radius(id, radius);
        engine.set_light_intensity(id, 1);
        sources.set([x, y, radius], index * 3);
      }

      for (let frame = 0; frame < 120; frame += 1) await nextFrame(engine);
      const frameSamples: number[] = [];
      for (let frame = 0; frame < 300; frame += 1) frameSamples.push(await nextFrame(engine));

      for (let sample = 0; sample < 30; sample += 1) {
        engine.compute_sight_visibility_polygons(sources);
      }
      const visibilitySamples: number[] = [];
      for (let sample = 0; sample < 300; sample += 1) {
        const startedAt = performance.now();
        engine.compute_sight_visibility_polygons(sources);
        visibilitySamples.push(performance.now() - startedAt);
      }

      const gl = canvas.getContext('webgl2');
      const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info');
      console.info(`RENDERER_REFERENCE ${JSON.stringify({
        canvas: [canvas.width, canvas.height],
        scene: { sprites: 100, segments: 200, lights: 4 },
        warmupFrames: 120,
        frameCpu: summarize(frameSamples),
        sightVisibilityFourSources: summarize(visibilitySamples),
        diagnostics: engine.get_render_diagnostics(),
        webglVendor: gl && debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'unavailable',
        webglRenderer: gl && debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'unavailable',
      })}`);
      expect(frameSamples).toHaveLength(300);
    } finally {
      engine.free();
      canvas.remove();
    }
  }, 30_000);
});
