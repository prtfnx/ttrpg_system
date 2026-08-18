import clsx from 'clsx';
import type { FC } from 'react';
import styles from '../AdvancedMeasurementPanel.module.css';

type ActiveTool = 'measure' | 'shape' | 'grid' | null;

interface ToolSelectionProps {
  activeTool: ActiveTool;
  onToolSelect: (tool: ActiveTool) => void;
}

export const ToolSelection: FC<ToolSelectionProps> = ({ activeTool, onToolSelect }) => (
  <div className={styles.toolSelection}>
    <button 
      type="button"
      className={clsx(styles['tool-btn'], activeTool === 'measure' && styles.active)}
      onClick={() => onToolSelect('measure')}
      title="Measurement Tool"
      aria-pressed={activeTool === 'measure'}
    >
      Measure
    </button>
    <button 
      type="button"
      className={clsx(styles['tool-btn'], activeTool === 'shape' && styles.active)}
      onClick={() => onToolSelect('shape')}
      title="Shape Tool"
      aria-pressed={activeTool === 'shape'}
    >
      Shapes
    </button>
    <button 
      type="button"
      className={clsx(styles['tool-btn'], activeTool === 'grid' && styles.active)}
      onClick={() => onToolSelect('grid')}
      title="Grid Tool"
      aria-pressed={activeTool === 'grid'}
    >
      ⊞ Grid
    </button>
  </div>
);

export type { ActiveTool };

