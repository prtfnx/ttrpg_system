import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TableCard } from '../TableCard';
import { useGameStore } from '@/store';

vi.mock('../TablePreview', () => ({
  TablePreview: () => <div data-testid="preview" />,
}));

const makeTable = () => ({
  table_id: 't1',
  table_name: 'Main',
  width: 100,
  height: 80,
});

const defaultProps = {
  table: makeTable(),
  isActive: false,
  isBulkMode: false,
  isSelected: false,
  onSelect: vi.fn(),
  onOpen: vi.fn(),
  onSettings: vi.fn(),
  onDuplicate: vi.fn(),
  onDelete: vi.fn(),
  syncBadge: null,
};

beforeEach(() => {
  useGameStore.setState({ sessionRole: null } as never);
  vi.clearAllMocks();
});

describe('TableCard', () => {
  it('renders table name and dimensions', () => {
    render(<TableCard {...defaultProps} />);
    expect(screen.getByText('Main')).toBeTruthy();
    expect(screen.getByText(/100×80/)).toBeTruthy();
  });

  it('calls onOpen when name is clicked', async () => {
    const onOpen = vi.fn();
    render(<TableCard {...defaultProps} onOpen={onOpen} />);
    await userEvent.click(screen.getByText('Main'));
    expect(onOpen).toHaveBeenCalledWith('t1');
  });

  it('calls onSettings when settings button is clicked', async () => {
    const onSettings = vi.fn();
    render(<TableCard {...defaultProps} onSettings={onSettings} />);
    await userEvent.click(screen.getByTitle('Settings'));
    expect(onSettings).toHaveBeenCalledWith('t1');
  });

  it('calls onDuplicate when duplicate button is clicked', async () => {
    const onDuplicate = vi.fn();
    render(<TableCard {...defaultProps} onDuplicate={onDuplicate} />);
    await userEvent.click(screen.getByTitle('Duplicate'));
    expect(onDuplicate).toHaveBeenCalledWith('t1');
  });

  it('calls onDelete when delete button is clicked', async () => {
    const onDelete = vi.fn();
    render(<TableCard {...defaultProps} onDelete={onDelete} />);
    await userEvent.click(screen.getByTitle('Delete'));
    expect(onDelete).toHaveBeenCalledWith('t1');
  });

  it('shows entity count when provided', () => {
    const table = { ...makeTable(), entity_count: 5 };
    render(<TableCard {...defaultProps} table={table} />);
    expect(screen.getByText(/5 entities/)).toBeTruthy();
  });

  it('shows bulk checkbox in bulk mode', () => {
    render(<TableCard {...defaultProps} isBulkMode={true} />);
    expect(screen.getByRole('checkbox')).toBeTruthy();
  });

  it('checkbox calls onSelect', async () => {
    const onSelect = vi.fn();
    render(<TableCard {...defaultProps} isBulkMode={true} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(onSelect).toHaveBeenCalledWith('t1');
  });

  it('shows Switch All Players button for DM', () => {
    useGameStore.setState({ sessionRole: 'owner' as never });
    render(<TableCard {...defaultProps} />);
    expect(screen.getByTitle('Switch all players')).toBeTruthy();
  });

  it('hides Switch All Players button for non-DM', () => {
    useGameStore.setState({ sessionRole: null });
    render(<TableCard {...defaultProps} />);
    expect(screen.queryByTitle('Switch all players')).toBeNull();
  });

  it('handleSetForAll dispatches protocol event', async () => {
    useGameStore.setState({ sessionRole: 'owner' as never });
    const events: string[] = [];
    window.addEventListener('protocol-send-message', (e) => events.push((e as CustomEvent).detail.type));
    render(<TableCard {...defaultProps} />);
    await userEvent.click(screen.getByTitle('Switch all players'));
    expect(events).toContain('table_active_set_all');
  });
});
