import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockActions = {
  tables: new Map(),
  actionHistory: [],
  isLoading: false,
  error: null,
  canUndo: true,
  canRedo: true,
  createTable: vi.fn().mockResolvedValue({ success: true, message: '' }),
  deleteTable: vi.fn().mockResolvedValue({ success: true, message: '' }),
  undo: vi.fn(),
  redo: vi.fn(),
  refreshState: vi.fn(),
};

vi.mock('@shared/hooks', () => ({
  useActions: vi.fn(() => mockActions),
}));

vi.mock('lucide-react', () => ({
  Undo2: () => React.createElement('span', null, 'Undo'),
  Redo2: () => React.createElement('span', null, 'Redo'),
  RotateCw: () => React.createElement('span', null, 'Refresh'),
  Trash2: () => React.createElement('span', null, 'Delete'),
}));

import { ActionsQuickPanel } from '../ActionsQuickPanel';

describe('ActionsQuickPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActions.createTable.mockResolvedValue({ success: true, message: '' });
    mockActions.deleteTable.mockResolvedValue({ success: true, message: '' });
    mockActions.tables = new Map();
    mockActions.actionHistory = [];
    mockActions.isLoading = false;
    mockActions.error = null;
    mockActions.canUndo = true;
    mockActions.canRedo = true;
  });

  it('renders Quick Actions heading', () => {
    render(<ActionsQuickPanel />);
    expect(screen.getByText('Quick Actions')).toBeInTheDocument();
  });

  it('renders table name input', () => {
    render(<ActionsQuickPanel />);
    expect(screen.getByPlaceholderText('Table name')).toBeInTheDocument();
  });

  it('renders width and height inputs with defaults', () => {
    render(<ActionsQuickPanel />);
    expect(screen.getByPlaceholderText('Width')).toHaveValue(800);
    expect(screen.getByPlaceholderText('Height')).toHaveValue(600);
  });

  it('renders Undo and Redo buttons', () => {
    render(<ActionsQuickPanel />);
    expect(screen.getAllByText('Undo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Redo').length).toBeGreaterThan(0);
  });

  it('calls undo when Undo button clicked', () => {
    render(<ActionsQuickPanel />);
    const undoBtn = screen.getAllByText('Undo').find(el => el.closest('button'));
    const btn = undoBtn?.closest('button');
    if (btn) fireEvent.click(btn);
    expect(mockActions.undo).toHaveBeenCalled();
  });

  it('calls redo when Redo button clicked', () => {
    render(<ActionsQuickPanel />);
    const redoEl = screen.getAllByText('Redo').find(el => el.closest('button'));
    const btn = redoEl?.closest('button');
    if (btn) fireEvent.click(btn);
    expect(mockActions.redo).toHaveBeenCalled();
  });

  it('updates table name input', () => {
    render(<ActionsQuickPanel />);
    fireEvent.change(screen.getByPlaceholderText('Table name'), { target: { value: 'My Table' } });
    expect(screen.getByPlaceholderText('Table name')).toHaveValue('My Table');
  });

  it('updates width input', () => {
    render(<ActionsQuickPanel />);
    fireEvent.change(screen.getByPlaceholderText('Width'), { target: { value: '1024' } });
    expect(screen.getByPlaceholderText('Width')).toHaveValue(1024);
  });

  it('creates a table and shows command status without alerts', async () => {
    render(<ActionsQuickPanel />);
    fireEvent.change(screen.getByPlaceholderText('Table name'), { target: { value: 'Dungeon' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Table' }));

    await waitFor(() => expect(mockActions.createTable).toHaveBeenCalledWith('Dungeon', 800, 600));
    expect(screen.getByText('Create Table: Done')).toBeInTheDocument();
  });

  it('deletes the selected table from the table selector', async () => {
    mockActions.tables = new Map([
      ['t1', { table_id: 't1', name: 'Dungeon', width: 800, height: 600 }],
      ['t2', { table_id: 't2', name: 'Forest', width: 900, height: 700 }],
    ]);
    render(<ActionsQuickPanel />);

    fireEvent.change(screen.getByLabelText('Table to delete'), { target: { value: 't2' } });
    fireEvent.click(screen.getByRole('button', { name: /Delete/ }));

    await waitFor(() => expect(mockActions.deleteTable).toHaveBeenCalledWith('t2'));
  });
});
