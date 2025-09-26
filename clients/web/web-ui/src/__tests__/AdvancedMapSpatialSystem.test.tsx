/**
 * Advanced Map and Spatial System Behavior Tests
 * Tests real map interaction, grid snapping, measurement tools, and spatial awareness
 * Focus: Real expected behavior for tactical TTRPG mapping
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

// Import actual components
import { LayerPanel } from '../components/LayerPanel';
import { MapPanel } from '../components/MapPanel';
import { ToolsPanel } from '../components/ToolsPanel';

describe('Advanced Map System - Tactical TTRPG Mapping', () => {
  const mockUserInfo = { 
    id: 1, 
    username: 'DM Mike', 
    role: 'dm' as const,
    permissions: ['manage_map', 'place_tokens', 'draw_shapes', 'manage_fog'] 
  };

  describe('Grid System and Snapping Mechanics', () => {
    it('should snap tokens to grid intersections when placed', async () => {
      render(<MapPanel />);
      
      // Place a character token at arbitrary position
      const characterToken = screen.getByTestId('draggable-token-wizard');
      
      // Drag to position that's not on grid (e.g., 127, 183)
      fireEvent.dragStart(characterToken);
      fireEvent.dragEnd(characterToken, {
        clientX: 127, // Should snap to 125 (middle of grid square)
        clientY: 183  // Should snap to 175
      });
      
      // Token position should be snapped to grid
      await waitFor(() => {
        const tokenElement = screen.getByTestId('token-wizard-position');
        expect(tokenElement).toHaveStyle('left: 125px; top: 175px');
      });
      
      // Grid coordinates should be displayed
      expect(screen.getByTestId('token-wizard-grid-coords')).toHaveTextContent('C4');
    });

    it('should allow precise positioning when grid snap is disabled', async () => {
      const user = userEvent.setup();
      
      render(<MapPanel />);
      
      // Toggle grid snap off
      const gridSnapToggle = screen.getByLabelText(/snap to grid/i);
      await user.click(gridSnapToggle);
      
      // Place token at precise position
      const monsterToken = screen.getByTestId('draggable-token-dragon');
      
      fireEvent.dragEnd(monsterToken, {
        clientX: 237, // Exact pixel position
        clientY: 194
      });
      
      // Token should maintain exact position
      await waitFor(() => {
        const tokenElement = screen.getByTestId('token-dragon-position');
        expect(tokenElement).toHaveStyle('left: 237px; top: 194px');
      });
    });

    it('should display measurement rulers and calculate distances correctly', async () => {
      const user = userEvent.setup();
      render(<MapPanel />);
      
      // Activate measurement tool
      const measureTool = screen.getByRole('button', { name: /measure distance/i });
      await user.click(measureTool);
      
      expect(screen.getByTestId('active-tool')).toHaveTextContent('measure');
      
      // Click and drag to measure distance
      const mapCanvas = screen.getByTestId('map-canvas');
      
      // Start measurement at grid position A1 (25, 25)
      fireEvent.mouseDown(mapCanvas, { clientX: 25, clientY: 25 });
      
      // Drag to position D4 (175, 175) - 3 squares right, 3 squares down
      fireEvent.mouseMove(mapCanvas, { clientX: 175, clientY: 175 });
      
      // Should show live measurement
      await waitFor(() => {
        expect(screen.getByTestId('measurement-distance')).toHaveTextContent('21.2 ft'); // √(3² + 3²) × 5 ft per square
        expect(screen.getByTestId('measurement-line')).toBeInTheDocument();
      });
      
      // Complete measurement
      fireEvent.mouseUp(mapCanvas, { clientX: 175, clientY: 175 });
      
      // Measurement should persist until dismissed
      expect(screen.getByTestId('saved-measurement-1')).toHaveTextContent('21.2 ft');
    });

    it('should handle hex grid calculations and movement correctly', async () => {      
      render(<MapPanel />);
      
      // Place character in hex grid
      const characterToken = screen.getByTestId('draggable-token-ranger');
      
      fireEvent.dragEnd(characterToken, { clientX: 100, clientY: 100 });
      
      // Hex coordinates should be displayed
      await waitFor(() => {
        expect(screen.getByTestId('token-ranger-hex-coords')).toHaveTextContent('02.03'); // Row.Column hex notation
      });
      
      // Movement from one hex to adjacent hex should be 5 feet
      const adjacentHex = screen.getByTestId('hex-cell-02-04');
      fireEvent.dragEnd(characterToken, adjacentHex);
      
      await waitFor(() => {
        expect(screen.getByTestId('movement-cost')).toHaveTextContent('5 ft');
      });
      
      // Diagonal movement in hex should still be 5 feet (not diagonal cost)
      const diagonalHex = screen.getByTestId('hex-cell-03-04');
      fireEvent.dragEnd(characterToken, diagonalHex);
      
      expect(screen.getByTestId('movement-cost')).toHaveTextContent('5 ft');
    });
  });

  describe('Layer Management and Drawing Tools', () => {
    it('should manage multiple map layers independently', async () => {
      const user = userEvent.setup();
      render(
        <>
          <LayerPanel />
          <MapPanel />
        </>
      );
      
      // Default layers should be visible
      expect(screen.getByTestId('layer-background')).toHaveAttribute('data-visible', 'true');
      expect(screen.getByTestId('layer-tokens')).toHaveAttribute('data-visible', 'true');
      expect(screen.getByTestId('layer-fog-of-war')).toHaveAttribute('data-visible', 'true');
      
      // Hide fog of war layer
      const fogToggle = screen.getByLabelText(/toggle fog of war layer/i);
      await user.click(fogToggle);
      
      await waitFor(() => {
        expect(screen.getByTestId('layer-fog-of-war')).toHaveAttribute('data-visible', 'false');
        expect(screen.queryByTestId('fog-overlay')).not.toBeInTheDocument();
      });
      
      // Create new custom layer
      const addLayerButton = screen.getByRole('button', { name: /add layer/i });
      await user.click(addLayerButton);
      
      const layerNameInput = screen.getByLabelText(/layer name/i);
      await user.type(layerNameInput, 'DM Notes');
      
      const createLayerButton = screen.getByRole('button', { name: /create layer/i });
      await user.click(createLayerButton);
      
      // New layer should appear
      expect(screen.getByTestId('layer-dm-notes')).toBeInTheDocument();
      
      // Only DM should see this layer (player visibility control)
      const visibilityToggle = screen.getByLabelText(/dm notes visible to players/i);
      expect(visibilityToggle).not.toBeChecked();
    });

    it('should provide drawing tools for terrain and obstacles', async () => {
      const user = userEvent.setup();
      render(<ToolsPanel userInfo={mockUserInfo} />);
      
      // Activate drawing tool
      const drawTool = screen.getByRole('button', { name: /draw shapes/i });
      await user.click(drawTool);
      
      // Select rectangle tool for walls
      const rectangleTool = screen.getByRole('button', { name: /rectangle/i });
      await user.click(rectangleTool);
      
      // Set drawing properties
      const colorPicker = screen.getByLabelText(/drawing color/i);
      await user.click(colorPicker);
      await user.click(screen.getByTestId('color-gray')); // Wall color
      
      const brushSize = screen.getByLabelText(/brush size/i);
      await user.clear(brushSize);
      await user.type(brushSize, '5'); // 5 pixel thick walls
      
      // Draw a wall on the map
      const mapCanvas = screen.getByTestId('map-canvas');
      
      fireEvent.mouseDown(mapCanvas, { clientX: 50, clientY: 50 });
      fireEvent.mouseMove(mapCanvas, { clientX: 200, clientY: 50 });
      fireEvent.mouseUp(mapCanvas, { clientX: 200, clientY: 50 });
      
      // Wall should be created
      await waitFor(() => {
        expect(screen.getByTestId('drawn-shape-wall-1')).toBeInTheDocument();
        expect(screen.getByTestId('drawn-shape-wall-1')).toHaveAttribute('data-type', 'wall');
      });
      
      // Wall should block line of sight
      expect(screen.getByTestId('drawn-shape-wall-1')).toHaveAttribute('data-blocks-los', 'true');
    });

    it('should handle area effects with proper spell templates', async () => {
      const user = userEvent.setup();
      render(<ToolsPanel userInfo={mockUserInfo} />);
      
      // Activate spell template tool
      const templateTool = screen.getByRole('button', { name: /spell templates/i });
      await user.click(templateTool);
      
      // Select fireball template (20-foot radius sphere)
      const fireballTemplate = screen.getByRole('button', { name: /fireball \(20 ft radius\)/i });
      await user.click(fireballTemplate);
      
      // Place template on map
      const mapCanvas = screen.getByTestId('map-canvas');
      fireEvent.click(mapCanvas, { clientX: 150, clientY: 150 });
      
      // Template should appear with correct size
      await waitFor(() => {
        const template = screen.getByTestId('spell-template-fireball');
        expect(template).toHaveAttribute('data-radius', '20'); // 20 feet
        expect(template).toHaveStyle('width: 200px; height: 200px'); // 4 squares × 50px
      });
      
      // Affected creatures should be highlighted
      expect(screen.getByTestId('template-affected-creatures')).toHaveTextContent('2 creatures'); // Assuming 2 tokens in area
      
      // Apply spell effects
      const applyEffectsButton = screen.getByRole('button', { name: /apply fireball effects/i });
      await user.click(applyEffectsButton);
      
      // Creatures should make dexterity saves
      await waitFor(() => {
        expect(screen.getByText(/dexterity saving throws required/i)).toBeInTheDocument();
      });
    });
  });

  describe('Advanced Fog of War System', () => {
    it('should calculate line of sight based on character vision', async () => {
      const user = userEvent.setup();
      render(<MapPanel />);
      
      // Add character to map - character data would come from character management system
      const addTokenButton = screen.getByRole('button', { name: /add token/i });
      await user.click(addTokenButton);
      
      await user.selectOptions(screen.getByLabelText(/character/i), 'elf-wizard');
      
      const placeButton = screen.getByRole('button', { name: /place token/i });
      await user.click(placeButton);
      
      // Click to place at position
      const mapCanvas = screen.getByTestId('map-canvas');
      fireEvent.click(mapCanvas, { clientX: 100, clientY: 100 });
      
      // Fog should reveal around character based on vision
      await waitFor(() => {
        const revealedArea = screen.getByTestId('fog-revealed-area');
        expect(revealedArea).toHaveAttribute('data-radius', '60'); // 60 feet visible
      });
      
      // Areas outside vision should remain fogged
      const foggedArea = screen.getByTestId('fog-area-distant');
      expect(foggedArea).toHaveAttribute('data-visible', 'false');
      
      // Move character - fog should update
      const characterToken = screen.getByTestId('token-elf-wizard');
      fireEvent.dragEnd(characterToken, { clientX: 200, clientY: 100 });
      
      await waitFor(() => {
        const updatedReveal = screen.getByTestId('fog-revealed-area');
        expect(updatedReveal).toHaveAttribute('data-center-x', '200');
      });
    });

    it('should handle dynamic lighting with light sources', async () => {
      const user = userEvent.setup();
      render(<MapPanel />);
      
      // Place torch (20ft bright light, 40ft dim light)
      const lightTool = screen.getByRole('button', { name: /place light/i });
      await user.click(lightTool);
      
      const torchTemplate = screen.getByRole('button', { name: /torch/i });
      await user.click(torchTemplate);
      
      // Place torch on map
      const mapCanvas = screen.getByTestId('map-canvas');
      fireEvent.click(mapCanvas, { clientX: 150, clientY: 150 });
      
      // Light should create illumination areas
      await waitFor(() => {
        expect(screen.getByTestId('light-bright-area')).toHaveAttribute('data-radius', '20');
        expect(screen.getByTestId('light-dim-area')).toHaveAttribute('data-radius', '40');
      });
      
      // Shadows should be cast by walls
      const wall = screen.getByTestId('drawn-shape-wall-1');
      if (wall) {
        expect(screen.getByTestId('shadow-cast-by-wall-1')).toBeInTheDocument();
      }
      
      // Characters in bright light should see normally
      const characterInLight = screen.getByTestId('token-wizard');
      const lightArea = screen.getByTestId('light-bright-area');
      
      // Check if character is within light area
      const characterRect = characterInLight.getBoundingClientRect();
      const lightRect = lightArea.getBoundingClientRect();
      
      if (characterRect.left >= lightRect.left && characterRect.right <= lightRect.right) {
        expect(screen.getByTestId('character-vision-bonus')).toHaveTextContent('Normal vision');
      }
    });

    it('should manage fog reveal/conceal for DM control', async () => {
      const user = userEvent.setup();
      render(<MapPanel />);
      
      // Activate fog management tool
      const fogTool = screen.getByRole('button', { name: /manage fog/i });
      await user.click(fogTool);
      
      // Select reveal brush
      const revealBrush = screen.getByRole('button', { name: /reveal fog/i });
      await user.click(revealBrush);
      
      // Set brush size
      const brushSize = screen.getByLabelText(/brush size/i);
      await user.clear(brushSize);
      await user.type(brushSize, '100'); // 100 pixel radius
      
      // Paint revealed area
      const mapCanvas = screen.getByTestId('map-canvas');
      fireEvent.mouseDown(mapCanvas, { clientX: 200, clientY: 200 });
      fireEvent.mouseMove(mapCanvas, { clientX: 250, clientY: 200 });
      fireEvent.mouseUp(mapCanvas, { clientX: 250, clientY: 200 });
      
      // Area should be revealed
      await waitFor(() => {
        const revealedArea = screen.getByTestId('manually-revealed-area-1');
        expect(revealedArea).toHaveAttribute('data-visible', 'true');
      });
      
      // Switch to conceal brush
      const concealBrush = screen.getByRole('button', { name: /conceal fog/i });
      await user.click(concealBrush);
      
      // Paint concealed area over revealed area
      fireEvent.mouseDown(mapCanvas, { clientX: 225, clientY: 200 });
      fireEvent.mouseMove(mapCanvas, { clientX: 275, clientY: 200 });
      fireEvent.mouseUp(mapCanvas, { clientX: 275, clientY: 200 });
      
      // Overlapped area should be concealed again
      await waitFor(() => {
        const concealedArea = screen.getByTestId('manually-concealed-area-1');
        expect(concealedArea).toHaveAttribute('data-visible', 'false');
      });
    });
  });

  describe('Performance and Optimization', () => {
    it('should handle large maps without performance degradation', async () => {
      const performanceStart = performance.now();
      
      render(<MapPanel />);
      
      // Initial render should complete quickly
      const renderTime = performance.now() - performanceStart;
      expect(renderTime).toBeLessThan(500); // Less than 500ms for large map
      
      // Viewport culling should be active
      expect(screen.getByTestId('viewport-culling-enabled')).toHaveTextContent('true');
      
      // Only visible elements should be rendered
      const renderedElements = screen.getAllByTestId(/^rendered-element-/);
      expect(renderedElements.length).toBeLessThan(100); // Culled from total 350+ elements
      
      // Zoom should maintain performance
      const zoomIn = screen.getByRole('button', { name: /zoom in/i });
      const zoomStart = performance.now();
      
      fireEvent.click(zoomIn);
      fireEvent.click(zoomIn); // 4x zoom
      
      const zoomTime = performance.now() - zoomStart;
      expect(zoomTime).toBeLessThan(100); // Smooth zooming
    });

    it('should efficiently update only changed map areas', async () => {
      render(<MapPanel />);
      
      // Track render updates
      const initialRenderCount = parseInt(screen.getByTestId('render-count').textContent || '0');
      
      // Move token in one area
      const token = screen.getByTestId('token-wizard');
      fireEvent.dragEnd(token, { clientX: 150, clientY: 150 });
      
      await waitFor(() => {
        const newRenderCount = parseInt(screen.getByTestId('render-count').textContent || '0');
        expect(newRenderCount).toBe(initialRenderCount + 1); // Only one update
      });
      
      // Check that only affected region was updated
      const updatedRegions = screen.getAllByTestId(/^updated-region-/);
      expect(updatedRegions.length).toBe(2); // Old position and new position regions only
      
      // Distant areas should not be re-rendered
      const distantRegion = screen.getByTestId('region-far-corner');
      expect(distantRegion).toHaveAttribute('data-updated', 'false');
    });
  });
});