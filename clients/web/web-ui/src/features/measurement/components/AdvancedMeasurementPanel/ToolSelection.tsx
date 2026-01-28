import type { FC } from 'react';
import styles from '../AdvancedMeasurementPanel.module.css';

type ActiveTool = 'measure' | 'shape' | 'template' | 'grid' | null;

interface ToolSelectionProps {
  activeTool: ActiveTool;
  onToolSelect: (tool: ActiveTool) => void;
}

export const ToolSelection: FC<ToolSelectionProps> = ({ activeTool, onToolSelect }) => (
  <div className={styles.toolSelection}>
    <button 
      className={`tool-btn ${activeTool === 'measure' ? 'active' : ''}`}
      onClick={() => onToolSelect('measure')}
      title="Measurement Tool"
    >
      📏 Measure
    </button>
    <button 
      className={`tool-btn ${activeTool === 'shape' ? 'active' : ''}`}
      onClick={() => onToolSelect('shape')}
      title="Shape Tool"
    >
      📐 Shapes
    </button>
    <button 
      className={`tool-btn ${activeTool === 'template' ? 'active' : ''}`}
      onClick={() => onToolSelect('template')}
      title="Template Tool"
    >
      🎯 Templates
    </button>
    <button 
      className={`tool-btn ${activeTool === 'grid' ? 'active' : ''}`}
      onClick={() => onToolSelect('grid')}
      title="Grid Tool"
    >
      ⊞ Grid
    </button>
  </div>
);

export type { ActiveTool };
