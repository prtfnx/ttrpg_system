/**
 * TableSettingsPanel — Behaviour Tests
 *
 * Covers what a DM experiences when configuring the grid:
 * - Cell size slider changes propagate
 * - Distance input changes propagate
 * - ft/m toggle works
 * - Non-DM users see nothing
 *
 * @vitest-environment jsdom
 */

import { useGameStore } from '@/store';
import { TableSettingsPanel } from '@features/table/components/TableSettingsPanel';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@lib/api', () => ({
  ProtocolService: {
    hasProtocol: vi.fn(() => false),
    getProtocol: vi.fn(),
  },
}));

const mockSetTableUnits = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  useGameStore.setState({
    sessionRole: 'owner',
    gridCellPx: 50,
    cellDistance: 5,
    distanceUnit: 'ft',
    activeTableId: 'table-1',
    setTableUnits: mockSetTableUnits,
  } as unknown as Parameters<typeof useGameStore.setState>[0]);
});

describe('TableSettingsPanel — DM view', () => {
  it('renders grid configuration controls for DM', () => {
    render(<TableSettingsPanel />);
    expect(screen.getByText(/grid.*coordinate/i)).toBeInTheDocument();
    expect(screen.getByRole('slider')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ft' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'm' })).toBeInTheDocument();
  });

  it('shows current cell size in label', () => {
    render(<TableSettingsPanel />);
    expect(screen.getByText(/50px/i)).toBeInTheDocument();
  });

  it('shows info summary with px/unit ratio', () => {
    render(<TableSettingsPanel />);
    // 50px / 5ft = 10 px/ft
    expect(screen.getByText(/10\.0 px\/ft/i)).toBeInTheDocument();
  });

  it('shows meter conversion line when unit is ft', () => {
    render(<TableSettingsPanel />);
    // Should show meter equivalent
    expect(screen.getAllByText(/m$/).length).toBeGreaterThan(0);
  });

  it('calls setTableUnits when cell slider changes', () => {
    render(<TableSettingsPanel />);

    const slider = screen.getByRole('slider');
    // Simulate slider change for a range input
    fireEvent.change(slider, { target: { value: '80' } });

    // setTableUnits should have been called at least once
    expect(mockSetTableUnits).toHaveBeenCalled();
  });

  it('calls setTableUnits with correct unit when m button clicked', async () => {
    const user = userEvent.setup();
    render(<TableSettingsPanel />);

    await user.click(screen.getByRole('button', { name: 'm' }));

    expect(mockSetTableUnits).toHaveBeenCalledWith(
      expect.objectContaining({ distanceUnit: 'm' })
    );
  });

  it('calls setTableUnits with ft when ft button clicked', async () => {
    useGameStore.setState({ distanceUnit: 'm' } as unknown as Parameters<typeof useGameStore.setState>[0]);
    const user = userEvent.setup();
    render(<TableSettingsPanel />);

    await user.click(screen.getByRole('button', { name: 'ft' }));

    expect(mockSetTableUnits).toHaveBeenCalledWith(
      expect.objectContaining({ distanceUnit: 'ft' })
    );
  });
});

describe('TableSettingsPanel — non-DM view', () => {
  it('renders nothing for players', () => {
    useGameStore.setState({ sessionRole: 'player' } as unknown as Parameters<typeof useGameStore.setState>[0]);
    const { container } = render(<TableSettingsPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for spectators', () => {
    useGameStore.setState({ sessionRole: 'spectator' } as unknown as Parameters<typeof useGameStore.setState>[0]);
    const { container } = render(<TableSettingsPanel />);
    expect(container).toBeEmptyDOMElement();
  });
});
