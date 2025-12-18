import React, { useEffect, useState } from 'react';
import type { PerformanceSettings } from '../services/performance.service';
import { PerformanceLevel, performanceService } from '../services/performance.service';
import styles from './PerformanceSettingsPanel.module.css';

interface PerformanceSettingsPanelProps {
  isVisible: boolean;
  onClose: () => void;
}

export const PerformanceSettingsPanel: React.FC<PerformanceSettingsPanelProps> = ({
  isVisible,
  onClose
}) => {
  const [settings, setSettings] = useState<PerformanceSettings | null>(null);
  const [tempSettings, setTempSettings] = useState<PerformanceSettings | null>(null);

  useEffect(() => {
    if (isVisible) {
      const currentSettings = performanceService.getSettings();
      setSettings(currentSettings);
      setTempSettings({ ...currentSettings });
    }
  }, [isVisible]);

  if (!isVisible || !settings || !tempSettings) return null;

  const handleSettingChange = (key: keyof PerformanceSettings, value: any) => {
    setTempSettings({
      ...tempSettings,
      [key]: value
    });
  };

  const handleApply = () => {
    performanceService.updateSettings(tempSettings);
    setSettings({ ...tempSettings });
  };

  const handleReset = () => {
    setTempSettings({ ...settings });
  };

  const handleAutoOptimize = () => {
    // Trigger auto-optimization based on current performance
    const metrics = performanceService.getMetrics();
    let newLevel = tempSettings.level;
    
    if (metrics.averageFPS < 30) {
      newLevel = PerformanceLevel.LOW;
    } else if (metrics.averageFPS < 45) {
      newLevel = PerformanceLevel.MEDIUM;
    } else if (metrics.averageFPS >= 60) {
      newLevel = PerformanceLevel.HIGH;
    }

    const optimizedSettings = getSettingsForLevel(newLevel);
    setTempSettings(optimizedSettings);
  };

  const getSettingsForLevel = (level: PerformanceLevel): PerformanceSettings => {
    const baseSettings = { ...tempSettings, level };
    
    switch (level) {
      case PerformanceLevel.LOW:
        return {
          ...baseSettings,
          maxSprites: 100,
          textureQuality: 0.5,
          shadowQuality: 0,
          maxRenderDistance: 500,
          enableFrustumCulling: true
        };
      case PerformanceLevel.MEDIUM:
        return {
          ...baseSettings,
          maxSprites: 250,
          textureQuality: 0.75,
          shadowQuality: 1,
          maxRenderDistance: 1000,
          enableFrustumCulling: true
        };
      case PerformanceLevel.HIGH:
        return {
          ...baseSettings,
          maxSprites: 500,
          textureQuality: 1.0,
          shadowQuality: 2,
          maxRenderDistance: 2000,
          enableFrustumCulling: true
        };
      case PerformanceLevel.ULTRA:
        return {
          ...baseSettings,
          maxSprites: 1000,
          textureQuality: 1.0,
          shadowQuality: 3,
          maxRenderDistance: 4000,
          enableFrustumCulling: false
        };
      default:
        return baseSettings;
    }
  };

  const hasChanges = JSON.stringify(settings) !== JSON.stringify(tempSettings);

  return (
    <div className={styles.performanceSettingsOverlay}>
      <div className={styles.performanceSettingsPanel}>
        <div className={styles.settingsHeader}>
          <h2>Performance Settings</h2>
          <button onClick={onClose} className={styles.closeButton}>×</button>
        </div>

        <div className={styles.settingsContent}>
          {/* Performance Level */}
          <div className={styles.settingGroup}>
            <label className={styles.settingLabel}>Performance Level</label>
            <select
              value={tempSettings.level}
              onChange={(e) => {
                const level = e.target.value as PerformanceLevel;
                setTempSettings(getSettingsForLevel(level));
              }}
              className={styles.settingSelect}
            >
              <option value={PerformanceLevel.LOW}>Low (30 FPS)</option>
              <option value={PerformanceLevel.MEDIUM}>Medium (45 FPS)</option>
              <option value={PerformanceLevel.HIGH}>High (60 FPS)</option>
              <option value={PerformanceLevel.ULTRA}>Ultra (120 FPS)</option>
            </select>
          </div>

          {/* Sprite Settings */}
          <div className={styles.settingGroup}>
            <label className={styles.settingLabel}>
              Max Sprites: {tempSettings.maxSprites.toLocaleString()}
            </label>
            <input
              type="range"
              min="50"
              max="2000"
              step="50"
              value={tempSettings.maxSprites}
              onChange={(e) => handleSettingChange('maxSprites', parseInt(e.target.value))}
              className={styles.settingSlider}
            />
          </div>

          {/* Texture Quality */}
          <div className={styles.settingGroup}>
            <label className={styles.settingLabel}>
              Texture Quality: {Math.round(tempSettings.textureQuality * 100)}%
            </label>
            <input
              type="range"
              min="0.25"
              max="1"
              step="0.05"
              value={tempSettings.textureQuality}
              onChange={(e) => handleSettingChange('textureQuality', parseFloat(e.target.value))}
              className={styles.settingSlider}
            />
          </div>

          {/* Shadow Quality */}
          <div className={styles.settingGroup}>
            <label className={styles.settingLabel}>Shadow Quality</label>
            <select
              value={tempSettings.shadowQuality}
              onChange={(e) => handleSettingChange('shadowQuality', parseInt(e.target.value))}
              className={styles.settingSelect}
            >
              <option value={0}>Disabled</option>
              <option value={1}>Low</option>
              <option value={2}>Medium</option>
              <option value={3}>High</option>
            </select>
          </div>

          {/* Render Distance */}
          <div className={styles.settingGroup}>
            <label className={styles.settingLabel}>
              Max Render Distance: {tempSettings.maxRenderDistance.toLocaleString()}px
            </label>
            <input
              type="range"
              min="200"
              max="5000"
              step="100"
              value={tempSettings.maxRenderDistance}
              onChange={(e) => handleSettingChange('maxRenderDistance', parseInt(e.target.value))}
              className={styles.settingSlider}
            />
          </div>

          {/* Feature Toggles */}
          <div className={styles.settingsSection}>
            <h3>Advanced Features</h3>
            
            <div className={styles.settingToggle}>
              <label className={styles.toggleLabel}>
                <input
                  type="checkbox"
                  checked={tempSettings.enableVSync}
                  onChange={(e) => handleSettingChange('enableVSync', e.target.checked)}
                />
                <span className={styles.toggleSwitch}></span>
                VSync
              </label>
            </div>

            <div className={styles.settingToggle}>
              <label className={styles.toggleLabel}>
                <input
                  type="checkbox"
                  checked={tempSettings.enableSpritePooling}
                  onChange={(e) => handleSettingChange('enableSpritePooling', e.target.checked)}
                />
                <span className={styles.toggleSwitch}></span>
                Sprite Pooling
              </label>
            </div>

            <div className={styles.settingToggle}>
              <label className={styles.toggleLabel}>
                <input
                  type="checkbox"
                  checked={tempSettings.enableTextureCaching}
                  onChange={(e) => handleSettingChange('enableTextureCaching', e.target.checked)}
                />
                <span className={styles.toggleSwitch}></span>
                Texture Caching
              </label>
            </div>

            <div className={styles.settingToggle}>
              <label className={styles.toggleLabel}>
                <input
                  type="checkbox"
                  checked={tempSettings.enableFrustumCulling}
                  onChange={(e) => handleSettingChange('enableFrustumCulling', e.target.checked)}
                />
                <span className={styles.toggleSwitch}></span>
                Frustum Culling
              </label>
            </div>
          </div>

          {/* Current Performance Info */}
          <div className={styles.performanceInfo}>
            <h3>Current Performance</h3>
            <PerformanceInfo />
          </div>
        </div>

        <div className={styles.settingsActions}>
          <button 
            onClick={handleAutoOptimize}
            className={styles.autoOptimize}
          >
            Auto Optimize
          </button>
          <button 
            onClick={handleReset}
            disabled={!hasChanges}
            className={styles.reset}
          >
            Reset
          </button>
          <button 
            onClick={handleApply}
            disabled={!hasChanges}
            className={styles.apply}
          >
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
};

// Component to show current performance info
const PerformanceInfo: React.FC = () => {
  const [metrics, setMetrics] = useState(performanceService.getMetrics());

  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(performanceService.getMetrics());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className={styles.perfInfoGrid}>
      <div className={styles.perfStat}>
        <span className={styles.statLabel}>FPS:</span>
        <span className={styles.statValue}>{Math.round(metrics.averageFPS)}</span>
      </div>
      <div className={styles.perfStat}>
        <span className={styles.statLabel}>Memory:</span>
        <span className={styles.statValue}>
          {Math.round(metrics.memoryUsage.usedJSHeapSize / 1024 / 1024)}MB
        </span>
      </div>
      <div className={styles.perfStat}>
        <span className={styles.statLabel}>Sprites:</span>
        <span className={styles.statValue}>{metrics.spriteCount.toLocaleString()}</span>
      </div>
      <div className={styles.perfStat}>
        <span className={styles.statLabel}>Cache Hit:</span>
        <span className={styles.statValue}>{metrics.cacheHitRate.toFixed(1)}%</span>
      </div>
    </div>
  );
};

export default PerformanceSettingsPanel;