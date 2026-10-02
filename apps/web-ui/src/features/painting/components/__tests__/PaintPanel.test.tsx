import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaintPanel } from '../PaintPanel';

const mocks = vi.hoisted(() => ({
  interaction: {
    setTool: vi.fn(),
    setStyle: vi.fn(),
    restyleSelected: vi.fn(() => true),
    deleteSelected: vi.fn(() => true),
  },
  value: null as null | Record<string, unknown>,
}));

vi.mock('../../controller/PaintControllerProvider', () => ({
  useOptionalPaintController: () => mocks.value,
}));

function connected(selected = false, canEditSelected = true) {
  return {
    controller: {},
    interaction: mocks.interaction,
    state: {
      hydrating: false,
      committed: selected ? [{ id: 'paint-1' }] : [],
      pending: [],
      lastError: null,
    },
    interactionState: {
      enabled: true,
      ready: true,
      tool: 'draw',
      style: {
        stroke_rgba: [1, 0, 0, 1],
        width: 4,
        fill_rgba: null,
      },
      gestureActive: false,
      selected: selected ? {
        id: 'paint-1',
        kind: 'rectangle',
        created_by: 17,
        version: 3,
      } : null,
      canEditSelected,
    },
  };
}

describe('PaintPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.value = connected();
  });

  it('does not render while hidden', () => {
    const { container } = render(<PaintPanel isVisible={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers every implemented object tool', () => {
    render(<PaintPanel />);
    for (const label of [
      'Draw', 'Line', 'Rectangle', 'Square', 'Ellipse', 'Circle', 'Select/Edit', 'Delete',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeEnabled();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Circle' }));
    expect(mocks.interaction.setTool).toHaveBeenCalledWith('circle');
  });

  it('updates implemented stroke width, stroke color, and fill controls', () => {
    render(<PaintPanel />);
    fireEvent.change(screen.getByLabelText('Stroke width'), { target: { value: '8' } });
    expect(mocks.interaction.setStyle).toHaveBeenCalledWith(expect.objectContaining({ width: 8 }));

    fireEvent.change(screen.getByLabelText('Stroke color'), { target: { value: '#00ff00' } });
    expect(mocks.interaction.setStyle).toHaveBeenCalledWith(expect.objectContaining({
      stroke_rgba: [0, 1, 0, 1],
    }));

    fireEvent.click(screen.getByRole('checkbox', { name: 'Fill' }));
    expect(mocks.interaction.setStyle).toHaveBeenCalledWith(expect.objectContaining({
      fill_rgba: [1, 0, 0, 0.25],
    }));
  });

  it('shows selected owner/version and invokes authorized object actions', () => {
    mocks.value = connected(true, true);
    render(<PaintPanel />);
    expect(screen.getByText('User 17')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apply style' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete object' }));
    expect(mocks.interaction.restyleSelected).toHaveBeenCalledOnce();
    expect(mocks.interaction.deleteSelected).toHaveBeenCalledOnce();
  });

  it('keeps foreign selections inspectable but disables mutation', () => {
    mocks.value = connected(true, false);
    render(<PaintPanel />);
    expect(screen.getByText(/inspect this object/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply style' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete object' })).toBeDisabled();
  });

  it('reports disconnected state and handles header actions', () => {
    mocks.value = null;
    const onToggle = vi.fn();
    const onClose = vi.fn();
    render(<PaintPanel onToggle={onToggle} onClose={onClose} />);
    expect(screen.getByText(/waiting for the active table/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Draw' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle paint panel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close paint panel' }));
    expect(onToggle).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('disables tools and reports loading while the object snapshot hydrates', () => {
    const value = connected();
    value.state.hydrating = true;
    value.interactionState.ready = false;
    mocks.value = value;

    render(<PaintPanel />);

    expect(screen.getByText('Loading')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Draw' })).toBeDisabled();
  });
});
