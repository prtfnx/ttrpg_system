import clsx from 'clsx';
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

  const getFPSClass = (fps: number): string => {
    if (fps >= 55) return styles.fpsExcellent;
    if (fps >= 40) return styles.fpsGood;
    if (fps >= 25) return styles.fpsWarning;
    return styles.fpsCritical;
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
      <button
        type="button"
        className={styles.compact}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <div className={styles.fpsDisplay}>
          <span className={clsx(styles.fpsValue, getFPSClass(fpsMetrics.average))}>
            {Math.round(fpsMetrics.average)}
          </span>
          <span className={styles.fpsLabel}>FPS</span>
        </div>
        
        <div className={styles.memoryDisplay}>
          <span className={styles.memoryLabel}>Memory</span>
          <div className={styles.memoryBar}>
            <div
              className={clsx(
                styles.memoryFill,
                getMemoryUsagePercent() > 80 ? styles.memoryCritical : styles.memoryHealthy
              )}
              style={{ width: `${Math.min(100, getMemoryUsagePercent())}%` }}
            />
          </div>
        </div>
        
        <div className={styles.frameTimeDisplay}>
          <span>Render CPU: {metrics.frameTimeP95.toFixed(1)}ms p95</span>
        </div>
      </button>

      {/* Expanded Performance Panel */}
      {expanded && (
        <div className={styles.expanded}>
          <div className={styles.performanceHeader}>
            <h3>Performance Monitor</h3>
            {onToggle && (
              <button type="button" onClick={onToggle} className={styles.closeBtn} aria-label="Close performance monitor">×</button>
            )}
          </div>

          <div className={styles.performanceGrid}>
            {/* FPS Section */}
            <div className={styles.metricGroup}>
              <div className={styles.metricLabel}>Frame Rate</div>
              <div className={styles.metricRow}>
                <span>Current:</span>
                <span className={getFPSClass(fpsMetrics.current)}>
                  {Math.round(fpsMetrics.current)} FPS
                </span>
              </div>
              <div className={styles.metricRow}>
                <span>Average:</span>
                <span className={getFPSClass(fpsMetrics.average)}>
                  {Math.round(fpsMetrics.average)} FPS
                </span>
              </div>
              <div className={styles.metricRow}>
                <span>Min:</span>
                <span className={getFPSClass(fpsMetrics.min)}>
                  {Math.round(fpsMetrics.min)} FPS
                </span>
              </div>
              <div className={styles.metricRow}>
                <span>Max:</span>
                <span className={getFPSClass(fpsMetrics.max)}>
                  {Math.round(fpsMetrics.max)} FPS
                </span>
              </div>
              <div className={styles.metricRow}><span>Callback interval:</span><span>{fpsMetrics.frameTime.toFixed(2)}ms</span></div>
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
                </>
              )}
            </div>

            {/* Rendering Section */}
            <div className={styles.metricGroup}>
              <div className={styles.metricLabel}>Rendering</div>
              {metrics && (
                <>
                  <div className={styles.metricRow}>
                    <span>Sprites drawn:</span>
                    <span>{metrics.spritesDrawn.toLocaleString()} / {metrics.spritesConsidered.toLocaleString()}</span>
                  </div>
                  <div className={styles.metricRow}>
                    <span>Culled:</span>
                    <span>{metrics.spritesCulled.toLocaleString()}</span>
                  </div>
                  <div className={styles.metricRow}>
                    <span>Draws / uploads:</span>
                    <span>{metrics.drawCalls} / {metrics.bufferUploads}</span>
                  </div>
                  <div className={styles.metricRow}>
                    <span>Textures:</span>
                    <span>
                      {metrics.residentTextures.toLocaleString()} ({(metrics.estimatedTextureBytes / 1024 / 1024).toFixed(1)} / {(metrics.textureBudgetBytes / 1024 / 1024).toFixed(1)} MiB)
                    </span>
                  </div>
                  <div className={styles.metricRow}>
                    <span>Lights:</span>
                    <span>{metrics.activeLights}</span>
                  </div>
                  <div className={styles.metricRow}>
                    <span>Shadow draws:</span>
                    <span>{metrics.shadowDrawCalls}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className={styles.performanceActions}>
            <button 
              type="button"
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
