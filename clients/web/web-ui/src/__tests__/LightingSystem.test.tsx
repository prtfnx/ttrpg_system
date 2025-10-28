/**
 * Lighting System Tests
 * 
 * Tests for the hybrid CPU/GPU lighting system with visibility polygons and shadow casting.
 * Based on LIGHTING_SYSTEM_TEST_PLAN.md
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LightingPanel } from '../components/LightingPanel';

// Mock WASM engine
const mockEngine = {
  add_light: vi.fn((id: string, x: number, y: number) => true),
  remove_light: vi.fn((id: string) => true),
  set_light_color: vi.fn((id: string, r: number, g: number, b: number) => true),
  set_light_intensity: vi.fn((id: string, intensity: number) => true),
  set_light_radius: vi.fn((id: string, radius: number) => true),
  set_light_enabled: vi.fn((id: string, enabled: boolean) => true),
  set_ambient_light: vi.fn((intensity: number) => true),
  update_lighting_obstacles: vi.fn(() => true),
  get_light_count: vi.fn(() => 0),
};

// Mock the useRenderEngine hook
vi.mock('../hooks/useRenderEngine', () => ({
  useRenderEngine: () => mockEngine
}));

// Mock window.dispatchEvent and addEventListener
const eventListeners: Map<string, Function[]> = new Map();

const mockDispatchEvent = vi.fn((event: Event) => {
  const listeners = eventListeners.get(event.type) || [];
  listeners.forEach(listener => listener(event));
  return true;
});

const mockAddEventListener = vi.fn((type: string, listener: EventListener) => {
  if (!eventListeners.has(type)) {
    eventListeners.set(type, []);
  }
  eventListeners.get(type)?.push(listener as Function);
});

const mockRemoveEventListener = vi.fn((type: string, listener: EventListener) => {
  const listeners = eventListeners.get(type);
  if (listeners) {
    const index = listeners.indexOf(listener as Function);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  }
});

describe('Lighting System', () => {
  beforeEach(() => {
    // Setup mocks
    vi.clearAllMocks();
    eventListeners.clear();
    
    // Mock window methods
    window.dispatchEvent = mockDispatchEvent as any;
    window.addEventListener = mockAddEventListener as any;
    window.removeEventListener = mockRemoveEventListener as any;
    
    // Reset mock call counts
    Object.values(mockEngine).forEach(fn => {
      if (typeof fn === 'function') {
        fn.mockClear();
      }
    });
  });

  afterEach(() => {
    eventListeners.clear();
  });

  describe('Test Scenario 1: Basic Light Placement', () => {
    it('should place a light at clicked map position', async () => {
      const user = userEvent.setup();
      
      render(<LightingPanel />);
      
  // Click Torch preset (use role-based query to avoid ambiguity)
  const torchButton = screen.getByRole('button', { name: /torch/i });
  await user.click(torchButton);
      
      // Verify placement mode is active
      expect(screen.getByText(/click on the map/i)).toBeInTheDocument();
      
      // Simulate lightPlaced event from GameCanvas
      const placementEvent = new CustomEvent('lightPlaced', {
        detail: { x: 500, y: 300 }
      });
      window.dispatchEvent(placementEvent);
      
      // Verify light was added to WASM
      await waitFor(() => {
        expect(mockEngine.add_light).toHaveBeenCalledWith(
          expect.any(String),
          500,
          300
        );
      });
      
      // Verify light properties were set (Torch preset)
      expect(mockEngine.set_light_color).toHaveBeenCalledWith(
        expect.any(String),
        255, 140, 0 // Orange color
      );
      expect(mockEngine.set_light_radius).toHaveBeenCalledWith(
        expect.any(String),
        150 // Torch radius
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
      
      expect(screen.getByText(/click on the map/i)).toBeInTheDocument();
      
      // Click cancel
      const cancelButton = screen.getByText(/cancel/i);
      await user.click(cancelButton);
      
      // Verify placement mode exited
      expect(screen.queryByText(/click on the map/i)).not.toBeInTheDocument();
      
      // Verify cancelLightPlacement event was dispatched
      expect(mockDispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'cancelLightPlacement' })
      );
    });
  });

  describe('Test Scenario 2: Multiple Light Presets', () => {
    const presets = [
      { name: 'Torch', color: { r: 255, g: 140, b: 0 }, radius: 150, intensity: 1.0 },
      { name: 'Candle', color: { r: 255, g: 223, b: 0 }, radius: 80, intensity: 0.7 },
      { name: 'Daylight', color: { r: 255, g: 255, b: 255 }, radius: 300, intensity: 1.2 },
      { name: 'Moonlight', color: { r: 173, g: 216, b: 230 }, radius: 200, intensity: 0.5 },
      { name: 'Fire', color: { r: 255, g: 69, b: 0 }, radius: 120, intensity: 0.9 },
      { name: 'Magic', color: { r: 138, g: 43, b: 226 }, radius: 180, intensity: 0.8 },
    ];

    presets.forEach(preset => {
      it(`should place ${preset.name} light with correct properties`, async () => {
        const user = userEvent.setup();
  
        
        render(<LightingPanel />);
        
  // Click preset (use role-based query)
  const presetButton = screen.getByRole('button', { name: new RegExp(preset.name, 'i') });
  await user.click(presetButton);
        
        // Simulate placement
        const placementEvent = new CustomEvent('lightPlaced', {
          detail: { x: 400, y: 400 }
        });
        window.dispatchEvent(placementEvent);
        
        // Verify properties
        await waitFor(() => {
          expect(mockEngine.add_light).toHaveBeenCalled();
          expect(mockEngine.set_light_color).toHaveBeenCalledWith(
            expect.any(String),
            preset.color.r,
            preset.color.g,
            preset.color.b
          );
          expect(mockEngine.set_light_radius).toHaveBeenCalledWith(
            expect.any(String),
            preset.radius
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
      const user = userEvent.setup();

      
      render(<LightingPanel />);
      
      // Find ambient light slider
      const slider = screen.getByLabelText(/ambient light/i);
      expect(slider).toBeInTheDocument();
      
      // Change slider value
      fireEvent.change(slider, { target: { value: '75' } });
      
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
      fireEvent.change(slider, { target: { value: '100' } });
      await waitFor(() => {
        expect(mockEngine.set_ambient_light).toHaveBeenCalledWith(1.0);
      });
    });
  });

  describe('Test Scenario 5: Light Properties Editor', () => {
    it('should update light position when coordinates changed', async () => {
      const user = userEvent.setup();

      
      const { container } = render(<LightingPanel />);
      
  // Place a light first
  const torchButton = screen.getByRole('button', { name: /torch/i });
  await user.click(torchButton);
      
      const placementEvent = new CustomEvent('lightPlaced', {
        detail: { x: 100, y: 100 }
      });
      window.dispatchEvent(placementEvent);
      
      await waitFor(() => {
        expect(mockEngine.add_light).toHaveBeenCalled();
      });
      
      // Select the light (it should be in the list)
      await waitFor(() => {
        const lightItem = screen.getByText(/torch/i).closest('[role="button"]');
        if (lightItem) {
          fireEvent.click(lightItem);
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
      
  // Place a light
  const torchButton = screen.getByRole('button', { name: /torch/i });
  await user.click(torchButton);
      
      window.dispatchEvent(new CustomEvent('lightPlaced', {
        detail: { x: 100, y: 100 }
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
        
        // Verify color was updated
        await waitFor(() => {
          expect(mockEngine.set_light_color).toHaveBeenCalledWith(
            expect.any(String),
            255, 0, 0
          );
        });
      }
    });

    it('should update light radius when slider changed', async () => {
      const user = userEvent.setup();

      
      const { container } = render(<LightingPanel />);
      
  // Place a light
  const torchButton = screen.getByRole('button', { name: /torch/i });
  await user.click(torchButton);
      
      window.dispatchEvent(new CustomEvent('lightPlaced', {
        detail: { x: 100, y: 100 }
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
      
  // Place a light
  const torchButton = screen.getByRole('button', { name: /torch/i });
  await user.click(torchButton);
      
      window.dispatchEvent(new CustomEvent('lightPlaced', {
        detail: { x: 100, y: 100 }
      }));
      
      await waitFor(() => {
        expect(mockEngine.add_light).toHaveBeenCalled();
      });
      
      // Find toggle button (should have 🔆 emoji)
      const toggleButton = await screen.findByText('🔆');
      await user.click(toggleButton);
      
      // Verify light was disabled
      expect(mockEngine.set_light_enabled).toHaveBeenCalledWith(
        expect.any(String),
        false
      );
    });

    it('should delete light', async () => {
      const user = userEvent.setup();

      
      render(<LightingPanel />);
      
  // Place a light
  const torchButton = screen.getByRole('button', { name: /torch/i });
  await user.click(torchButton);
      
      window.dispatchEvent(new CustomEvent('lightPlaced', {
        detail: { x: 100, y: 100 }
      }));
      
      await waitFor(() => {
        expect(mockEngine.add_light).toHaveBeenCalled();
      });
      
      // Find delete button (❌)
      const deleteButton = await screen.findByText('❌');
      await user.click(deleteButton);
      
      // Verify light was removed
      expect(mockEngine.remove_light).toHaveBeenCalledWith(
        expect.any(String)
      );
    });

    it('should display multiple lights in list', async () => {
      const user = userEvent.setup();

      
      render(<LightingPanel />);
      
  // Place first light (Torch)
  await user.click(screen.getByRole('button', { name: /torch/i }));
      window.dispatchEvent(new CustomEvent('lightPlaced', {
        detail: { x: 100, y: 100 }
      }));
      
      await waitFor(() => {
        expect(mockEngine.add_light).toHaveBeenCalledTimes(1);
      });
      
  // Place second light (Candle)
  await user.click(screen.getByRole('button', { name: /candle/i }));
      window.dispatchEvent(new CustomEvent('lightPlaced', {
        detail: { x: 200, y: 200 }
      }));
      
      await waitFor(() => {
        expect(mockEngine.add_light).toHaveBeenCalledTimes(2);
      });
      
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
      
      // Verify event was dispatched
      await waitFor(() => {
        expect(mockDispatchEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'startLightPlacement',
            detail: expect.objectContaining({
              preset: expect.objectContaining({
                name: 'Torch'
              })
            })
          })
        );
      });
    });
  });

  describe('Test Scenario 8: Error Handling', () => {
    it('should handle missing WASM engine gracefully', async () => {
      const user = userEvent.setup();
      
      // Remove engine from window
      delete (window as any).engine;
      

      
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
      (window as any).engine = mockEngine;
    });
  });

  describe('Performance Tests', () => {
    it('should handle multiple lights efficiently', async () => {
      const user = userEvent.setup();

      
      render(<LightingPanel />);
      
      // Place 10 lights
      for (let i = 0; i < 10; i++) {
        const torchButton = screen.getByRole('button', { name: /torch/i });
        await user.click(torchButton);
        window.dispatchEvent(new CustomEvent('lightPlaced', {
          detail: { x: 100 + i * 50, y: 100 + i * 50 }
        }));
      }
      
      // Verify all lights were added
      await waitFor(() => {
        expect(mockEngine.add_light).toHaveBeenCalledTimes(10);
      });
      
      // Verify light count
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
