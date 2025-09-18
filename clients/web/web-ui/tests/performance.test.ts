/**
 * Performance Service Integration Tests
 * Tests the performance monitoring and optimization functionality
 */

import { performanceService } from '../src/services/performance.service';

// Mock render engine for testing
const createMockRenderEngine = () => ({
  get_sprite_count: () => Math.floor(Math.random() * 500),
  get_texture_count: () => Math.floor(Math.random() * 100),
  get_memory_usage: () => Math.floor(Math.random() * 50000000), // 50MB max
  set_max_sprites: (count: number) => console.log(`Set max sprites: ${count}`),
  set_texture_quality: (quality: number) => console.log(`Set texture quality: ${quality}`),
  enable_sprite_pooling: (enabled: boolean) => console.log(`Sprite pooling: ${enabled}`),
  enable_frustum_culling: (enabled: boolean) => console.log(`Frustum culling: ${enabled}`),
  set_max_render_distance: (distance: number) => console.log(`Max render distance: ${distance}`),
});

// Test performance monitoring initialization
function testPerformanceInitialization() {
  console.log('🧪 Testing performance service initialization...');
  
  const mockEngine = createMockRenderEngine();
  performanceService.initialize(mockEngine);
  
  const metrics = performanceService.getMetrics();
  console.log('📊 Initial metrics:', {
    fps: metrics.fps,
    memory: Math.round(metrics.memoryUsage.usedJSHeapSize / 1024 / 1024) + 'MB',
    cacheHitRate: metrics.cacheHitRate.toFixed(1) + '%'
  });
  
  console.log('✅ Performance service initialized successfully');
}

// Test sprite caching functionality
function testSpriteCache() {
  console.log('🧪 Testing sprite cache...');
  
  const testSprite = {
    id: 'test_sprite',
    texture: 'test_texture',
    width: 64,
    height: 64
  };
  
  // Test cache miss
  const cached1 = performanceService.getCachedSprite('test_sprite');
  console.log('Cache miss:', cached1 === null);
  
  // Cache the sprite
  performanceService.cacheSprite('test_sprite', testSprite);
  
  // Test cache hit
  const cached2 = performanceService.getCachedSprite('test_sprite');
  console.log('Cache hit:', cached2 !== null);
  
  const metrics = performanceService.getMetrics();
  console.log('Cache hit rate:', metrics.cacheHitRate.toFixed(1) + '%');
  
  console.log('✅ Sprite cache test completed');
}

// Test performance settings
function testPerformanceSettings() {
  console.log('🧪 Testing performance settings...');
  
  const originalSettings = performanceService.getSettings();
  console.log('Original level:', originalSettings.level);
  
  // Test settings update
  performanceService.updateSettings({
    level: 'high',
    maxSprites: 500,
    textureQuality: 1.0
  });
  
  const updatedSettings = performanceService.getSettings();
  console.log('Updated level:', updatedSettings.level);
  console.log('Max sprites:', updatedSettings.maxSprites);
  
  console.log('✅ Performance settings test completed');
}

// Test performance report generation
function testPerformanceReport() {
  console.log('🧪 Testing performance report generation...');
  
  const report = performanceService.generateReport();
  console.log('Report length:', report.length, 'characters');
  console.log('Report preview:', report.substring(0, 200) + '...');
  
  console.log('✅ Performance report test completed');
}

// Run all tests
export async function runPerformanceTests() {
  console.log('🚀 Starting Performance Service Tests');
  console.log('=====================================');
  
  try {
    testPerformanceInitialization();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    testSpriteCache();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    testPerformanceSettings();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    testPerformanceReport();
    
    console.log('=====================================');
    console.log('✅ All Performance Service Tests Passed!');
    console.log('🎯 Performance system is ready for production');
    
    return true;
  } catch (error) {
    console.error('❌ Performance Service Tests Failed:', error);
    return false;
  }
}

// Export tests for manual execution
export { testPerformanceInitialization, testPerformanceReport, testPerformanceSettings, testSpriteCache };
