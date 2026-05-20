import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MeasurementTool } from '../MeasurementTool';

const mockMeasurement = {
  distance: 141.4,
  gridUnits: 2.0,
  feet: 30.0,
  meters: 9.1,
  angle: 45.0,
  startX: 0,
  startY: 0,
  endX: 100,
  endY: 100,
};

function dispatchMeasurement(detail = mockMeasurement) {
  act(() => {
    window.dispatchEvent(new CustomEvent('measurementComplete', { detail }));
  });
}

beforeEach(() => {
  (window as any).rustRenderManager = undefined;
});

afterEach(() => {
  delete (window as any).rustRenderManager;
});

describe('MeasurementTool', () => {
  it('renders nothing when inactive and no measurement', () => {
    const { container } = render(<MeasurementTool isActive={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when active but no measurement yet', () => {
    const { container } = render(<MeasurementTool isActive={true} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows measurement results after measurementComplete event', () => {
    render(<MeasurementTool isActive={true} />);
    dispatchMeasurement();
    expect(screen.getByText('Measurement Results')).toBeInTheDocument();
    expect(screen.getByText('30.0 ft')).toBeInTheDocument();
  });

  it('shows angle in results', () => {
    render(<MeasurementTool isActive={true} />);
    dispatchMeasurement();
    expect(screen.getByText('45.0°')).toBeInTheDocument();
  });

  it('switches unit to meters', () => {
    render(<MeasurementTool isActive={true} />);
    dispatchMeasurement();
    fireEvent.click(screen.getByText('m'));
    expect(screen.getByText('9.1 m')).toBeInTheDocument();
  });

  it('switches unit to grid squares', () => {
    render(<MeasurementTool isActive={true} />);
    dispatchMeasurement();
    fireEvent.click(screen.getByText('grid'));
    expect(screen.getAllByText('2.0 squares').length).toBeGreaterThan(0);
  });

  it('switches unit to px', () => {
    render(<MeasurementTool isActive={true} />);
    dispatchMeasurement();
    fireEvent.click(screen.getByText('px'));
    expect(screen.getByText(/141 px/)).toBeInTheDocument();
  });

  it('clears measurement on Clear button click', () => {
    render(<MeasurementTool isActive={true} />);
    dispatchMeasurement();
    fireEvent.click(screen.getByText('Clear Measurement'));
    expect(screen.queryByText('Measurement Results')).toBeNull();
  });

  it('calls rustRenderManager.set_input_mode_select on clear', () => {
    const setMode = vi.fn();
    (window as any).rustRenderManager = { set_input_mode_select: setMode };
    render(<MeasurementTool isActive={true} />);
    dispatchMeasurement();
    fireEvent.click(screen.getByText('Clear Measurement'));
    expect(setMode).toHaveBeenCalled();
  });

  it('clears measurement when isActive changes to false', () => {
    const { rerender } = render(<MeasurementTool isActive={true} />);
    dispatchMeasurement();
    expect(screen.getByText('Measurement Results')).toBeInTheDocument();
    rerender(<MeasurementTool isActive={false} />);
    expect(screen.queryByText('Measurement Results')).toBeNull();
  });
});
