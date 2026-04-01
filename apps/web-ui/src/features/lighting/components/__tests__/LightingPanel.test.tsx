import { useGameStore } from '@/store';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LightingPanel } from '../LightingPanel';

// ---- render engine mock ----
const engineMock = {
  add_light: vi.fn(),
  remove_light: vi.fn(),
  set_light_color: vi.fn(),
  set_light_intensity: vi.fn(),
  set_light_radius: vi.fn(),
  toggle_light: vi.fn(),
  update_light_position: vi.fn(),
  set_ambient_light: vi.fn(),
};

vi.mock('@features/canvas', () => ({
  useRenderEngine: () => engineMock,
}));

// ---- protocol mock ----
const protocolMock = {
  createSprite: vi.fn(),
  removeSprite: vi.fn(),
  updateSprite: vi.fn(),
  moveSprite: vi.fn(),
};

vi.mock('@lib/api', () => ({
  useProtocol: () => ({ protocol: protocolMock }),
}));

// ---- helpers ----
function makeLight(overrides: Record<string, any> = {}) {
  return {
    id: 'torch_1',
    sprite_id: 'torch_1',
    layer: 'light',
    texture_path: '__LIGHT__',
    x: 100,
    y: 200,
    table_id: 'table-1',
    metadata: JSON.stringify({
      isLight: true,
      presetName: 'Torch',
      color: { r: 1, g: 0.6, b: 0.2, a: 1 },
      intensity: 1.0,
      radius: 150,
      isOn: true,
    }),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useGameStore.setState({ sprites: [], activeTableId: 'table-1', ambientLight: 1.0 } as any);
});

describe('LightingPanel', () => {
  describe('empty state', () => {
    it('shows "No lights placed" when no sprites exist', () => {
      render(<LightingPanel />);
      expect(screen.getByText(/no lights placed/i)).toBeInTheDocument();
    });

    it('shows all 6 preset buttons', () => {
      render(<LightingPanel />);
      for (const name of ['Torch', 'Candle', 'Daylight', 'Moonlight', 'Fire', 'Magic']) {
        expect(screen.getByRole('button', { name: new RegExp(name, 'i') })).toBeInTheDocument();
      }
    });

    it('shows light count 0 in header', () => {
      render(<LightingPanel />);
      expect(screen.getByText(/lights \(0\)/i)).toBeInTheDocument();
    });
  });

  describe('with lights in store', () => {
    beforeEach(() => {
      useGameStore.setState({ sprites: [makeLight() as any], activeTableId: 'table-1', ambientLight: 1.0 } as any);
    });

    it('shows light preset name in list', () => {
      render(<LightingPanel />);
      expect(screen.getByText(/lights \(1\)/i)).toBeInTheDocument();
    });

    it('does not show empty message', () => {
      render(<LightingPanel />);
      expect(screen.queryByText(/no lights placed/i)).not.toBeInTheDocument();
    });

    it('ignores sprites from other tables', () => {
      useGameStore.setState({ sprites: [makeLight({ table_id: 'other' }) as any] } as any);
      render(<LightingPanel />);
      expect(screen.getByText(/no lights placed/i)).toBeInTheDocument();
    });

    it('ignores sprites with wrong texture_path', () => {
      useGameStore.setState({ sprites: [makeLight({ texture_path: 'hero.png' }) as any] } as any);
      render(<LightingPanel />);
      expect(screen.getByText(/no lights placed/i)).toBeInTheDocument();
    });

    it('ignores sprites with isLight=false in metadata', () => {
      const bad = makeLight({ metadata: JSON.stringify({ isLight: false, presetName: 'X', color: {}, intensity: 1, radius: 1, isOn: true }) });
      useGameStore.setState({ sprites: [bad as any] } as any);
      render(<LightingPanel />);
      expect(screen.getByText(/no lights placed/i)).toBeInTheDocument();
    });
  });

  describe('light placement', () => {
    it('dispatches startLightPlacement when Torch preset is clicked', () => {
      const spy = vi.fn();
      window.addEventListener('startLightPlacement', spy);
      render(<LightingPanel />);
      fireEvent.click(screen.getByRole('button', { name: /torch/i }));
      expect(spy).toHaveBeenCalledOnce();
      expect((spy.mock.calls[0][0] as CustomEvent).detail.preset.name).toBe('Torch');
      window.removeEventListener('startLightPlacement', spy);
    });

    it('shows placement indicator after clicking preset', () => {
      render(<LightingPanel />);
      fireEvent.click(screen.getByRole('button', { name: /candle/i }));
      expect(screen.getByText(/placing.*candle/i)).toBeInTheDocument();
    });

    it('calls protocol.createSprite when lightPlaced event fires', () => {
      render(<LightingPanel />);
      fireEvent.click(screen.getByRole('button', { name: /torch/i }));
      window.dispatchEvent(new CustomEvent('lightPlaced', {
        detail: {
          x: 300, y: 400,
          preset: { name: 'Torch', radius: 150, intensity: 1.0, color: { r: 1, g: 0.6, b: 0.2, a: 1 } },
        },
      }));
      expect(protocolMock.createSprite).toHaveBeenCalledOnce();
      const arg = protocolMock.createSprite.mock.calls[0][0];
      expect(arg.layer).toBe('light');
      expect(arg.texture_path).toBe('__LIGHT__');
      expect(arg.x).toBe(300);
    });
  });

  describe('ambient lighting', () => {
    it('renders ambient slider', () => {
      render(<LightingPanel />);
      expect(screen.getByRole('slider', { name: /ambient/i })).toBeInTheDocument();
    });
  });
});
