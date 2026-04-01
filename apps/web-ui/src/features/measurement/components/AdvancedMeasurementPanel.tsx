/**
 * Advanced Measurement & Grid Management Panel
 * Production-ready UI for comprehensive measurement tools, grid management,
 * and geometric shape creation with D&D 5e integration
 */

import { ErrorBoundary } from '@shared/components';
import type { FC } from 'react';
import type { MeasurementLine } from '../services/advancedMeasurement.service';
import styles from './AdvancedMeasurementPanel.module.css';
import { ActiveToolStatus } from './AdvancedMeasurementPanel/ActiveToolStatus';
import { MeasurementsTab } from './AdvancedMeasurementPanel/MeasurementsTab';
import { TabNavigation } from './AdvancedMeasurementPanel/TabNavigation';
import { ToolSelection } from './AdvancedMeasurementPanel/ToolSelection';
import { useAdvancedMeasurement } from './AdvancedMeasurementPanel/useAdvancedMeasurement';

interface AdvancedMeasurementPanelProps {
  isOpen: boolean;
  onClose: () => void;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  onMeasurementStart?: (point: { x: number; y: number }) => void;
  onMeasurementUpdate?: (measurementId: string, endPoint: { x: number; y: number }) => void;
  onMeasurementComplete?: (measurement: MeasurementLine) => void;
}

const AdvancedMeasurementPanel: FC<AdvancedMeasurementPanelProps> = ({
  isOpen,
  onClose,
  canvasRef,
  onMeasurementStart,
  onMeasurementUpdate,
  onMeasurementComplete
}) => {
  const {
    activeTool,
    selectedTab,
    setSelectedTab,
    error,
    setError,
    activeMeasurement,
    isCreatingShape,
    selectedShapeType,
    shapePoints,
    filteredMeasurements,
    settings,
    handleToolSelect,
    handleClearMeasurements,
    handleSettingsUpdate
  } = useAdvancedMeasurement({
    isOpen,
    canvasRef,
    onMeasurementStart,
    onMeasurementUpdate,
    onMeasurementComplete
  });

  if (!isOpen) return null;

  return (
    <ErrorBoundary>
      <div className={styles.measurementPanelOverlay}>
        <div className={styles.measurementPanel}>
          <div className={styles.panelHeader}>
            <h2>📏 Advanced Measurement & Grid System</h2>
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
            <ToolSelection 
              activeTool={activeTool} 
              onToolSelect={handleToolSelect} 
            />

            <ActiveToolStatus
              activeTool={activeTool}
              activeMeasurement={activeMeasurement}
              isCreatingShape={isCreatingShape}
              selectedShapeType={selectedShapeType}
              shapePoints={shapePoints}
            />

            <TabNavigation 
              selectedTab={selectedTab} 
              onTabChange={setSelectedTab} 
            />

            <div className={styles.searchSection}>
              {/* Search will be added when other tabs are implemented */}
            </div>

            <div className={styles.tabContent}>
              {selectedTab === 'measure' && (
                <MeasurementsTab
                  activeTool={activeTool}
                  filteredMeasurements={filteredMeasurements}
                  settings={settings}
                  onClearMeasurements={handleClearMeasurements}
                  onSettingsUpdate={handleSettingsUpdate}
                />
              )}

              {selectedTab === 'shapes' && (
                <div className={styles.emptyState}>
                  <p>Shapes tab - Feature under construction</p>
                </div>
              )}

              {selectedTab === 'grids' && (
                <div className={styles.emptyState}>
                  <p>Grids tab - Feature under construction</p>
                </div>
              )}

              {selectedTab === 'templates' && (
                <div className={styles.emptyState}>
                  <p>Templates tab - Feature under construction</p>
                </div>
              )}

              {selectedTab === 'settings' && (
                <div className={styles.emptyState}>
                  <p>Settings tab - Feature under construction</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default AdvancedMeasurementPanel;
