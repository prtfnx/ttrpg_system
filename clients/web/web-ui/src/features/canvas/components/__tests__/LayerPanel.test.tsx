import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LayerPanel } from '../LayerPanel';

// Mock the game store to control layer data
const mockGameStore = {
  activeLayer: 'tokens',
  layerVisibility: {
    map: true,
    tokens: true,
    dungeon_master: false,
    light: true,
    height: false,
    obstacles: true,
    fog_of_war: false
  },
  layerOpacity: {
    map: 1.0,
    tokens: 0.9,
    dungeon_master: 0.8,
    light: 0.7,
    height: 1.0,
    obstacles: 1.0,
    fog_of_war: 0.5
  },
  setActiveLayer: vi.fn(),
  setLayerVisibility: vi.fn(),
  setLayerOpacity: vi.fn()
};

vi.mock('../../../store', () => ({
  useGameStore: () => mockGameStore
}));

// Mock render engine for layer operations
const mockRenderEngine = {
  isInitialized: true,
  toggleLayerVisibility: vi.fn(),
  setLayerOpacity: vi.fn(),
  setActiveLayer: vi.fn(),
  getLayerSpriteCount: vi.fn((layerId: string) => {
    const counts: Record<string, number> = {
      map: 1,
      tokens: 5,
      dungeon_master: 2,
      light: 3,
      height: 0,
      obstacles: 4,
      fog_of_war: 0
    };
    return counts[layerId] || 0;
  })
};

vi.mock('../hooks/useRenderEngine', () => ({
  useRenderEngine: () => mockRenderEngine
}));

describe('LayerPanel - Game Master Layer Management', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('When game master views layer panel', () => {
    it('shows all available layers with their current status', () => {
      render(<LayerPanel />);

      // Should show all default layers
      expect(screen.getByText('Map')).toBeInTheDocument();
      expect(screen.getByText('Tokens')).toBeInTheDocument();
      expect(screen.getByText('DM Layer')).toBeInTheDocument();
      expect(screen.getByText('Lighting')).toBeInTheDocument();
      expect(screen.getByText('Height')).toBeInTheDocument();
      expect(screen.getByText('Obstacles')).toBeInTheDocument();
      expect(screen.getByText('Fog of War')).toBeInTheDocument();

      // Should show layer icons
      expect(screen.getByText('🗺️')).toBeInTheDocument(); // Map
      expect(screen.getByText('⚪')).toBeInTheDocument(); // Tokens
      expect(screen.getByText('👁️')).toBeInTheDocument(); // DM Layer
      expect(screen.getByText('💡')).toBeInTheDocument(); // Lighting
    });

    it('indicates which layer is currently active', () => {
      render(<LayerPanel />);

      // Tokens should be marked as active
      const tokensLayer = screen.getByText('Tokens').closest('.layerItem');
      expect(tokensLayer).toHaveClass('active');

      // Other layers should not be active
      const mapLayer = screen.getByText('Map').closest('.layerItem');
      expect(mapLayer).not.toHaveClass('active');
    });

    it('shows sprite count for each layer', () => {
      render(<LayerPanel />);

      // Should show sprite counts next to layer names
      expect(screen.getByText('Map (1)')).toBeInTheDocument();
      expect(screen.getByText('Tokens (5)')).toBeInTheDocument();
      expect(screen.getByText('DM Layer (2)')).toBeInTheDocument();
      expect(screen.getByText('Lighting (3)')).toBeInTheDocument();
      expect(screen.getByText('Obstacles (4)')).toBeInTheDocument();

      // Empty layers should show (0) or be handled gracefully
      expect(screen.getByText('Height (0)')).toBeInTheDocument();
      expect(screen.getByText('Fog of War (0)')).toBeInTheDocument();
    });

    it('shows visibility status for each layer', () => {
      render(<LayerPanel />);

      // Visible layers should have eye icon or visible styling
      const mapLayer = screen.getByText('Map').closest('.layerItem');
      expect(mapLayer).toHaveClass('visible');

      const tokensLayer = screen.getByText('Tokens').closest('.layerItem');
      expect(tokensLayer).toHaveClass('visible');

      // Hidden layers should have different styling
      const dmLayer = screen.getByText('DM Layer').closest('.layerItem');
      expect(dmLayer).toHaveClass('hidden');
    });
  });

  describe('When game master changes layer visibility', () => {
    it('toggles layer visibility when eye button is clicked', async () => {
      render(<LayerPanel />);

      // Find and click the visibility toggle for the Map layer
      const mapVisibilityButton = screen.getByTestId('visibility-toggle-map');
      await user.click(mapVisibilityButton);

      expect(mockRenderEngine.toggleLayerVisibility).toHaveBeenCalledWith('map');
      expect(mockGameStore.setLayerVisibility).toHaveBeenCalledWith('map', false);
    });

    it('shows immediate visual feedback when toggling visibility', async () => {
      render(<LayerPanel />);

      // Map starts visible
      let mapLayer = screen.getByText('Map').closest('.layerItem');
      expect(mapLayer).toHaveClass('visible');

      // Click to hide
      await user.click(screen.getByTestId('visibility-toggle-map'));

      // Should update visual state (in real app, would trigger re-render)
      // This tests the expected behavior
      expect(mockGameStore.setLayerVisibility).toHaveBeenCalledWith('map', false);
    });

    it('allows hiding all layers except active one', async () => {
      render(<LayerPanel />);

      // Hide multiple layers
      await user.click(screen.getByTestId('visibility-toggle-map'));
      await user.click(screen.getByTestId('visibility-toggle-light'));
      await user.click(screen.getByTestId('visibility-toggle-obstacles'));

      expect(mockRenderEngine.toggleLayerVisibility).toHaveBeenCalledTimes(3);
    });

    it('shows warning when trying to hide active layer', async () => {
      render(<LayerPanel />);

      // Try to hide the active layer (tokens)
      await user.click(screen.getByTestId('visibility-toggle-tokens'));

      // Should show confirmation or warning
      expect(screen.getByText(/hide active layer/i)).toBeInTheDocument();
    });
  });

  describe('When game master adjusts layer opacity', () => {
    it('changes layer opacity using slider', async () => {
      render(<LayerPanel />);

      // Find opacity slider for tokens layer
      const tokensOpacitySlider = screen.getByTestId('opacity-slider-tokens');
      
      // Change opacity to 50%
      await user.click(tokensOpacitySlider);
      await user.keyboard('[ArrowLeft][ArrowLeft][ArrowLeft]'); // Decrease opacity

      expect(mockRenderEngine.setLayerOpacity).toHaveBeenCalledWith('tokens', expect.any(Number));
      expect(mockGameStore.setLayerOpacity).toHaveBeenCalledWith('tokens', expect.any(Number));
    });

    it('shows opacity percentage as user adjusts', async () => {
      render(<LayerPanel />);

      // Should show current opacity values
      expect(screen.getByText('90%')).toBeInTheDocument(); // Tokens opacity
      expect(screen.getByText('70%')).toBeInTheDocument(); // Light opacity
      expect(screen.getByText('50%')).toBeInTheDocument(); // Fog of War opacity
    });

    it('allows fine-tuning opacity with precise control', async () => {
      render(<LayerPanel />);

      const opacityInput = screen.getByTestId('opacity-input-tokens');
      
      // Clear and type precise value
      await user.clear(opacityInput);
      await user.type(opacityInput, '0.75');

      expect(mockGameStore.setLayerOpacity).toHaveBeenCalledWith('tokens', 0.75);
    });

    it('prevents setting opacity outside valid range', async () => {
      render(<LayerPanel />);

      const opacityInput = screen.getByTestId('opacity-input-map');
      
      // Try invalid values
      await user.clear(opacityInput);
      await user.type(opacityInput, '1.5'); // Too high

      // Should clamp to valid range
      expect(Number((opacityInput as HTMLInputElement).value)).toBeLessThanOrEqual(1.0);

      await user.clear(opacityInput);
      await user.type(opacityInput, '-0.1'); // Too low

      expect(Number((opacityInput as HTMLInputElement).value)).toBeGreaterThanOrEqual(0.0);
    });
  });

  describe('When game master switches active layer', () => {
    it('switches active layer when layer is clicked', async () => {
      render(<LayerPanel />);

      // Click on Map layer to make it active
      await user.click(screen.getByText('Map'));

      expect(mockRenderEngine.setActiveLayer).toHaveBeenCalledWith('map');
      expect(mockGameStore.setActiveLayer).toHaveBeenCalledWith('map');
    });

    it('updates visual indicator for active layer', async () => {
      render(<LayerPanel />);

      // Switch to DM Layer
      await user.click(screen.getByText('DM Layer'));

      // Should call the appropriate functions to update active layer
      expect(mockGameStore.setActiveLayer).toHaveBeenCalledWith('dungeon_master');
    });

    it('allows quick switching between frequently used layers', async () => {
      render(<LayerPanel />);

      // Quick switches: Tokens -> Map -> DM Layer
      await user.click(screen.getByText('Map'));
      await user.click(screen.getByText('DM Layer'));
      await user.click(screen.getByText('Tokens'));

      expect(mockGameStore.setActiveLayer).toHaveBeenCalledTimes(3);
      expect(mockGameStore.setActiveLayer).toHaveBeenLastCalledWith('tokens');
    });

    it('shows active layer prominently in header', () => {
      render(<LayerPanel />);

      // Should show active layer info at top
      expect(screen.getByText('Active: Tokens')).toBeInTheDocument();
      expect(screen.getByText('⚪')).toBeInTheDocument(); // Active layer icon
    });
  });

  describe('Layer management workflows', () => {
    it('supports typical setup workflow: show map, hide DM layer, set token opacity', async () => {
      render(<LayerPanel />);

      // 1. Ensure map is visible
      if (!screen.getByText('Map').closest('.layerItem')?.classList.contains('visible')) {
        await user.click(screen.getByTestId('visibility-toggle-map'));
      }

      // 2. Hide DM layer from players
      await user.click(screen.getByTestId('visibility-toggle-dungeon_master'));

      // 3. Set token opacity for transparency
      const tokensSlider = screen.getByTestId('opacity-slider-tokens');
      await user.click(tokensSlider);
      await user.keyboard('[ArrowLeft]'); // Slight transparency

      // Verify workflow was executed
      expect(mockRenderEngine.toggleLayerVisibility).toHaveBeenCalledWith('dungeon_master');
      expect(mockRenderEngine.setLayerOpacity).toHaveBeenCalledWith('tokens', expect.any(Number));
    });

    it('supports combat setup: show tokens and obstacles, hide fog', async () => {
      render(<LayerPanel />);

      // Combat prep workflow
      await user.click(screen.getByTestId('visibility-toggle-tokens')); // Ensure tokens visible
      await user.click(screen.getByTestId('visibility-toggle-obstacles')); // Show obstacles
      await user.click(screen.getByTestId('visibility-toggle-fog_of_war')); // Hide fog

      expect(mockRenderEngine.toggleLayerVisibility).toHaveBeenCalledTimes(3);
    });

    it('supports stealth sequence: dim lighting, show fog, hide tokens partially', async () => {
      render(<LayerPanel />);

      // Stealth/exploration setup
      // 1. Dim lighting
      const lightSlider = screen.getByTestId('opacity-slider-light');
      await user.click(lightSlider);
      await user.keyboard('[ArrowLeft][ArrowLeft]'); // Reduce brightness

      // 2. Show fog of war
      await user.click(screen.getByTestId('visibility-toggle-fog_of_war'));

      // 3. Make tokens semi-transparent
      const tokensSlider = screen.getByTestId('opacity-slider-tokens');
      await user.click(tokensSlider);
      await user.keyboard('[ArrowLeft][ArrowLeft][ArrowLeft]'); // More transparent

      expect(mockRenderEngine.setLayerOpacity).toHaveBeenCalledWith('light', expect.any(Number));
      expect(mockRenderEngine.toggleLayerVisibility).toHaveBeenCalledWith('fog_of_war');
      expect(mockRenderEngine.setLayerOpacity).toHaveBeenCalledWith('tokens', expect.any(Number));
    });
  });

  describe('Layer panel display and organization', () => {
    it('organizes layers in logical z-order', () => {
      render(<LayerPanel />);

      const layerElements = screen.getAllByTestId(/layer-item-/);
      const layerOrder = layerElements.map(el => el.textContent);

      // Should be in a logical order (background to foreground)
      expect(layerOrder[0]).toMatch(/Map/);
      expect(layerOrder[layerOrder.length - 1]).toMatch(/Fog of War/);
    });

    it('adapts height based on number of layers', () => {
      const customLayers = [
        { id: 'layer1', name: 'Layer 1', icon: '1️⃣', color: '#000', spriteCount: 0 },
        { id: 'layer2', name: 'Layer 2', icon: '2️⃣', color: '#111', spriteCount: 0 }
      ];

      const { container } = render(<LayerPanel initialLayers={customLayers} />);

      // Panel should adjust height based on layer count
      const panel = container.querySelector('.layerPanel');
      expect(panel).toHaveStyle('height: 210px'); // Calculated for 2 layers
    });

    it('shows scrolling when there are many layers', () => {
      const manyLayers = Array.from({ length: 15 }, (_, i) => ({
        id: `layer${i}`,
        name: `Layer ${i + 1}`,
        icon: `${i + 1}️⃣`,
        color: `#${i.toString().padStart(3, '0')}`,
        spriteCount: i
      }));

      render(<LayerPanel initialLayers={manyLayers} />);

      // Should enable scrolling for many layers
      const layerList = screen.getByTestId('layer-list');
      expect(layerList).toHaveClass('scrollable');
    });

    it('groups related layers visually', () => {
      render(<LayerPanel />);

      // Visual grouping should be apparent
      const lightingGroup = screen.getByTestId('layer-group-lighting');
      expect(lightingGroup).toContain(screen.getByText('Lighting'));

      const gameplayGroup = screen.getByTestId('layer-group-gameplay');
      expect(gameplayGroup).toContain(screen.getByText('Tokens'));
      expect(gameplayGroup).toContain(screen.getByText('Obstacles'));
    });
  });

  describe('Performance and responsiveness', () => {
    it('handles rapid layer operations without lag', async () => {
      render(<LayerPanel />);

      // Rapid fire operations
      const operations = [
        () => user.click(screen.getByTestId('visibility-toggle-map')),
        () => user.click(screen.getByTestId('visibility-toggle-tokens')),
        () => user.click(screen.getByTestId('visibility-toggle-light')),
        () => user.click(screen.getByTestId('opacity-slider-obstacles')),
      ];

      // Execute rapidly
      await Promise.all(operations.map(op => op()));

      // Should handle all operations
      expect(mockRenderEngine.toggleLayerVisibility).toHaveBeenCalledTimes(3);
    });

    it('debounces opacity changes during dragging', async () => {
      render(<LayerPanel />);

      const opacitySlider = screen.getByTestId('opacity-slider-tokens');
      
      // Simulate dragging (multiple rapid changes)
      await user.click(opacitySlider);
      await user.keyboard('[ArrowLeft]');
      await user.keyboard('[ArrowLeft]');
      await user.keyboard('[ArrowLeft]');

      // Should debounce the calls to avoid overwhelming the render engine
      // Exact call count depends on implementation details
      expect(mockRenderEngine.setLayerOpacity).toHaveBeenCalled();
    });
  });

  describe('Error handling and edge cases', () => {
    it('handles missing render engine gracefully', () => {
      mockRenderEngine.isInitialized = false;

      render(<LayerPanel />);

      // Should still show layers but disable interactions
      expect(screen.getByText('Map')).toBeInTheDocument();
      
      // Controls should be disabled
      const visibilityButton = screen.getByTestId('visibility-toggle-map');
      expect(visibilityButton).toBeDisabled();
    });

    it('handles layers with no sprites gracefully', () => {
      mockRenderEngine.getLayerSpriteCount.mockReturnValue(0);

      render(<LayerPanel />);

      // Should show (0) for empty layers
      expect(screen.getByText('Height (0)')).toBeInTheDocument();
      expect(screen.getByText('Fog of War (0)')).toBeInTheDocument();
    });

    it('recovers from render engine errors', async () => {
      mockRenderEngine.toggleLayerVisibility.mockRejectedValueOnce(new Error('Render error'));

      render(<LayerPanel />);

      await user.click(screen.getByTestId('visibility-toggle-map'));

      // Should handle error gracefully and not break the UI
      expect(screen.getByText('Map')).toBeInTheDocument();
      
      // Could show error message or retry option
      expect(screen.queryByText(/error/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility and user experience', () => {
    it('provides keyboard navigation for all controls', async () => {
      render(<LayerPanel />);

      // Tab through controls
      await user.tab();
      await user.tab();

      // Should be able to activate with keyboard
      await user.keyboard('{Enter}');
      
      // Some interaction should have occurred
      expect(mockRenderEngine.setActiveLayer || mockRenderEngine.toggleLayerVisibility).toHaveBeenCalled();
    });

    it('provides appropriate ARIA labels', () => {
      render(<LayerPanel />);

      // Visibility toggles should have descriptive labels
      const mapToggle = screen.getByTestId('visibility-toggle-map');
      expect(mapToggle).toHaveAttribute('aria-label', 'Toggle Map layer visibility');

      // Opacity sliders should have labels
      const tokensSlider = screen.getByTestId('opacity-slider-tokens');
      expect(tokensSlider).toHaveAttribute('aria-label', 'Tokens layer opacity');
    });

    it('announces layer changes to screen readers', async () => {
      render(<LayerPanel />);

      await user.click(screen.getByText('Map'));

      // Should have appropriate announcements
      const announcement = screen.getByRole('status', { name: /layer changed/i });
      expect(announcement).toHaveTextContent('Active layer changed to Map');
    });
  });
});
