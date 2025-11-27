/**
 * Background Management Panel
 * Production-ready UI for managing performance-optimized table backgrounds
 * with real-time performance monitoring and configuration options
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
    performanceOptimizedBackgroundSystem,
    type BackgroundConfiguration,
    type BackgroundLayer,
    type PerformanceMetrics,
    type WeatherEffect
} from '../services/performanceOptimizedBackground.service';
import styles from './BackgroundManagementPanel.module.css';
import { ErrorBoundary } from './common/ErrorBoundary';
import { LoadingSpinner } from './common/LoadingSpinner';

interface BackgroundManagementPanelProps {
  isOpen: boolean;
  onClose: () => void;
  renderEngine: any; // RenderEngine type
}

const BackgroundManagementPanel: React.FC<BackgroundManagementPanelProps> = ({
  isOpen,
  onClose,
  renderEngine
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeConfiguration, setActiveConfiguration] = useState<string>('default');
  const [configurations, setConfigurations] = useState<BackgroundConfiguration[]>([]);
  const [currentConfig, setCurrentConfig] = useState<BackgroundConfiguration | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);
  const [performanceProfile, setPerformanceProfile] = useState<'low' | 'medium' | 'high' | 'ultra'>('medium');
  const [isStreamingEnabled, setIsStreamingEnabled] = useState(true);
  
  // Layer editing state
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  
  // Weather effects state
  const [weatherEffects, setWeatherEffects] = useState<WeatherEffect[]>([]);
  const [isAddingWeatherEffect, setIsAddingWeatherEffect] = useState(false);

  // Initialize background system
  useEffect(() => {
    if (renderEngine && !performanceOptimizedBackgroundSystem['renderEngine']) {
      performanceOptimizedBackgroundSystem.initialize(renderEngine)
        .then(() => {
          setActiveConfiguration('default');
          loadConfigurations();
        })
        .catch(err => {
          setError('Failed to initialize background system: ' + err.message);
        });
    }
  }, [renderEngine]);

  // Performance metrics polling
  useEffect(() => {
    const interval = setInterval(() => {
      const metrics = performanceOptimizedBackgroundSystem.getPerformanceMetrics();
      setPerformanceMetrics(metrics);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Load configuration when active config changes
  useEffect(() => {
    if (activeConfiguration) {
      loadActiveConfiguration(activeConfiguration);
    }
  }, [activeConfiguration]);

  const loadConfigurations = useCallback(async () => {
    try {
      // In a real implementation, this would load from a server or storage
      const defaultConfig: BackgroundConfiguration = {
        id: 'default',
        name: 'Default Background',
        description: 'Basic stone tile background',
        layers: [
          {
            id: 'stone-base',
            name: 'Stone Base',
            textureUrl: '/assets/backgrounds/stone_tiles.jpg',
            width: 2048,
            height: 2048,
            opacity: 1.0,
            parallaxFactor: 1.0,
            repeat: 'repeat',
            blendMode: 'normal',
            animated: false,
            visible: true,
            zIndex: 0,
            lodLevels: [
              { minZoom: 0, maxZoom: 0.5, textureUrl: '/assets/backgrounds/stone_tiles_256.jpg', scale: 0.25, quality: 'low' },
              { minZoom: 0.5, maxZoom: 1.5, textureUrl: '/assets/backgrounds/stone_tiles_512.jpg', scale: 0.5, quality: 'medium' },
              { minZoom: 1.5, maxZoom: 3.0, textureUrl: '/assets/backgrounds/stone_tiles.jpg', scale: 1.0, quality: 'high' },
              { minZoom: 3.0, maxZoom: 10.0, textureUrl: '/assets/backgrounds/stone_tiles_4k.jpg', scale: 2.0, quality: 'ultra' }
            ]
          }
        ],
        weatherEffects: [],
        ambientColor: '#ffffff',
        globalOpacity: 1.0,
        performanceProfile: 'medium',
        streamingEnabled: true,
        maxTextureSize: 2048,
        compressionEnabled: true
      };

      const dungeonConfig: BackgroundConfiguration = {
        id: 'dungeon',
        name: 'Dark Dungeon',
        description: 'Atmospheric dungeon with multiple layers',
        layers: [
          {
            id: 'dungeon-base',
            name: 'Dungeon Floor',
            textureUrl: '/assets/backgrounds/dungeon_floor.jpg',
            width: 2048,
            height: 2048,
            opacity: 1.0,
            parallaxFactor: 1.0,
            repeat: 'repeat',
            blendMode: 'normal',
            animated: false,
            visible: true,
            zIndex: 0
          },
          {
            id: 'dungeon-overlay',
            name: 'Dungeon Details',
            textureUrl: '/assets/backgrounds/dungeon_details.png',
            width: 2048,
            height: 2048,
            opacity: 0.7,
            parallaxFactor: 0.8,
            repeat: 'repeat',
            blendMode: 'multiply',
            animated: false,
            visible: true,
            zIndex: 1
          },
          {
            id: 'dungeon-atmosphere',
            name: 'Atmospheric Dust',
            textureUrl: '/assets/backgrounds/dust_particles.png',
            width: 1024,
            height: 1024,
            opacity: 0.3,
            parallaxFactor: 0.5,
            repeat: 'repeat',
            blendMode: 'screen',
            animated: true,
            animationSpeed: 0.5,
            animationFrames: [
              '/assets/backgrounds/dust_particles_1.png',
              '/assets/backgrounds/dust_particles_2.png',
              '/assets/backgrounds/dust_particles_3.png'
            ],
            visible: true,
            zIndex: 2
          }
        ],
        weatherEffects: [
          {
            id: 'dungeon-fog',
            type: 'fog',
            intensity: 0.3,
            direction: { x: 0, y: 0 },
            speed: 0.1,
            particleCount: 100,
            opacity: 0.4,
            color: '#666666',
            enabled: true
          }
        ],
        ambientColor: '#444444',
        globalOpacity: 0.9,
        performanceProfile: 'medium',
        streamingEnabled: true,
        maxTextureSize: 2048,
        compressionEnabled: true
      };

      const forestConfig: BackgroundConfiguration = {
        id: 'forest',
        name: 'Enchanted Forest',
        description: 'Lush forest with animated elements',
        layers: [
          {
            id: 'forest-ground',
            name: 'Forest Ground',
            textureUrl: '/assets/backgrounds/forest_ground.jpg',
            width: 4096,
            height: 4096,
            opacity: 1.0,
            parallaxFactor: 1.0,
            repeat: 'repeat',
            blendMode: 'normal',
            animated: false,
            visible: true,
            zIndex: 0
          },
          {
            id: 'forest-vegetation',
            name: 'Vegetation Layer',
            textureUrl: '/assets/backgrounds/forest_vegetation.png',
            width: 2048,
            height: 2048,
            opacity: 0.8,
            parallaxFactor: 0.9,
            repeat: 'repeat',
            blendMode: 'normal',
            animated: false,
            visible: true,
            zIndex: 1
          },
          {
            id: 'forest-canopy',
            name: 'Canopy Shadows',
            textureUrl: '/assets/backgrounds/forest_shadows.png',
            width: 2048,
            height: 2048,
            opacity: 0.5,
            parallaxFactor: 0.7,
            repeat: 'repeat',
            blendMode: 'multiply',
            animated: true,
            animationSpeed: 2.0,
            visible: true,
            zIndex: 2
          }
        ],
        weatherEffects: [
          {
            id: 'forest-wind',
            type: 'wind',
            intensity: 0.6,
            direction: { x: 1, y: 0.2 },
            speed: 1.5,
            particleCount: 50,
            opacity: 0.3,
            color: '#90EE90',
            enabled: true
          }
        ],
        ambientColor: '#e8f5e8',
        globalOpacity: 1.0,
        performanceProfile: 'high',
        streamingEnabled: true,
        maxTextureSize: 4096,
        compressionEnabled: true
      };

      setConfigurations([defaultConfig, dungeonConfig, forestConfig]);
    } catch (err) {
      setError('Failed to load configurations: ' + (err as Error).message);
    }
  }, []);

  const loadActiveConfiguration = useCallback(async (configId: string) => {
    setIsLoading(true);
    try {
      const config = configurations.find(c => c.id === configId);
      if (!config) {
        throw new Error(`Configuration '${configId}' not found`);
      }

      await performanceOptimizedBackgroundSystem.loadBackgroundConfiguration(config);
      await performanceOptimizedBackgroundSystem.setActiveConfiguration(configId);
      
      setCurrentConfig(config);
      setWeatherEffects(config.weatherEffects);
      
    } catch (err) {
      setError('Failed to load configuration: ' + (err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [configurations]);

  const handleLayerUpdate = useCallback((layerId: string, updates: Partial<BackgroundLayer>) => {
    if (!currentConfig) return;

    try {
      performanceOptimizedBackgroundSystem.updateBackgroundLayer(layerId, updates);
      
      // Update local state
      setCurrentConfig(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          layers: prev.layers.map(layer => 
            layer.id === layerId ? { ...layer, ...updates } : layer
          )
        };
      });
    } catch (err) {
      setError('Failed to update layer: ' + (err as Error).message);
    }
  }, [currentConfig]);

  const handleAddWeatherEffect = useCallback((effect: WeatherEffect) => {
    try {
      performanceOptimizedBackgroundSystem.addWeatherEffect(effect);
      setWeatherEffects(prev => [...prev.filter(e => e.id !== effect.id), effect]);
      setIsAddingWeatherEffect(false);
    } catch (err) {
      setError('Failed to add weather effect: ' + (err as Error).message);
    }
  }, []);

  const handleRemoveWeatherEffect = useCallback((effectId: string) => {
    try {
      performanceOptimizedBackgroundSystem.removeWeatherEffect(effectId);
      setWeatherEffects(prev => prev.filter(e => e.id !== effectId));
    } catch (err) {
      setError('Failed to remove weather effect: ' + (err as Error).message);
    }
  }, []);

  const handlePerformanceProfileChange = useCallback((profile: 'low' | 'medium' | 'high' | 'ultra') => {
    performanceOptimizedBackgroundSystem.setPerformanceProfile(profile);
    setPerformanceProfile(profile);
  }, []);

  const handleStreamingToggle = useCallback((enabled: boolean) => {
    performanceOptimizedBackgroundSystem.setStreamingEnabled(enabled);
    setIsStreamingEnabled(enabled);
  }, []);

  if (!isOpen) return null;

  return (
    <ErrorBoundary>
      <div className={styles.backgroundManagementOverlay}>
        <div className={styles.backgroundManagementPanel}>
          <div className={styles.panelHeader}>
            <h2>Background Management</h2>
            <button className={styles.closeBtn} onClick={onClose} aria-label="Close panel">
              ✕
            </button>
          </div>

          {error && (
            <div className={styles.errorMessage} role="alert">
              <span className={styles.errorIcon}>⚠️</span>
              {error}
              <button className={styles.errorDismiss} onClick={() => setError(null)}>✕</button>
            </div>
          )}

          <div className={styles.panelContent}>
            {/* Configuration Selection */}
            <div className={styles.section}>
              <h3>Background Configuration</h3>
              <div className={styles.configSelector}>
                {configurations.map(config => (
                  <button
                    key={config.id}
                    className={`config-option ${activeConfiguration === config.id ? 'active' : ''}`}
                    onClick={() => setActiveConfiguration(config.id)}
                    disabled={isLoading}
                  >
                    <div className={styles.configName}>{config.name}</div>
                    <div className={styles.configDescription}>{config.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Performance Metrics */}
            {performanceMetrics && (
              <div className={styles.section}>
                <h3>Performance Metrics</h3>
                <div className={styles.metricsGrid}>
                  <div className={styles.metric}>
                    <span className={styles.metricLabel}>FPS:</span>
                    <span className={`metric-value ${performanceMetrics.fps < 30 ? 'warning' : performanceMetrics.fps < 60 ? 'caution' : 'good'}`}>
                      {performanceMetrics.fps.toFixed(1)}
                    </span>
                  </div>
                  <div className={styles.metric}>
                    <span className={styles.metricLabel}>Frame Time:</span>
                    <span className={styles.metricValue}>{performanceMetrics.frameTime.toFixed(1)}ms</span>
                  </div>
                  <div className={styles.metric}>
                    <span className={styles.metricLabel}>Draw Calls:</span>
                    <span className={styles.metricValue}>{performanceMetrics.drawCalls}</span>
                  </div>
                  <div className={styles.metric}>
                    <span className={styles.metricLabel}>Background Layers:</span>
                    <span className={styles.metricValue}>{performanceMetrics.backgroundLayers}</span>
                  </div>
                  <div className={styles.metric}>
                    <span className={styles.metricLabel}>LOD Switches:</span>
                    <span className={styles.metricValue}>{performanceMetrics.lodSwitches}</span>
                  </div>
                  <div className={styles.metric}>
                    <span className={styles.metricLabel}>Texture Memory:</span>
                    <span className={styles.metricValue}>{(performanceMetrics.textureMemory / 1024 / 1024).toFixed(1)}MB</span>
                  </div>
                </div>
              </div>
            )}

            {/* Performance Settings */}
            <div className={styles.section}>
              <h3>Performance Settings</h3>
              <div className={styles.settingsGrid}>
                <div className={styles.setting}>
                  <label htmlFor="performance-profile">Performance Profile:</label>
                  <select
                    id="performance-profile"
                    value={performanceProfile}
                    onChange={(e) => handlePerformanceProfileChange(e.target.value as any)}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="ultra">Ultra</option>
                  </select>
                </div>
                <div className={styles.setting}>
                  <label htmlFor="streaming-enabled">
                    <input
                      type="checkbox"
                      id="streaming-enabled"
                      checked={isStreamingEnabled}
                      onChange={(e) => handleStreamingToggle(e.target.checked)}
                    />
                    Enable Background Streaming
                  </label>
                </div>
              </div>
            </div>

            {/* Background Layers */}
            {currentConfig && (
              <div className={styles.section}>
                <h3>Background Layers</h3>
                <div className={styles.layersList}>
                  {currentConfig.layers
                    .sort((a, b) => a.zIndex - b.zIndex)
                    .map(layer => (
                    <div key={layer.id} className={`layer-item ${selectedLayerId === layer.id ? 'selected' : ''}`}>
                      <div className={styles.layerHeader} onClick={() => setSelectedLayerId(layer.id)}>
                        <div className={styles.layerInfo}>
                          <span className={styles.layerName}>{layer.name}</span>
                          <span className={styles.layerDetails}>
                            Z: {layer.zIndex} | Opacity: {(layer.opacity * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div className={styles.layerControls}>
                          <button
                            className={styles.visibilityToggle}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleLayerUpdate(layer.id, { visible: !layer.visible });
                            }}
                            aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
                          >
                            {layer.visible ? '👁️' : '👁️‍🗨️'}
                          </button>
                          <button
                            className={styles.editBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLayerId(layer.id);
                            }}
                            aria-label="Edit layer"
                          >
                            ✏️
                          </button>
                        </div>
                      </div>
                      
                      {selectedLayerId === layer.id && (
                        <div className={styles.layerDetailsPanel}>
                          <div className={styles.layerProperty}>
                            <label>Opacity:</label>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.1"
                              value={layer.opacity}
                              onChange={(e) => handleLayerUpdate(layer.id, { opacity: parseFloat(e.target.value) })}
                            />
                            <span>{(layer.opacity * 100).toFixed(0)}%</span>
                          </div>
                          <div className={styles.layerProperty}>
                            <label>Parallax Factor:</label>
                            <input
                              type="range"
                              min="0"
                              max="2"
                              step="0.1"
                              value={layer.parallaxFactor}
                              onChange={(e) => handleLayerUpdate(layer.id, { parallaxFactor: parseFloat(e.target.value) })}
                            />
                            <span>{layer.parallaxFactor.toFixed(1)}</span>
                          </div>
                          <div className={styles.layerProperty}>
                            <label>Blend Mode:</label>
                            <select
                              value={layer.blendMode}
                              onChange={(e) => handleLayerUpdate(layer.id, { blendMode: e.target.value as any })}
                            >
                              <option value="normal">Normal</option>
                              <option value="multiply">Multiply</option>
                              <option value="screen">Screen</option>
                              <option value="overlay">Overlay</option>
                              <option value="soft-light">Soft Light</option>
                            </select>
                          </div>
                          {layer.animated && (
                            <div className={styles.layerProperty}>
                              <label>Animation Speed:</label>
                              <input
                                type="range"
                                min="0"
                                max="5"
                                step="0.1"
                                value={layer.animationSpeed || 1}
                                onChange={(e) => handleLayerUpdate(layer.id, { animationSpeed: parseFloat(e.target.value) })}
                              />
                              <span>{(layer.animationSpeed || 1).toFixed(1)}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Weather Effects */}
            <div className={styles.section}>
              <h3>Weather Effects</h3>
              <div className={styles.weatherEffects}>
                {weatherEffects.map(effect => (
                  <div key={effect.id} className={styles.weatherEffect}>
                    <div className="effect-info">
                      <span className="effect-type">{effect.type}</span>
                      <span className={styles.effectIntensity}>Intensity: {(effect.intensity * 100).toFixed(0)}%</span>
                    </div>
                    <div className="effect-controls">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={effect.intensity}
                        onChange={(e) => {
                          const updatedEffect = { ...effect, intensity: parseFloat(e.target.value) };
                          handleAddWeatherEffect(updatedEffect);
                        }}
                      />
                      <button
                        className="remove-effect"
                        onClick={() => handleRemoveWeatherEffect(effect.id)}
                        aria-label="Remove weather effect"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
                
                <button
                  className="add-weather-btn"
                  onClick={() => setIsAddingWeatherEffect(true)}
                  disabled={isAddingWeatherEffect}
                >
                  + Add Weather Effect
                </button>
                
                {isAddingWeatherEffect && (
                  <div className="add-weather-form">
                    <select onChange={(e) => {
                      if (e.target.value) {
                        const newEffect: WeatherEffect = {
                          id: `${e.target.value}_${Date.now()}`,
                          type: e.target.value as any,
                          intensity: 0.5,
                          direction: { x: 1, y: 0 },
                          speed: 1.0,
                          particleCount: 100,
                          opacity: 0.5,
                          color: '#ffffff',
                          enabled: true
                        };
                        handleAddWeatherEffect(newEffect);
                      }
                    }}>
                      <option value="">Select Weather Effect</option>
                      <option value="rain">Rain</option>
                      <option value="snow">Snow</option>
                      <option value="fog">Fog</option>
                      <option value="storm">Storm</option>
                      <option value="wind">Wind</option>
                      <option value="particles">Particles</option>
                    </select>
                    <button onClick={() => setIsAddingWeatherEffect(false)}>Cancel</button>
                  </div>
                )}
              </div>
            </div>

            {isLoading && (
              <div className="loading-overlay">
                <LoadingSpinner size="large" />
                <p>Loading background configuration...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default BackgroundManagementPanel;