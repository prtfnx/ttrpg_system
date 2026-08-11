import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../AdvancedMeasurementPanel/useAdvancedMeasurement', () => ({
  useAdvancedMeasurement: () => ({
    activeTool: 'select',
    selectedTab: 'measure',
    setSelectedTab: vi.fn(),
    error: null,
    setError: vi.fn(),
    activeMeasurement: null,
    isCreatingShape: false,
    selectedShapeType: null,
    shapePoints: [],
    filteredMeasurements: [],
    settings: {},
    handleToolSelect: vi.fn(),
    handleClearMeasurements: vi.fn(),
    handleRemoveMeasurement: vi.fn(),
    handleSettingsUpdate: vi.fn(),
  }),
}));

vi.mock('../AdvancedMeasurementPanel/ActiveToolStatus', () => ({ ActiveToolStatus: () => null }));
vi.mock('../AdvancedMeasurementPanel/MeasurementsTab', () => ({ MeasurementsTab: () => null }));
vi.mock('../AdvancedMeasurementPanel/TabNavigation', () => ({ TabNavigation: () => null }));
vi.mock('../AdvancedMeasurementPanel/ToolSelection', () => ({ ToolSelection: () => null }));

import AdvancedMeasurementPanel from '../AdvancedMeasurementPanel';

describe('AdvancedMeasurementPanel', () => {
  const canvasRef = { current: document.createElement('canvas') };

  it('renders as a named dialog', () => {
    render(<AdvancedMeasurementPanel isOpen onClose={vi.fn()} canvasRef={canvasRef} />);

    expect(screen.getByRole('dialog', { name: 'Advanced Measurement & Grid System' })).toBeInTheDocument();
  });

  it('closes with Escape', () => {
    const onClose = vi.fn();
    render(<AdvancedMeasurementPanel isOpen onClose={onClose} canvasRef={canvasRef} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
  });
});
