import React, { useEffect, useState } from 'react';
import type { PerformanceMetrics } from '../services/performance.service';
import { performanceService } from '../services/performance.service';
import './PerformanceMonitor.css';

interface PerformanceMonitorProps {
  isVisible: boolean;
  onToggle?: () => void;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

export const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({
  isVisible,
  onToggle,
  position = 'top-right'
}) => {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [expanded, setExpanded] = useState(false);

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
    if (fps >= 55) return '#4ade80'; // Green
    if (fps >= 40) return '#facc15'; // Yellow
    if (fps >= 25) return '#fb923c'; // Orange
    return '#ef4444'; // Red
  };

  const getMemoryUsagePercent = (): number => {
    if (metrics.memoryUsage.jsHeapSizeLimit === 0) return 0;
    return (metrics.memoryUsage.usedJSHeapSize / metrics.memoryUsage.jsHeapSizeLimit) * 100;
  };

  const formatBytes = (bytes: number): string => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)}MB`;
  };

  return (
    <div className={`performance-monitor performance-monitor--${position}`}>
      {/* Compact FPS Display */}
      <div 
        className="performance-monitor__compact"
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: 'pointer' }}
      >
        <div className="fps-display">
          <span 
            className="fps-value" 
            style={{ color: getFPSColor(metrics.averageFPS) }}
          >
            {Math.round(metrics.averageFPS)}
          </span>
          <span className="fps-label">FPS</span>
        </div>
        
        <div className="memory-bar">
          <span className="memory-label">Memory</span>
          <div 
            className="memory-fill"
            style={{ 
              width: `${Math.min(100, getMemoryUsagePercent())}%`,
              backgroundColor: getMemoryUsagePercent() > 80 ? '#ef4444' : '#4ade80'
            }}
          />
        </div>
        
        <div className="frame-time-display">
          <span className="frame-time-label">Frame Time: {metrics.frameTime.toFixed(1)}ms</span>
        </div>
      </div>

      {/* Expanded Performance Panel */}
      {expanded && (
        <div className="performance-monitor__expanded">
          <div className="performance-header">
            <h3>Performance Monitor</h3>
            {onToggle && (
              <button onClick={onToggle} className="close-btn">×</button>
            )}
          </div>

          <div className="performance-grid">
            {/* FPS Section */}
            <div className="metric-group">
              <div className="metric-label">Frame Rate</div>
              <div className="metric-row">
                <span>Current:</span>
                <span style={{ color: getFPSColor(metrics.fps) }}>
                  {Math.round(metrics.fps)} FPS
                </span>
              </div>
              <div className="metric-row">
                <span>Average:</span>
                <span style={{ color: getFPSColor(metrics.averageFPS) }}>
                  {Math.round(metrics.averageFPS)} FPS
                </span>
              </div>
              <div className="metric-row">
                <span>Frame Time:</span>
                <span>{metrics.frameTime.toFixed(2)}ms</span>
              </div>
            </div>

            {/* Memory Section */}
            <div className="metric-group">
              <div className="metric-label">Memory Usage</div>
              <div className="metric-row">
                <span>JS Heap:</span>
                <span>{formatBytes(metrics.memoryUsage.usedJSHeapSize)}</span>
              </div>
              <div className="metric-row">
                <span>Total:</span>
                <span>{formatBytes(metrics.memoryUsage.totalJSHeapSize)}</span>
              </div>
              <div className="metric-row">
                <span>Limit:</span>
                <span>{formatBytes(metrics.memoryUsage.jsHeapSizeLimit)}</span>
              </div>
              {metrics.wasmMemoryUsage > 0 && (
                <div className="metric-row">
                  <span>WASM:</span>
                  <span>{formatBytes(metrics.wasmMemoryUsage)}</span>
                </div>
              )}
            </div>

            {/* Rendering Section */}
            <div className="metric-group">
              <div className="metric-label">Rendering</div>
              <div className="metric-row">
                <span>Sprites:</span>
                <span>{metrics.spriteCount.toLocaleString()}</span>
              </div>
              <div className="metric-row">
                <span>Textures:</span>
                <span>{metrics.textureCount.toLocaleString()}</span>
              </div>
              <div className="metric-row">
                <span>Cache Hit:</span>
                <span>{metrics.cacheHitRate.toFixed(1)}%</span>
              </div>
            </div>
          </div>

          {/* Performance Actions */}
          <div className="performance-actions">
            <button 
              onClick={() => performanceService.clearSpriteCache()}
              className="action-btn"
            >
              Clear Sprite Cache
            </button>
            <button 
              onClick={() => performanceService.clearTextureCache()}
              className="action-btn"
            >
              Clear Texture Cache
            </button>
            <button 
              onClick={() => {
                const report = performanceService.generateReport();
                console.log(report);
                navigator.clipboard?.writeText(report);
              }}
              className="action-btn"
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