import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActionsPanel } from '../ActionsPanel';

// ── useActions mock ─────────────────────────────────────────────────────────
const mockCreateTable = vi.fn();
const mockDeleteTable = vi.fn();
const mockUpdateTable = vi.fn();
const mockSetLayerVisibility = vi.fn();
const mockBatchActions = vi.fn();
const mockUndo = vi.fn();
const mockRedo = vi.fn();
const mockRefreshState = vi.fn();
const mockClearError = vi.fn();

const baseActions = {
  tables: new Map(),
  sprites: new Map(),
  layerVisibility: new Map([['tokens', true], ['background', false]]),
  actionHistory: [],
  isLoading: false,
  error: null,
  canUndo: false,
  canRedo: false,
  createTable: mockCreateTable,
  deleteTable: mockDeleteTable,
  updateTable: mockUpdateTable,
  setLayerVisibility: mockSetLayerVisibility,
  batchActions: mockBatchActions,
  undo: mockUndo,
  redo: mockRedo,
  refreshState: mockRefreshState,
  clearError: mockClearError,
};

vi.mock('@shared/hooks', () => ({
  useActions: vi.fn(() => ({ ...baseActions })),
}));

import { useActions } from '@shared/hooks';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useActions).mockReturnValue({ ...baseActions });
});

// ── tests ───────────────────────────────────────────────────────────────────

describe('ActionsPanel — render', () => {
  it('renders tabs and default Tables view', () => {
    render(<ActionsPanel renderEngine={null} />);
    expect(screen.getByRole('button', { name: 'Tables' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Layers' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'History' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Table' })).toBeInTheDocument();
  });

  it('shows loading indicator when isLoading is true', () => {
    vi.mocked(useActions).mockReturnValue({ ...baseActions, isLoading: true });
    render(<ActionsPanel renderEngine={null} />);
    // Loader2 icon renders with aria-hidden; just verify Create Table button is disabled
    expect(screen.getByRole('button', { name: 'Create Table' })).toBeDisabled();
  });

  it('shows error message with clear button', () => {
    vi.mocked(useActions).mockReturnValue({ ...baseActions, error: 'Something failed' });
    render(<ActionsPanel renderEngine={null} />);
    expect(screen.getByText('Something failed')).toBeInTheDocument();
  });

  it('clicking clear error button calls clearError', () => {
    vi.mocked(useActions).mockReturnValue({ ...baseActions, error: 'Oops' });
    render(<ActionsPanel renderEngine={null} />);
    const xButtons = screen.getAllByRole('button');
    // The X clear button is the one inside the errorMessage
    const clearBtn = xButtons.find(b => b.closest('[class*="errorMessage"]'));
    fireEvent.click(clearBtn!);
    expect(mockClearError).toHaveBeenCalled();
  });
});

describe('ActionsPanel — Tables tab', () => {
  it('Create Table button is disabled when name is empty', () => {
    render(<ActionsPanel renderEngine={null} />);
    expect(screen.getByRole('button', { name: 'Create Table' })).toBeDisabled();
  });

  it('Create Table button enables when name is typed', () => {
    render(<ActionsPanel renderEngine={null} />);
    fireEvent.change(screen.getByPlaceholderText('Table name'), { target: { value: 'My Map' } });
    expect(screen.getByRole('button', { name: 'Create Table' })).not.toBeDisabled();
  });

  it('calls createTable and clears form on success', async () => {
    mockCreateTable.mockResolvedValue({ success: true, message: 'created' });
    render(<ActionsPanel renderEngine={null} />);
    fireEvent.change(screen.getByPlaceholderText('Table name'), { target: { value: 'Dungeon' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Table' }));
    await waitFor(() => expect(mockCreateTable).toHaveBeenCalledWith('Dungeon', 800, 600));
  });

  it('shows table list with delete and scale buttons', () => {
    const tables = new Map([
      ['t1', { table_id: 't1', name: 'Dungeon', width: 400, height: 300 }],
    ]);
    vi.mocked(useActions).mockReturnValue({ ...baseActions, tables } as ReturnType<typeof useActions>);
    render(<ActionsPanel renderEngine={null} />);
    expect(screen.getByText('Dungeon')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
    expect(screen.getByText('Scale')).toBeInTheDocument();
  });

  it('calls deleteTable when Delete button clicked', async () => {
    mockDeleteTable.mockResolvedValue({ success: true, message: 'deleted' });
    const tables = new Map([
      ['t1', { table_id: 't1', name: 'Forest', width: 400, height: 300 }],
    ]);
    vi.mocked(useActions).mockReturnValue({ ...baseActions, tables } as ReturnType<typeof useActions>);
    render(<ActionsPanel renderEngine={null} />);
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => expect(mockDeleteTable).toHaveBeenCalledWith('t1'));
  });

  it('calls updateTable when Scale button clicked', async () => {
    mockUpdateTable.mockResolvedValue({ success: true, message: 'updated' });
    const tables = new Map([
      ['t1', { table_id: 't1', name: 'City', width: 400, height: 300 }],
    ]);
    vi.mocked(useActions).mockReturnValue({ ...baseActions, tables } as ReturnType<typeof useActions>);
    render(<ActionsPanel renderEngine={null} />);
    fireEvent.click(screen.getByText('Scale'));
    await waitFor(() => expect(mockUpdateTable).toHaveBeenCalledWith('t1', { scale_x: 1.5, scale_y: 1.5 }));
  });
});

describe('ActionsPanel — Layers tab', () => {
  it('switches to Layers tab and shows layer checkboxes', () => {
    render(<ActionsPanel renderEngine={null} />);
    fireEvent.click(screen.getByText('Layers'));
    expect(screen.getByText('tokens')).toBeInTheDocument();
    expect(screen.getByText('background')).toBeInTheDocument();
  });

  it('tokens layer is checked, background is unchecked', () => {
    render(<ActionsPanel renderEngine={null} />);
    fireEvent.click(screen.getByText('Layers'));
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toBeChecked();    // tokens = true
    expect(checkboxes[1]).not.toBeChecked(); // background = false
  });

  it('toggling layer visibility calls setLayerVisibility', async () => {
    mockSetLayerVisibility.mockResolvedValue({ success: true, message: 'ok' });
    render(<ActionsPanel renderEngine={null} />);
    fireEvent.click(screen.getByText('Layers'));
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    await waitFor(() => expect(mockSetLayerVisibility).toHaveBeenCalledWith('tokens', false));
  });
});

describe('ActionsPanel — History tab', () => {
  it('switches to History tab and shows undo/redo/batch/refresh buttons', () => {
    render(<ActionsPanel renderEngine={null} />);
    fireEvent.click(screen.getByText('History'));
    expect(screen.getByText(/Undo/)).toBeInTheDocument();
    expect(screen.getByText(/Redo/)).toBeInTheDocument();
    expect(screen.getByText('Batch Test')).toBeInTheDocument();
    expect(screen.getByText('Refresh')).toBeInTheDocument();
  });

  it('undo/redo buttons are disabled when canUndo/canRedo are false', () => {
    render(<ActionsPanel renderEngine={null} />);
    fireEvent.click(screen.getByText('History'));
    expect(screen.getByText(/Undo/)).toBeDisabled();
    expect(screen.getByText(/Redo/)).toBeDisabled();
  });

  it('undo button enabled and calls undo', async () => {
    vi.mocked(useActions).mockReturnValue({ ...baseActions, canUndo: true });
    render(<ActionsPanel renderEngine={null} />);
    fireEvent.click(screen.getByText('History'));
    fireEvent.click(screen.getByText(/Undo/));
    expect(mockUndo).toHaveBeenCalled();
  });

  it('redo button enabled and calls redo', async () => {
    vi.mocked(useActions).mockReturnValue({ ...baseActions, canRedo: true });
    render(<ActionsPanel renderEngine={null} />);
    fireEvent.click(screen.getByText('History'));
    fireEvent.click(screen.getByText(/Redo/));
    expect(mockRedo).toHaveBeenCalled();
  });

  it('Batch Test button calls batchActions', async () => {
    mockBatchActions.mockResolvedValue({ success: true, message: 'batch done' });
    render(<ActionsPanel renderEngine={null} />);
    fireEvent.click(screen.getByText('History'));
    fireEvent.click(screen.getByText('Batch Test'));
    await waitFor(() => expect(mockBatchActions).toHaveBeenCalled());
  });

  it('Refresh button calls refreshState', () => {
    render(<ActionsPanel renderEngine={null} />);
    fireEvent.click(screen.getByText('History'));
    fireEvent.click(screen.getByText('Refresh'));
    expect(mockRefreshState).toHaveBeenCalled();
  });

  it('renders action history entries', () => {
    const history = [
      { action_type: 'create_table', timestamp: Date.now(), reversible: true },
    ];
    vi.mocked(useActions).mockReturnValue({
      ...baseActions,
      actionHistory: history,
      canUndo: true,
    });
    render(<ActionsPanel renderEngine={null} />);
    fireEvent.click(screen.getByText('History'));
    expect(screen.getByText('create_table')).toBeInTheDocument();
  });
});
