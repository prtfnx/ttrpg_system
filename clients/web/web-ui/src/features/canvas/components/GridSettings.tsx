import React, { useState } from 'react';

export interface GridSettingsProps extends Omit<React.HTMLProps<HTMLDivElement>, 'onChange'> {
  gridType?: 'square' | 'hex';
  gridSize?: number;
  showGrid?: boolean;
  snapToGrid?: boolean;
  onGridSettingsChange?: (settings: GridSettingsProps) => void;
}

/**
 * GridSettings - D&D 5e grid configuration panel
 * Allows users to configure grid type, size, snapping, and visibility for tactical maps.
 */
export const GridSettings: React.FC<GridSettingsProps> = ({
  gridType = 'square',
  gridSize = 50,
  showGrid = true,
  snapToGrid = true,
  onGridSettingsChange,
  ...divProps
}) => {
  const [type, setType] = useState<'square' | 'hex'>(gridType);
  const [size, setSize] = useState<number>(gridSize);
  const [show, setShow] = useState<boolean>(showGrid);
  const [snap, setSnap] = useState<boolean>(snapToGrid);

  const handleChange = (field: string, value: any) => {
    let newSettings = { gridType: type, gridSize: size, showGrid: show, snapToGrid: snap };
    switch (field) {
      case 'type': setType(value); newSettings.gridType = value; break;
      case 'size': setSize(value); newSettings.gridSize = value; break;
      case 'show': setShow(value); newSettings.showGrid = value; break;
      case 'snap': setSnap(value); newSettings.snapToGrid = value; break;
    }
    onGridSettingsChange?.(newSettings);
  };

  return (
    <div {...divProps} className={`grid-settings-panel ${divProps.className || ''}`.trim()}>
      <h3>Grid Settings</h3>
      <label>
        Grid Type:
        <select value={type} onChange={e => handleChange('type', e.target.value as 'square' | 'hex')}>
          <option value="square">Square</option>
          <option value="hex">Hex</option>
        </select>
      </label>
      <label>
        Grid Size (px):
        <input type="number" min={10} max={200} value={size} onChange={e => handleChange('size', Number(e.target.value))} />
      </label>
      <label>
        <input type="checkbox" checked={show} onChange={e => handleChange('show', e.target.checked)} />
        Show Grid
      </label>
      <label>
        <input type="checkbox" checked={snap} onChange={e => handleChange('snap', e.target.checked)} />
        Snap to Grid
      </label>
    </div>
  );
};

export default GridSettings;
