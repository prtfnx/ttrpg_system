import React, { useEffect, useState } from 'react';
import fpsService, { type FPSMetrics } from '../services/fps.service';
import type { PerformanceMetrics } from '../services/performance.service';
import { performanceService } from '../services/performance.service';
import styles from './PerformanceMonitor.module.css';

interface PerformanceMonitorProps {
  isVisible: boolean;
  onToggle?: () => void;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

const positionClassNames = {
  'top-left': styles.topLeft,
  'top-right': styles.topRight,
  'bottom-left': styles.bottomLeft,
  'bottom-right': styles.bottomRight,
} as const;

export const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({
  isVisible,
  onToggle,
  position = 'top-right'
}) => {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [fpsMetrics, setFpsMetrics] = useState<FPSMetrics>({
    current: 0,
    average: 0,
    min: 0,
    max: 0,
    frameTime: 0
  });
  const [expanded, setExpanded] = useState(false);

  // Subscribe to unified FPS service
  useEffect(() => {
    const unsubscribe = fpsService.subscribe(setFpsMetrics);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    const updateMetrics = () => {
      setMetrics(performanceService.getMetrics());
    };

    // Update every 500ms for smooth UI
    const interval = setInterval(updateMetrics, 500);
    updateMetrics(); // Initial update

    return () => clearInterval(interval);
  }, [isVisible]);

  if (!isVisible || !metrics) return null;

  const getFPSColor = (fps: number): string => {
    if (fps >= 55) return 'var(--status-success)';
    if (fps >= 40) return 'var(--yellow-400)';
    if (fps >= 25) return 'var(--status-warning)';
    return 'var(--status-error)';
  };

  const getMemoryUsagePercent = (): number => {
    if (!metrics || metrics.memoryUsage.jsHeapSizeLimit === 0) return 0;
    return (metrics.memoryUsage.usedJSHeapSize / metrics.memoryUsage.jsHeapSizeLimit) * 100;
  };

  const formatBytes = (bytes: number): string => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)}MB`;
  };

  return (
    <div className={`${styles.performanceMonitor} ${positionClassNames[position]}`}>
      {/* Compact FPS Display */}
      <div 
        className={styles.compact}
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: 'pointer' }}
      >
        <div className={styles.fpsDisplay}>
          <span 
            className={styles.fpsValue}
            style={{ color: getFPSColor(fpsMetrics.average) }}
          >
            {Math.round(fpsMetrics.average)}
          </span>
          <span className={styles.fpsLabel}>FPS</span>
        </div>
        
        <div className={styles.memoryDisplay}>
          <span className={styles.memoryLabel}>Memory</span>
          <div className={styles.memoryBar}>
            <div
              className={styles.memoryFill}
              style={{
                width: `${Math.min(100, getMemoryUsagePercent())}%`,
                backgroundColor: getMemoryUsagePercent() > 80 ? 'var(--status-error)' : 'var(--status-success)'
              }}
            />
          </div>
        </div>
        
        <div className={styles.frameTimeDisplay}>
          <span>Frame Time: {fpsMetrics.frameTime.toFixed(1)}ms</span>
        </div>
      </div>

      {/* Expanded Performance Panel */}
      {expanded && (
        <div className={styles.expanded}>
          <div className={styles.performanceHeader}>
            <h3>Performance Monitor</h3>
            {onToggle && (
              <button onClick={onToggle} className={styles.closeBtn}>×</button>
            )}
          </div>

          <div className={styles.performanceGrid}>
            {/* FPS Section */}
            <div className={styles.metricGroup}>
              <div className={styles.metricLabel}>Frame Rate</div>
              <div className={styles.metricRow}>
                <span>Current:</span>
                <span style={{ color: getFPSColor(fpsMetrics.current) }}>
                  {Math.round(fpsMetrics.current)} FPS
                </span>
              </div>
              <div className={styles.metricRow}>
                <span>Average:</span>
                <span style={{ color: getFPSColor(fpsMetrics.average) }}>
                  {Math.round(fpsMetrics.average)} FPS
                </span>
              </div>
              <div className={styles.metricRow}>
                <span>Min:</span>
                <span style={{ color: getFPSColor(fpsMetrics.min) }}>
                  {Math.round(fpsMetrics.min)} FPS
                </span>
              </div>
              <div className={styles.metricRow}>
                <span>Max:</span>
                <span style={{ color: getFPSColor(fpsMetrics.max) }}>
                  {Math.round(fpsMetrics.max)} FPS
                </span>
              </div>
              <div className={styles.metricRow}>
                <span>Frame Time:</span>
                <span>{fpsMetrics.frameTime.toFixed(2)}ms</span>
              </div>
            </div>

            {/* Memory Section */}
            <div className={styles.metricGroup}>
              <div className={styles.metricLabel}>Memory Usage</div>
              {metrics && (
                <>
                  <div className={styles.metricRow}>
                    <span>JS Heap:</span>
                    <span>{formatBytes(metrics.memoryUsage.usedJSHeapSize)}</span>
                  </div>
                  <div className={styles.metricRow}>
                    <span>Total:</span>
                    <span>{formatBytes(metrics.memoryUsage.totalJSHeapSize)}</span>
                  </div>
                  <div className={styles.metricRow}>
                    <span>Limit:</span>
                    <span>{formatBytes(metrics.memoryUsage.jsHeapSizeLimit)}</span>
                  </div>
                  {metrics.wasmMemoryUsage > 0 && (
                    <div className={styles.metricRow}>
                      <span>WASM:</span>
                      <span>{formatBytes(metrics.wasmMemoryUsage)}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Rendering Section */}
            <div className={styles.metricGroup}>
              <div className={styles.metricLabel}>Rendering</div>
              {metrics && (
                <>
                  <div className={styles.metricRow}>
                    <span>Sprites:</span>
                    <span>{metrics.spriteCount.toLocaleString()}</span>
                  </div>
                  <div className={styles.metricRow}>
                    <span>Textures:</span>
                    <span>{metrics.textureCount.toLocaleString()}</span>
                  </div>
                  <div className={styles.metricRow}>
                    <span>Cache Hit:</span>
                    <span>{metrics.cacheHitRate.toFixed(1)}%</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Performance Actions */}
          <div className={styles.performanceActions}>
            <button 
              onClick={() => performanceService.clearSpriteCache()}
              className={styles.actionBtn}
            >
              Clear Sprite Cache
            </button>
            <button 
              onClick={() => performanceService.clearTextureCache()}
              className={styles.actionBtn}
            >
              Clear Texture Cache
            </button>
            <button 
              onClick={() => {
                const report = performanceService.generateReport();
                navigator.clipboard?.writeText(report);
              }}
              className={styles.actionBtn}
            >
              Copy Report
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PerformanceMonitor;
