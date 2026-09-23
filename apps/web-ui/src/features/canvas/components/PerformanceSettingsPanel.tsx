import { performanceService } from '@features/canvas';
import { Modal } from '@shared/components';
import React, { useEffect, useState } from 'react';
import styles from './PerformanceSettingsPanel.module.css';

interface PerformanceSettingsPanelProps {
  isVisible: boolean;
  onClose: () => void;
}

export const PerformanceSettingsPanel: React.FC<PerformanceSettingsPanelProps> = ({
  isVisible,
  onClose,
}) => {
  const [metrics, setMetrics] = useState(performanceService.getMetrics());

  useEffect(() => {
    if (!isVisible) return;
    const update = () => setMetrics(performanceService.getMetrics());
    update();
    const interval = window.setInterval(update, 500);
    return () => window.clearInterval(interval);
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <Modal isOpen onClose={onClose} title="Renderer Performance" size="large">
      <div className={styles.settingsContent}>
        <p>
          Renderer quality controls are unavailable until they are backed by the Rust engine.
          Viewport culling will be enabled by the renderer and will not be a production toggle.
        </p>
        <div className={styles.performanceInfo}>
          <h3>Current diagnostics</h3>
          <div className={styles.perfInfoGrid}>
            <Stat label="FPS" value={Math.round(metrics.averageFPS).toString()} />
            <Stat label="CPU p50" value={`${metrics.frameTimeP50.toFixed(2)}ms`} />
            <Stat label="CPU p95" value={`${metrics.frameTimeP95.toFixed(2)}ms`} />
            <Stat label="CPU max" value={`${metrics.frameTimeMax.toFixed(2)}ms`} />
            <Stat label="Sprites" value={`${metrics.spritesDrawn}/${metrics.spritesConsidered}`} />
            <Stat label="Culled" value={metrics.spritesCulled.toLocaleString()} />
            <Stat label="Draw calls" value={metrics.drawCalls.toLocaleString()} />
            <Stat label="Buffer uploads" value={metrics.bufferUploads.toLocaleString()} />
            <Stat label="Textures" value={metrics.residentTextures.toLocaleString()} />
            <Stat
              label="Texture memory"
              value={`${formatMiB(metrics.estimatedTextureBytes)} / ${formatMiB(metrics.textureBudgetBytes)}`}
            />
            <Stat label="Texture over budget" value={formatMiB(metrics.textureOverBudgetBytes)} />
            <Stat label="Active lights" value={metrics.activeLights.toLocaleString()} />
            <Stat label="Shadow draws" value={metrics.shadowDrawCalls.toLocaleString()} />
            <Stat label="Occlusion revision" value={metrics.occlusionRevision.toLocaleString()} />
          </div>
        </div>
      </div>
    </Modal>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className={styles.perfStat}>
    <span className={styles.statLabel}>{label}:</span>
    <span className={styles.statValue}>{value}</span>
  </div>
);

const formatMiB = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MiB`;

export default PerformanceSettingsPanel;
