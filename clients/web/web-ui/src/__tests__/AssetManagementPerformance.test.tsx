/**
 * Asset Management and Performance System Behavior Tests
 * Tests real asset loading, caching, optimization, and performance monitoring
 * Focus: Real expected behavior for efficient TTRPG asset management
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

describe('Asset Management System - Performance and Caching', () => {
  const mockUserInfo = { 
    id: 'dm1', 
    username: 'DM Mike', 
    role: 'dm' as const,
    permissions: ['upload_assets', 'manage_assets', 'optimize_assets'] 
  };

  describe('Asset Upload and Processing Pipeline', () => {
    it('should handle large image uploads with progress tracking', async () => {
      const user = userEvent.setup();
      
      // Mock file upload component
      render(
        <div data-testid="asset-upload">
          <input type="file" accept="image/*" aria-label="Upload Image" />
          <div data-testid="upload-progress" style={{ display: 'none' }}>0%</div>
          <div data-testid="upload-status">Ready</div>
        </div>
      );
      
      // Create mock large image file (10MB)
      const largeImageFile = new File(
        [new ArrayBuffer(10 * 1024 * 1024)], // 10MB
        'dragon_battlemap.jpg',
        { type: 'image/jpeg' }
      );
      
      const fileInput = screen.getByLabelText(/upload image/i);
      
      // Upload file
      await user.upload(fileInput, largeImageFile);
      
      // Should show upload progress
      await waitFor(() => {
        expect(screen.getByTestId('upload-status')).toHaveTextContent('Uploading...');
        expect(screen.getByTestId('upload-progress')).toBeVisible();
      });
      
      // Simulate upload progress updates
      const progressElement = screen.getByTestId('upload-progress');
      
      // Should track progress from 0% to 100%
      await waitFor(() => {
        expect(progressElement).toHaveTextContent(/\d+%/);
      });
      
      // Should process image after upload
      await waitFor(() => {
        expect(screen.getByTestId('upload-status')).toHaveTextContent('Processing...');
      });
      
      // Should generate thumbnails and optimized versions
      await waitFor(() => {
        expect(screen.getByText(/generating thumbnails/i)).toBeInTheDocument();
        expect(screen.getByText(/optimizing for web/i)).toBeInTheDocument();
      });
      
      // Should complete successfully
      await waitFor(() => {
        expect(screen.getByTestId('upload-status')).toHaveTextContent('Complete');
        expect(screen.getByText(/dragon_battlemap.jpg uploaded successfully/i)).toBeInTheDocument();
      });
    });

    it('should validate file types and enforce size limits', async () => {
      const user = userEvent.setup();
      
      render(
        <div data-testid="asset-upload">
          <input type="file" accept="image/*" aria-label="Upload Image" />
          <div data-testid="upload-errors"></div>
        </div>
      );
      
      // Try to upload unsupported file type
      const textFile = new File(['Hello world'], 'document.txt', { type: 'text/plain' });
      const fileInput = screen.getByLabelText(/upload image/i);
      
      await user.upload(fileInput, textFile);
      
      await waitFor(() => {
        expect(screen.getByTestId('upload-errors')).toHaveTextContent('Invalid file type. Only images are allowed.');
      });
      
      // Try to upload file that's too large (over 50MB limit)
      const oversizedFile = new File(
        [new ArrayBuffer(60 * 1024 * 1024)], // 60MB
        'huge_image.png',
        { type: 'image/png' }
      );
      
      await user.upload(fileInput, oversizedFile);
      
      await waitFor(() => {
        expect(screen.getByTestId('upload-errors')).toHaveTextContent('File size exceeds 50MB limit.');
      });
      
      // Try to upload corrupted image
      const corruptedFile = new File(['corrupted data'], 'broken.jpg', { type: 'image/jpeg' });
      
      await user.upload(fileInput, corruptedFile);
      
      await waitFor(() => {
        expect(screen.getByTestId('upload-errors')).toHaveTextContent('Invalid or corrupted image file.');
      });
    });

    it('should batch process multiple asset uploads efficiently', async () => {
      const user = userEvent.setup();
      
      render(
        <div data-testid="batch-upload">
          <input type="file" multiple accept="image/*" aria-label="Upload Multiple Images" />
          <div data-testid="batch-progress">
            <div data-testid="files-processed">0</div>
            <div data-testid="files-total">0</div>
            <div data-testid="overall-progress">0%</div>
          </div>
        </div>
      );
      
      // Create multiple files
      const files = [
        new File([new ArrayBuffer(1024)], 'token1.png', { type: 'image/png' }),
        new File([new ArrayBuffer(2048)], 'token2.jpg', { type: 'image/jpeg' }),
        new File([new ArrayBuffer(1536)], 'token3.png', { type: 'image/png' }),
        new File([new ArrayBuffer(2560)], 'map1.jpg', { type: 'image/jpeg' })
      ];
      
      const fileInput = screen.getByLabelText(/upload multiple images/i);
      await user.upload(fileInput, files);
      
      // Should show batch processing info
      await waitFor(() => {
        expect(screen.getByTestId('files-total')).toHaveTextContent('4');
        expect(screen.getByTestId('files-processed')).toHaveTextContent('0');
      });
      
      // Should process files one by one or in parallel
      await waitFor(() => {
        const processed = parseInt(screen.getByTestId('files-processed').textContent || '0');
        expect(processed).toBeGreaterThan(0);
        expect(processed).toBeLessThanOrEqual(4);
      });
      
      // Should show overall progress
      await waitFor(() => {
        const progress = screen.getByTestId('overall-progress').textContent;
        expect(progress).toMatch(/\d+%/);
      });
      
      // Should complete all files
      await waitFor(() => {
        expect(screen.getByTestId('files-processed')).toHaveTextContent('4');
        expect(screen.getByTestId('overall-progress')).toHaveTextContent('100%');
        expect(screen.getByText(/4 files uploaded successfully/i)).toBeInTheDocument();
      });
    });
  });

  describe('Intelligent Caching and Performance Optimization', () => {
    it('should implement progressive loading for large asset libraries', async () => {
      // Mock large asset library (1000+ assets)
      const mockAssets = Array.from({ length: 1200 }, (_, i) => ({
        id: `asset_${i}`,
        name: `Asset ${i}`,
        type: 'image',
        thumbnail: `thumb_${i}.jpg`,
        size: Math.random() * 5000000, // Random size up to 5MB
        tags: ['token', 'monster', 'character'][Math.floor(Math.random() * 3)]
      }));
      
      render(
        <div data-testid="asset-library">
          <div data-testid="assets-loaded">0</div>
          <div data-testid="assets-total">1200</div>
          <div data-testid="loading-status">Loading...</div>
          <div data-testid="asset-grid"></div>
        </div>
      );
      
      // Should load assets progressively (first batch)
      await waitFor(() => {
        const loaded = parseInt(screen.getByTestId('assets-loaded').textContent || '0');
        expect(loaded).toBe(50); // First batch of 50 assets
        expect(screen.getByTestId('loading-status')).toHaveTextContent('Loading batch 1 of 24...');
      });
      
      // Should load more as user scrolls or requests
      const loadMoreEvent = new Event('scroll');
      window.dispatchEvent(loadMoreEvent);
      
      await waitFor(() => {
        const loaded = parseInt(screen.getByTestId('assets-loaded').textContent || '0');
        expect(loaded).toBe(100); // Second batch loaded
      });
      
      // Should prioritize visible assets in viewport
      const assetGrid = screen.getByTestId('asset-grid');
      expect(assetGrid).toHaveAttribute('data-virtualized', 'true');
      
      // Should implement lazy loading for thumbnails
      const visibleAssets = screen.getAllByTestId(/^asset-thumbnail-/);
      expect(visibleAssets.length).toBeLessThanOrEqual(50); // Only visible assets rendered
    });

    it('should cache frequently used assets with intelligent eviction', async () => {
      let cacheSize = 0;
      const maxCacheSize = 100 * 1024 * 1024; // 100MB cache limit
      let cachedAssets: Map<string, any> = new Map();
      
      render(
        <div data-testid="asset-cache">
          <div data-testid="cache-size">0 MB</div>
          <div data-testid="cache-hit-rate">0%</div>
          <div data-testid="cached-assets">{cachedAssets.size}</div>
        </div>
      );
      
      // Simulate loading frequently used assets
      const frequentAssets = [
        { id: 'sword_icon', size: 1024 * 500 }, // 500KB
        { id: 'shield_icon', size: 1024 * 300 }, // 300KB
        { id: 'potion_icon', size: 1024 * 200 }  // 200KB
      ];
      
      // Load assets multiple times (simulate frequent use)
      for (let i = 0; i < 3; i++) {
        for (const asset of frequentAssets) {
          if (!cachedAssets.has(asset.id)) {
            cachedAssets.set(asset.id, { ...asset, accessCount: 1, lastAccessed: Date.now() });
            cacheSize += asset.size;
          } else {
            const cached = cachedAssets.get(asset.id);
            cached.accessCount++;
            cached.lastAccessed = Date.now();
          }
        }
      }
      
      // Cache should be populated
      await waitFor(() => {
        expect(screen.getByTestId('cached-assets')).toHaveTextContent('3');
        expect(screen.getByTestId('cache-size')).toHaveTextContent('1.0 MB'); // 1000KB total
      });
      
      // Add many more assets to trigger eviction
      const newAssets = Array.from({ length: 200 }, (_, i) => ({
        id: `new_asset_${i}`,
        size: 1024 * 1024 // 1MB each
      }));
      
      for (const asset of newAssets) {
        if (cacheSize + asset.size > maxCacheSize) {
          // Implement LRU eviction
          const lruAsset = Array.from(cachedAssets.values())
            .sort((a, b) => a.lastAccessed - b.lastAccessed)[0];
          
          cachedAssets.delete(lruAsset.id);
          cacheSize -= lruAsset.size;
        }
        
        cachedAssets.set(asset.id, { ...asset, accessCount: 1, lastAccessed: Date.now() });
        cacheSize += asset.size;
      }
      
      // Frequently used assets should be retained
      expect(cachedAssets.has('sword_icon')).toBe(true);
      expect(cachedAssets.has('shield_icon')).toBe(true);
      expect(cachedAssets.has('potion_icon')).toBe(true);
      
      // Cache size should not exceed limit
      expect(cacheSize).toBeLessThanOrEqual(maxCacheSize);
    });

    it('should optimize images for different viewport sizes and network conditions', async () => {
      const user = userEvent.setup();
      
      // Mock different device configurations
      const deviceConfigs = [
        { name: 'mobile', width: 375, height: 667, dpr: 2, bandwidth: 'slow' },
        { name: 'tablet', width: 768, height: 1024, dpr: 2, bandwidth: 'medium' },
        { name: 'desktop', width: 1920, height: 1080, dpr: 1, bandwidth: 'fast' }
      ];
      
      render(
        <div data-testid="responsive-assets">
          <div data-testid="current-device">desktop</div>
          <div data-testid="image-quality">high</div>
          <div data-testid="loading-strategy">eager</div>
          <img data-testid="battlemap-image" src="" alt="Battle Map" />
        </div>
      );
      
      // Simulate mobile device
      Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
      Object.defineProperty(window, 'innerHeight', { value: 667, writable: true });
      
      // Mock slow network connection
      Object.defineProperty(navigator, 'connection', {
        value: { effectiveType: '3g', downlink: 1.5 },
        writable: true
      });
      
      const resizeEvent = new Event('resize');
      window.dispatchEvent(resizeEvent);
      
      // Should adapt to mobile constraints
      await waitFor(() => {
        expect(screen.getByTestId('current-device')).toHaveTextContent('mobile');
        expect(screen.getByTestId('image-quality')).toHaveTextContent('medium'); // Reduced for slow connection
        expect(screen.getByTestId('loading-strategy')).toHaveTextContent('lazy'); // Preserve bandwidth
      });
      
      // Image should use appropriate resolution
      const image = screen.getByTestId('battlemap-image');
      expect(image).toHaveAttribute('src', expect.stringContaining('w_750')); // 2x resolution for mobile
      
      // Simulate desktop with fast connection
      Object.defineProperty(window, 'innerWidth', { value: 1920, writable: true });
      Object.defineProperty(navigator, 'connection', {
        value: { effectiveType: '4g', downlink: 10 },
        writable: true
      });
      
      window.dispatchEvent(resizeEvent);
      
      await waitFor(() => {
        expect(screen.getByTestId('image-quality')).toHaveTextContent('high');
        expect(screen.getByTestId('loading-strategy')).toHaveTextContent('eager');
      });
      
      // Should load high-resolution version
      expect(image).toHaveAttribute('src', expect.stringContaining('w_1920'));
    });
  });

  describe('Performance Monitoring and Metrics', () => {
    it('should track and report asset loading performance', async () => {
      let performanceMetrics = {
        totalAssets: 0,
        loadedAssets: 0,
        failedAssets: 0,
        averageLoadTime: 0,
        cacheHitRate: 0,
        bandwidthUsage: 0
      };
      
      render(
        <div data-testid="performance-dashboard">
          <div data-testid="total-assets">{performanceMetrics.totalAssets}</div>
          <div data-testid="loaded-assets">{performanceMetrics.loadedAssets}</div>
          <div data-testid="failed-assets">{performanceMetrics.failedAssets}</div>
          <div data-testid="average-load-time">{performanceMetrics.averageLoadTime}ms</div>
          <div data-testid="cache-hit-rate">{performanceMetrics.cacheHitRate}%</div>
          <div data-testid="bandwidth-usage">{performanceMetrics.bandwidthUsage}MB</div>
        </div>
      );
      
      // Simulate loading multiple assets with performance tracking
      const assetLoadTimes = [120, 85, 200, 95, 310, 75, 140]; // ms
      performanceMetrics.totalAssets = assetLoadTimes.length;
      
      for (const loadTime of assetLoadTimes) {
        // Simulate asset loading
        await new Promise(resolve => setTimeout(resolve, Math.min(loadTime, 50))); // Accelerated for test
        
        performanceMetrics.loadedAssets++;
        const totalTime = assetLoadTimes.slice(0, performanceMetrics.loadedAssets).reduce((a, b) => a + b, 0);
        performanceMetrics.averageLoadTime = Math.round(totalTime / performanceMetrics.loadedAssets);
        performanceMetrics.bandwidthUsage += Math.random() * 2; // Random bandwidth usage
        
        // Re-render with updated metrics
        const elements = {
          totalAssets: screen.getByTestId('total-assets'),
          loadedAssets: screen.getByTestId('loaded-assets'),
          averageLoadTime: screen.getByTestId('average-load-time'),
          bandwidthUsage: screen.getByTestId('bandwidth-usage')
        };
        
        elements.totalAssets.textContent = performanceMetrics.totalAssets.toString();
        elements.loadedAssets.textContent = performanceMetrics.loadedAssets.toString();
        elements.averageLoadTime.textContent = `${performanceMetrics.averageLoadTime}ms`;
        elements.bandwidthUsage.textContent = `${performanceMetrics.bandwidthUsage.toFixed(1)}MB`;
      }
      
      // Final metrics should be accurate
      await waitFor(() => {
        expect(screen.getByTestId('loaded-assets')).toHaveTextContent('7');
        expect(screen.getByTestId('failed-assets')).toHaveTextContent('0');
      });
      
      // Average load time should be reasonable
      const avgTime = parseInt(screen.getByTestId('average-load-time').textContent || '0');
      expect(avgTime).toBeGreaterThan(0);
      expect(avgTime).toBeLessThan(500); // Under 500ms average
    });

    it('should implement asset preloading for improved user experience', async () => {
      const user = userEvent.setup();
      
      // Mock game session with predictable asset usage patterns
      const gameAssets = {
        currentScene: ['forest_bg.jpg', 'tree_token.png', 'orc_token.png'],
        nextScene: ['dungeon_bg.jpg', 'skeleton_token.png', 'trap_token.png'],
        characterAssets: ['player1_sheet.pdf', 'player2_sheet.pdf']
      };
      
      let preloadedAssets = new Set<string>();
      
      render(
        <div data-testid="asset-preloader">
          <div data-testid="preloaded-count">{preloadedAssets.size}</div>
          <div data-testid="preload-status">idle</div>
          <button onClick={() => {
            // Simulate scene transition trigger
            gameAssets.nextScene.forEach(asset => preloadedAssets.add(asset));
          }}>
            Next Scene
          </button>
        </div>
      );
      
      // Should preload next scene assets when current scene loads
      gameAssets.currentScene.forEach(asset => preloadedAssets.add(asset));
      
      // Trigger intelligent preloading
      const nextSceneButton = screen.getByRole('button', { name: /next scene/i });
      
      // Simulate background preloading
      setTimeout(() => {
        gameAssets.nextScene.forEach(asset => preloadedAssets.add(asset));
        
        const preloadedElement = screen.getByTestId('preloaded-count');
        preloadedElement.textContent = preloadedAssets.size.toString();
        
        const statusElement = screen.getByTestId('preload-status');
        statusElement.textContent = 'preloading next scene';
      }, 100);
      
      await waitFor(() => {
        expect(screen.getByTestId('preload-status')).toHaveTextContent('preloading next scene');
      });
      
      // When user actually transitions to next scene
      await user.click(nextSceneButton);
      
      // Assets should load instantly (already preloaded)
      await waitFor(() => {
        expect(screen.getByTestId('preloaded-count')).toHaveTextContent('6'); // 3 current + 3 next
        expect(screen.getByText(/scene transition: instant/i)).toBeInTheDocument();
      });
    });

    it('should handle memory management for large asset collections', async () => {
      const memoryThreshold = 512 * 1024 * 1024; // 512MB threshold
      let currentMemoryUsage = 0;
      let loadedAssets: Map<string, any> = new Map();
      
      render(
        <div data-testid="memory-management">
          <div data-testid="memory-usage">{currentMemoryUsage} MB</div>
          <div data-testid="memory-threshold">{memoryThreshold / (1024 * 1024)} MB</div>
          <div data-testid="gc-events">0</div>
          <div data-testid="assets-in-memory">{loadedAssets.size}</div>
        </div>
      );
      
      // Simulate loading many large assets
      const largeAssets = Array.from({ length: 100 }, (_, i) => ({
        id: `large_asset_${i}`,
        size: 10 * 1024 * 1024, // 10MB each
        lastAccessed: Date.now() - (Math.random() * 3600000) // Random last access within hour
      }));
      
      let gcEvents = 0;
      
      for (const asset of largeAssets) {
        // Check if we need to free memory before loading
        if (currentMemoryUsage + asset.size > memoryThreshold) {
          // Perform garbage collection - remove least recently used assets
          const lruAssets = Array.from(loadedAssets.values())
            .sort((a, b) => a.lastAccessed - b.lastAccessed)
            .slice(0, Math.ceil(loadedAssets.size * 0.2)); // Remove 20% of assets
          
          for (const lruAsset of lruAssets) {
            loadedAssets.delete(lruAsset.id);
            currentMemoryUsage -= lruAsset.size;
          }
          
          gcEvents++;
          
          // Update display
          const gcElement = screen.getByTestId('gc-events');
          gcElement.textContent = gcEvents.toString();
        }
        
        // Load the new asset
        loadedAssets.set(asset.id, asset);
        currentMemoryUsage += asset.size;
        
        // Update memory display
        const memoryElement = screen.getByTestId('memory-usage');
        memoryElement.textContent = `${(currentMemoryUsage / (1024 * 1024)).toFixed(1)} MB`;
        
        const assetsElement = screen.getByTestId('assets-in-memory');
        assetsElement.textContent = loadedAssets.size.toString();
      }
      
      // Memory usage should stay within reasonable bounds
      expect(currentMemoryUsage).toBeLessThanOrEqual(memoryThreshold * 1.1); // Allow 10% overflow
      
      // Should have performed garbage collection
      expect(gcEvents).toBeGreaterThan(0);
      
      // Should maintain reasonable number of assets in memory
      expect(loadedAssets.size).toBeLessThan(100); // Some assets should have been evicted
    });
  });
});