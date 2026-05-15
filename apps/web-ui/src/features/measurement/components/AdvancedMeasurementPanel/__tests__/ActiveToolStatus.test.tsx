import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActiveToolStatus } from '../ActiveToolStatus';

vi.mock('../AdvancedMeasurementPanel.module.css', () => ({
  default: {
    activeToolStatus: 'activeToolStatus',
    statusIndicator: 'statusIndicator',
    statusDot: 'statusDot',
    active: 'active',
    measurementStatus: 'measurementStatus',
    shapeStatus: 'shapeStatus',
    shapeHelp: 'shapeHelp',
  }
}));

const defaults = {
  activeTool: 'measure' as const,
  activeMeasurement: null,
  isCreatingShape: false,
  selectedShapeType: 'line',
  shapePoints: [],
};

describe('ActiveToolStatus', () => {
  it('returns null when activeTool is falsy', () => {
    const { container } = render(
      <ActiveToolStatus {...defaults} activeTool={null as unknown as 'measure'} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders capitalized tool name', () => {
    render(<ActiveToolStatus {...defaults} />);
    expect(screen.getByText('Measure', { exact: false })).toBeTruthy();
  });

  it('shows measuring status when activeMeasurement is set', () => {
    render(<ActiveToolStatus {...defaults} activeMeasurement="5ft" />);
    expect(screen.getByText('Measuring... Click to complete')).toBeTruthy();
  });

  it('hides measuring status when activeMeasurement is null', () => {
    render(<ActiveToolStatus {...defaults} activeMeasurement={null} />);
    expect(screen.queryByText('Measuring... Click to complete')).toBeNull();
  });

  it('shows shape creation status', () => {
    render(<ActiveToolStatus {...defaults} isCreatingShape={true} selectedShapeType="circle" shapePoints={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} />);
    expect(screen.getByText('Creating circle... 2 points')).toBeTruthy();
  });

  it('shows polygon double-click help for polygon type', () => {
    render(<ActiveToolStatus {...defaults} isCreatingShape={true} selectedShapeType="polygon" shapePoints={[{ x: 0, y: 0 }]} />);
    expect(screen.getByText('Double-click to complete')).toBeTruthy();
  });

  it('does not show polygon help for non-polygon shapes', () => {
    render(<ActiveToolStatus {...defaults} isCreatingShape={true} selectedShapeType="circle" shapePoints={[]} />);
    expect(screen.queryByText('Double-click to complete')).toBeNull();
  });

  it('hides shape status when isCreatingShape is false', () => {
    render(<ActiveToolStatus {...defaults} isCreatingShape={false} selectedShapeType="polygon" />);
    expect(screen.queryByText('Creating polygon')).toBeNull();
  });
});
