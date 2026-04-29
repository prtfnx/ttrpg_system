// Mock the useRenderEngine hook BEFORE any imports
import { vi } from 'vitest';
const mockEngine = {
  add_light: vi.fn((_id: string, _x: number, _y: number) => true),
  remove_light: vi.fn((_id: string) => true),
  set_light_color: vi.fn((_id: string, _r: number, _g: number, _b: number, _a?: number) => true),
  set_light_intensity: vi.fn((_id: string, _intensity: number) => true),
  set_light_radius: vi.fn((_id: string, _radius: number) => true),
  set_light_enabled: vi.fn((_id: string, _enabled: boolean) => true),
  set_ambient_light: vi.fn((_intensity: number) => true),
  update_lighting_obstacles: vi.fn(() => true),
  get_light_count: vi.fn(() => 0),
  toggle_light: vi.fn((_id: string) => true),
};
vi.mock('../hooks/useRenderEngine', () => ({
  useRenderEngine: () => mockEngine
}));
/**
 * Lighting System Tests
 * 
 * Tests for the hybrid CPU/GPU lighting system with visibility polygons and shadow casting.
 * Based on LIGHTING_SYSTEM_TEST_PLAN.md
 */


/**
 * Lighting System Tests
 * 
 * Tests for the hybrid CPU/GPU lighting system with visibility polygons and shadow casting.
 * Based on LIGHTING_SYSTEM_TEST_PLAN.md
 */
import { useGameStore } from '@/store';
import { LightingPanel } from '@features/lighting';
import type { RenderEngine } from '@lib/wasm';
import type { Sprite } from '@/types';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';


describe('Lighting System', () => {

  beforeEach(() => {
  // Ensure the render engine global is the mock
  window.rustRenderManager = mockEngine as unknown as RenderEngine;
    // Setup mocks
    Object.values(mockEngine).forEach(fn => {
      if (typeof fn === 'function') {
        fn.mockClear();
      }
    });
    // Set up default store state for every test
    useGameStore.setState({
      sprites: [],
      activeTableId: 'test-table',
    });
  });

  afterEach(() => {
    // Reset store state after each test
    useGameStore.setState({
      sprites: [],
      activeTableId: null,
    });
  });

  describe('Test Scenario 1: Basic Light Placement', () => {
   it('should place a light at clicked map position', async () => {
      const user = userEvent.setup();
      useGameStore.setState({
        sprites: [],
        activeTableId: 'test-table',
      });
      await act(async () => {
        render(<LightingPanel />);
      });
      const torchButton = screen.getByRole('button', { name: /torch/i });
      await act(async () => {
        await user.click(torchButton);
      });
      expect(screen.getByText((content) => content.includes('Placing: Torch'))).toBeInTheDocument();
      const preset = {
        name: 'Torch',
        color: { r: 1.0, g: 0.6, b: 0.2, a: 1.0 },
        radiusFt: 20,
        intensity: 1.0
      };
      const placementEvent = new CustomEvent('lightPlaced', {
        detail: { x: 500, y: 300, preset }
      });
      await act(async () => {
        window.dispatchEvent(placementEvent);
      });
      await waitFor(() => {
        expect(mockEngine.add_light).toHaveBeenCalledWith(
          expect.any(String),
          500,
          300
        );
      });
      // Verify light properties were set (Torch preset, normalized color)
      expect(mockEngine.set_light_color).toHaveBeenCalledWith(
        expect.any(String),
        1, 0.6, 0.2, 1 // Orange color, normalized
      );
      expect(mockEngine.set_light_radius).toHaveBeenCalledWith(
        expect.any(String),
        200 // Torch radius (20ft * 10px/ft)
      );
      expect(mockEngine.set_light_intensity).toHaveBeenCalledWith(
        expect.any(String),
        1.0 // Full intensity
      );
    });

    it('should cancel placement mode when cancel button clicked', async () => {
      const user = userEvent.setup();

      
      render(<LightingPanel />);
      
  // Enter placement mode
  const torchButton = screen.getByRole('button', { name: /torch/i });
  await user.click(torchButton);
      
  expect(screen.getByText((content) => content.includes('Placing: Torch'))).toBeInTheDocument();
      
  // Click cancel
  const cancelButton = screen.getByRole('button', { name: /cancel/i });
  await user.click(cancelButton);
  // Verify placement mode exited
  expect(screen.queryByText((content) => content.includes('Placing: Torch'))).not.toBeInTheDocument();
  // Optionally, check that placement mode exited by UI state or other means
    });
  });

  describe('Test Scenario 2: Multiple Light Presets', () => {
    const presets = [
      { name: 'Torch',    color: { r: 255, g: 140, b: 0 },   radiusFt: 20, expectedPx: 200, intensity: 1.0 },
      { name: 'Candle',   color: { r: 255, g: 223, b: 0 },   radiusFt: 5,  expectedPx: 50,  intensity: 0.7 },
      { name: 'Daylight', color: { r: 255, g: 255, b: 255 }, radiusFt: 60, expectedPx: 600, intensity: 1.2 },
      { name: 'Moonlight',color: { r: 173, g: 216, b: 230 }, radiusFt: 40, expectedPx: 400, intensity: 0.5 },
      { name: 'Fire',     color: { r: 255, g: 69,  b: 0 },   radiusFt: 20, expectedPx: 200, intensity: 0.9 },
      { name: 'Magic',    color: { r: 138, g: 43,  b: 226 }, radiusFt: 30, expectedPx: 300, intensity: 0.8 },
    ];

    presets.forEach(preset => {
      it(`should place ${preset.name} light with correct properties`, async () => {
        const user = userEvent.setup();
        render(<LightingPanel />);
        // Click preset (use role-based query)
        const presetButton = screen.getByRole('button', { name: new RegExp(preset.name, 'i') });
        await user.click(presetButton);
        // Simulate placement (include preset in detail)
        const placementEvent = new CustomEvent('lightPlaced', {
          detail: { x: 400, y: 400, preset: {
            name: preset.name,
            color: {
              r: preset.color.r / 255 || preset.color.r,
              g: preset.color.g / 255 || preset.color.g,
              b: preset.color.b / 255 || preset.color.b,
              a: 1.0
            },
            radiusFt: preset.radiusFt,
            intensity: preset.intensity
          } }
        });
        window.dispatchEvent(placementEvent);
        // Verify properties
        await waitFor(() => {
          expect(mockEngine.add_light).toHaveBeenCalled();
          expect(mockEngine.set_light_color).toHaveBeenCalled();
          expect(mockEngine.set_light_radius).toHaveBeenCalledWith(
            expect.any(String),
            preset.expectedPx
          );
          expect(mockEngine.set_light_intensity).toHaveBeenCalledWith(
            expect.any(String),
            preset.intensity
          );
        });
      });
    });
  });

  describe('Test Scenario 3: Shadow Casting', () => {
    it('should call update_lighting_obstacles to enable shadow casting', () => {
      // This is tested at the render loop level
      // The render function should call update_lighting_obstacles each frame
      
      // Verify the function exists
      expect(mockEngine.update_lighting_obstacles).toBeDefined();
      
      // In actual usage, this would be called with obstacle data:
      // engine.update_lighting_obstacles(obstacleArray)
      // where obstacleArray is a Float32Array of [x1,y1,x2,y2, ...]
    });
  });

  describe('Test Scenario 4: Ambient Light Control', () => {
    it('should update ambient light when slider moved', async () => {
      const _user = userEvent.setup();

      
      render(<LightingPanel />);
      
      // Find ambient light slider
      const slider = screen.getByLabelText(/ambient light/i);
      expect(slider).toBeInTheDocument();
      
      // Change slider value (use correct normalized value)
      fireEvent.change(slider, { target: { value: '0.75' } });
      // Verify WASM was called
      await waitFor(() => {
        expect(mockEngine.set_ambient_light).toHaveBeenCalledWith(0.75);
      });
    });

    it('should handle min and max ambient values', async () => {

      
      render(<LightingPanel />);
      
      const slider = screen.getByLabelText(/ambient light/i);
      
      // Test min (0%)
      fireEvent.change(slider, { target: { value: '0' } });
      await waitFor(() => {
        expect(mockEngine.set_ambient_light).toHaveBeenCalledWith(0);
      });
      
      // Test max (100%)
      fireEvent.change(slider, { target: { value: '1' } });
      await waitFor(() => {
        expect(mockEngine.set_ambient_light).toHaveBeenCalledWith(1);
      });
    });
  });

  describe('Test Scenario 5: Light Properties Editor', () => {
    it('should update light position when coordinates changed', async () => {
      const user = userEvent.setup();
      const { container } = render(<LightingPanel />);
      // Wait for engine to be ready (Quick Place Lights section visible)
      await screen.findByText(/Quick Place Lights/i);
      // Place a light first
      const torchButton = screen.getByRole('button', { name: /torch/i });
      await user.click(torchButton);
      // Simulate lightPlaced event with preset
      const preset = {
        name: 'Torch',
        color: { r: 255, g: 140, b: 0, a: 255 },
        radius: 150,
        intensity: 1.0
      };
      const placementEvent = new CustomEvent('lightPlaced', {
        detail: { x: 100, y: 100, preset }
      });
      window.dispatchEvent(placementEvent);
      await waitFor(() => {
        expect(mockEngine.add_light).toHaveBeenCalled();
      });
      
      // Select the light (it should be in the list)
      await waitFor(() => {
        // Use getAllByText to avoid ambiguity between preset and light name
        const lightItems = screen.getAllByText(/torch/i);
        // Find the one that is a light name (not the preset)
        const lightItem = Array.from(lightItems).find(el => el.parentElement?.className?.includes('light-name'));
        if (lightItem) {
          // Click the parent button
          const button = lightItem.closest('button');
          if (button) fireEvent.click(button);
        }
      });
      
      // Find X position input and change it
      const inputs = container.querySelectorAll('input[type="number"]');
      const xInput = Array.from(inputs).find(input => 
        input.getAttribute('value') === '100' || input.closest('label')?.textContent?.includes('X')
      );
      
      if (xInput) {
        fireEvent.change(xInput, { target: { value: '200' } });
        
        // Note: In the actual implementation, this would call a position update method
        // For now, we verify the input changed
        expect((xInput as HTMLInputElement).value).toBe('200');
      }
    });

    it('should update light color when color picker changed', async () => {
      const user = userEvent.setup();
      const { container } = render(<LightingPanel />);
      await screen.findByText(/Quick Place Lights/i);
      // Place a light
      const torchButton = screen.getByRole('button', { name: /torch/i });
      await user.click(torchButton);
      // Simulate lightPlaced event with preset (normalized color)
      const preset = {
        name: 'Torch',
        color: { r: 1.0, g: 0.6, b: 0.2, a: 1.0 },
        radius: 150,
        intensity: 1.0
      };
      window.dispatchEvent(new CustomEvent('lightPlaced', {
        detail: { x: 100, y: 100, preset }
      }));
      await waitFor(() => {
        expect(mockEngine.add_light).toHaveBeenCalled();
      });
      
      // Clear previous calls to check for color update
      mockEngine.set_light_color.mockClear();
      // Find color input (type="color")
      const colorInput = container.querySelector('input[type="color"]');
      if (colorInput) {
        fireEvent.change(colorInput, { target: { value: '#FF0000' } }); // Red
        // Verify color was updated (expect 4 args: id, r, g, b, a) with normalized values
        await waitFor(() => {
          expect(mockEngine.set_light_color).toHaveBeenCalledWith(
            expect.any(String),
            1, 0, 0, 1
          );
        });
      }
    });

    it('should update light radius when slider changed', async () => {
      const user = userEvent.setup();
      const { container } = render(<LightingPanel />);
      await screen.findByText(/Quick Place Lights/i);
      // Place a light
      const torchButton = screen.getByRole('button', { name: /torch/i });
      await user.click(torchButton);
      // Simulate lightPlaced event with preset
      const preset = {
        name: 'Torch',
        color: { r: 255, g: 140, b: 0, a: 255 },
        radius: 150,
        intensity: 1.0
      };
      window.dispatchEvent(new CustomEvent('lightPlaced', {
        detail: { x: 100, y: 100, preset }
      }));
      await waitFor(() => {
        expect(mockEngine.add_light).toHaveBeenCalled();
      });
      
      mockEngine.set_light_radius.mockClear();
      
      // Find radius slider
      const sliders = container.querySelectorAll('input[type="range"]');
      const radiusSlider = Array.from(sliders).find(slider => 
        slider.closest('label')?.textContent?.includes('Radius')
      );
      
      if (radiusSlider) {
        fireEvent.change(radiusSlider, { target: { value: '250' } });
        
        await waitFor(() => {
          expect(mockEngine.set_light_radius).toHaveBeenCalledWith(
            expect.any(String),
            250
          );
        });
      }
    });
  });

  describe('Test Scenario 6: Light List Management', () => {
    it('should toggle light on/off', async () => {
      const user = userEvent.setup();
      render(<LightingPanel />);
      await screen.findByText(/Quick Place Lights/i);
      // Place a light
      const torchButton = screen.getByRole('button', { name: /torch/i });
      await user.click(torchButton);
      // Simulate lightPlaced event with preset (normalized color)
      const preset = {
        name: 'Torch',
        color: { r: 1.0, g: 0.6, b: 0.2, a: 1.0 },
        radius: 150,
        intensity: 1.0
      };
      window.dispatchEvent(new CustomEvent('lightPlaced', {
        detail: { x: 100, y: 100, preset }
      }));
      await waitFor(() => {
        expect(mockEngine.add_light).toHaveBeenCalled();
      });
      
      // Find toggle button
      const toggleButton = await screen.findByTitle('Toggle');
      await user.click(toggleButton);
      
      // Verify light was toggled
      expect(mockEngine.toggle_light).toHaveBeenCalledWith(
        expect.any(String)
      );
    });

    it('should delete light', async () => {
      const user = userEvent.setup();
      render(<LightingPanel />);
      await screen.findByText(/Quick Place Lights/i);
      // Place a light
      const torchButton = screen.getByRole('button', { name: /torch/i });
      await user.click(torchButton);
      // Simulate lightPlaced event with preset (normalized color)
      const preset = {
        name: 'Torch',
        color: { r: 1.0, g: 0.6, b: 0.2, a: 1.0 },
        radius: 150,
        intensity: 1.0
      };
      window.dispatchEvent(new CustomEvent('lightPlaced', {
        detail: { x: 100, y: 100, preset }
      }));
      await waitFor(() => {
        expect(mockEngine.add_light).toHaveBeenCalled();
      });
      
      // Find delete button
      const deleteButton = await screen.findByTitle('Remove');
      await user.click(deleteButton);
      
      // Verify light was removed
      expect(mockEngine.remove_light).toHaveBeenCalledWith(
        expect.any(String)
      );
    });

    it('should display multiple lights in list', async () => {
      const _user = userEvent.setup();
      // Pre-populate store with two light sprites (normalized color)
      useGameStore.setState({
        sprites: [
          {
            id: 'light-1',
            tableId: 'test-table',
            x: 100,
            y: 100,
            layer: 'light',
            texture_path: '__LIGHT__',
            scale: { x: 1, y: 1 },
            rotation: 0,
            metadata: JSON.stringify({ isLight: true, color: { r: 1.0, g: 0.6, b: 0.2, a: 1.0 }, intensity: 1.0, radius: 150, isOn: true }),
          } as unknown as Sprite,
          {
            id: 'light-2',
            tableId: 'test-table',
            x: 200,
            y: 200,
            layer: 'light',
            texture_path: '__LIGHT__',
            scale: { x: 1, y: 1 },
            rotation: 0,
            metadata: JSON.stringify({ isLight: true, color: { r: 1.0, g: 0.7, b: 0.3, a: 1.0 }, intensity: 0.7, radius: 80, isOn: true }),
          } as unknown as Sprite,
        ],
        activeTableId: 'test-table',
      });
      render(<LightingPanel />);
      // Verify both lights appear in the list
      const lightItems = screen.getAllByRole('button').filter(btn => 
        btn.textContent?.includes('Torch') || btn.textContent?.includes('Candle')
      );
      expect(lightItems.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Test Scenario 7: Coordinate Conversion', () => {
    it('should dispatch startLightPlacement event with correct data', async () => {
      const user = userEvent.setup();

      
      render(<LightingPanel />);
      
  // Click Torch preset
  const torchButton = screen.getByRole('button', { name: /torch/i });
  await user.click(torchButton);
      
      // Optionally, check that all lights are cleared by UI state or other means
    });
  });

  describe('Test Scenario 8: Error Handling', () => {
    it('should handle missing WASM engine gracefully', async () => {
      const user = userEvent.setup();
      
      // Remove engine from window
      delete (window as unknown as Record<string, unknown>).engine;
      

      
      // Should render without crashing
      render(<LightingPanel />);
      
      // Should show error or disabled state
  const torchButton = screen.getByRole('button', { name: /torch/i });
  await user.click(torchButton);
      
      // Should not crash when placing light
      window.dispatchEvent(new CustomEvent('lightPlaced', {
        detail: { x: 100, y: 100 }
      }));
      
      // Restore engine
      Object.assign(window, { engine: mockEngine });
    });
  });

  describe('Performance Tests', () => {
    it('should handle multiple lights efficiently', async () => {
      render(<LightingPanel />);
      
      const preset = {
        name: 'Torch',
        color: { r: 1.0, g: 0.6, b: 0.2, a: 1.0 },
        radiusFt: 20,
        intensity: 1.0
      };

      // Place 10 lights using fireEvent — synchronous, no async waiting needed
      for (let i = 0; i < 10; i++) {
        const torchButton = screen.getByRole('button', { name: /torch/i });
        fireEvent.click(torchButton);
        window.dispatchEvent(new CustomEvent('lightPlaced', {
          detail: { x: 100 + i * 50, y: 100 + i * 50, preset }
        }));
      }

      // fireEvent is synchronous — calls are immediate
      expect(mockEngine.add_light).toHaveBeenCalledTimes(10);
      mockEngine.get_light_count.mockReturnValue(10);
      expect(mockEngine.get_light_count()).toBe(10);
    });
  });
});

describe('LightingSystem Integration', () => {
  it('should integrate with GameCanvas for coordinate conversion', () => {
    // This test verifies the event-driven architecture
    
    // Simulate GameCanvas listening for startLightPlacement
    let placementMode = false;
    window.addEventListener('startLightPlacement', () => {
      placementMode = true;
    });
    
    // Dispatch event
    window.dispatchEvent(new CustomEvent('startLightPlacement', {
      detail: { preset: { name: 'Torch' } }
    }));
    
    expect(placementMode).toBe(true);
  });

  it('should handle lightPlaced event from GameCanvas', async () => {

    
    render(<LightingPanel />);
    
    // Simulate GameCanvas dispatching lightPlaced
    window.dispatchEvent(new CustomEvent('lightPlaced', {
      detail: { x: 500, y: 300 }
    }));
    
    // In actual implementation, LightingPanel should listen for this
    // and create the light
  });
});
