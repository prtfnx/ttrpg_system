/**
 * TablePanel Component Tests
 * 
 * Tests user interactions with the table management panel.
 * Focus: What users see and do, not implementation details.
 */
import { TablePanel } from '@features/table';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils/test-utils';
import { createTestTable } from '../../test/utils/testFactories';

// Mock the hook that provides table data
const mockCreateTable = vi.fn(() => true);
const mockSetActiveTable = vi.fn();
const mockSetTableGrid = vi.fn();
const mockRemoveTable = vi.fn();
const mockPanViewport = vi.fn();
const mockZoomTable = vi.fn();

const mockTables = [
  createTestTable({ table_id: 'table_1', table_name: 'Main Dungeon', width: 2000, height: 2000 }),
  createTestTable({ table_id: 'table_2', table_name: 'Town Square', width: 1500, height: 1500 }),
];

vi.mock('../../features/table/hooks/useTableManager', () => ({
  useTableManager: vi.fn(() => ({
    activeTableId: 'table_1',
    tables: mockTables,
    createTable: mockCreateTable,
    setActiveTable: mockSetActiveTable,
    setTableGrid: mockSetTableGrid,
    removeTable: mockRemoveTable,
    panViewport: mockPanViewport,
    zoomTable: mockZoomTable,
  })),
}));

describe('TablePanel', () => {
  const user = userEvent.setup();

  beforeEach(async () => {
    vi.clearAllMocks();
  });

  describe('Displaying Tables', () => {
    it('shows all tables in a list', () => {
      renderWithProviders(<TablePanel />);
      
      expect(screen.getByRole('option', { name: /main dungeon/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /town square/i })).toBeInTheDocument();
    });

    it('shows table dimensions', () => {
      renderWithProviders(<TablePanel />);
      
      expect(screen.getByText('2000×2000')).toBeInTheDocument();
      expect(screen.getByText('1500×1500')).toBeInTheDocument();
    });

    it('indicates which table is currently active', () => {
      renderWithProviders(<TablePanel />);
      
      const activeTable = screen.getByRole('option', { name: /main dungeon/i });
      expect(activeTable).toHaveAttribute('aria-selected', 'true');
      
      const inactiveTable = screen.getByRole('option', { name: /town square/i });
      expect(inactiveTable).toHaveAttribute('aria-selected', 'false');
    });

    it('shows empty state when no tables exist', async () => {
      const { useTableManager } = await import('../../features/table/hooks/useTableManager');
      vi.mocked(useTableManager).mockReturnValueOnce({
        activeTableId: null,
        tables: [],
        createTable: mockCreateTable,
        setActiveTable: mockSetActiveTable,
        setTableGrid: mockSetTableGrid,
        removeTable: mockRemoveTable,
        panViewport: mockPanViewport,
        zoomTable: mockZoomTable,
      });

      renderWithProviders(<TablePanel />);
      
      expect(screen.getByText(/no tables created/i)).toBeInTheDocument();
    });
  });

  describe('Creating Tables', () => {
    it('shows create form when + button is clicked', async () => {
      renderWithProviders(<TablePanel />);
      
      // Use the first + button which is the create table button
      const headerButtons = screen.getAllByRole('button', { name: '+' });
      await user.click(headerButtons[0]);
      
      expect(screen.getByPlaceholderText(/table name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/width/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/height/i)).toBeInTheDocument();
    });

    it('allows user to create a new table', async () => {
      renderWithProviders(<TablePanel />);
      
      const headerButtons = screen.getAllByRole('button', { name: '+' });
      await user.click(headerButtons[0]);
      await user.type(screen.getByPlaceholderText(/table name/i), 'New Adventure');
      await user.click(screen.getByRole('button', { name: /^create$/i }));
      
      expect(mockCreateTable).toHaveBeenCalledWith(
        expect.stringContaining('table_'),
        'New Adventure',
        2000,
        2000
      );
    });

    it('hides form when cancel is clicked', async () => {
      renderWithProviders(<TablePanel />);
      
      const headerButtons = screen.getAllByRole('button', { name: '+' });
      await user.click(headerButtons[0]);
      expect(screen.getByPlaceholderText(/table name/i)).toBeInTheDocument();
      
      await user.click(screen.getByRole('button', { name: /cancel/i }));
      expect(screen.queryByPlaceholderText(/table name/i)).not.toBeInTheDocument();
    });
  });

  describe('Switching Tables', () => {
    it('allows user to select a different table', async () => {
      renderWithProviders(<TablePanel />);
      
      // Click on the table name text, which has the click handler
      await user.click(screen.getByText('Town Square'));
      
      expect(mockSetActiveTable).toHaveBeenCalledWith('table_2');
    });
  });

  describe('Deleting Tables', () => {
    it('allows user to delete a table', async () => {
      renderWithProviders(<TablePanel />);
      
      await user.click(screen.getByRole('button', { name: /delete town square/i }));
      
      expect(mockRemoveTable).toHaveBeenCalledWith('table_2');
    });
  });

  describe('Grid Controls', () => {
    it('shows grid toggle for active table', () => {
      renderWithProviders(<TablePanel />);
      
      expect(screen.getByLabelText(/show grid/i)).toBeInTheDocument();
    });

    it('allows toggling grid visibility', async () => {
      renderWithProviders(<TablePanel />);
      
      await user.click(screen.getByLabelText(/show grid/i));
      
      expect(mockSetTableGrid).toHaveBeenCalled();
    });
  });
});
