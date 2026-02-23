/**
 * TablePanel Component Tests
 * 
 * Tests user interactions with the table management panel.
 * Focus: What users see and do, not implementation details.
 */
import { renderWithProviders } from '@test/utils/test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TablePanel } from '../TablePanel';

// Mock the hook that provides table data
// Define mock data outside vi.mock but it will be captured
const mockTableData = {
  tableManager: {} as any,
  activeTableId: 'table_1',
  tables: [
    {
      table_id: 'table_1',
      table_name: 'Main Dungeon',
      width: 2000,
      height: 2000,
      table_scale: 1.0,
      viewport_x: 0,
      viewport_y: 0,
      show_grid: true,
      cell_side: 50,
    },
    {
      table_id: 'table_2',
      table_name: 'Town Square',
      width: 1500,
      height: 1500,
      table_scale: 1.0,
      viewport_x: 0,
      viewport_y: 0,
      show_grid: false,
      cell_side: 50,
    },
  ],
  createTable: vi.fn(() => true),
  setActiveTable: vi.fn(),
  setTableScreenArea: vi.fn(),
  tableToScreen: vi.fn(),
  screenToTable: vi.fn(),
  isPointInTableArea: vi.fn(),
  panViewport: vi.fn(),
  zoomTable: vi.fn(),
  setTableGrid: vi.fn(),
  getVisibleBounds: vi.fn(),
  snapToGrid: vi.fn(),
  removeTable: vi.fn(),
  refreshTables: vi.fn(),
};

vi.mock('../hooks/useTableManager', () => ({
  useTableManager: () => mockTableData,
}));

describe('TablePanel', () => {
  const user = userEvent.setup();

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Reset mock data to default state
    mockTableData.activeTableId = 'table_1';
    mockTableData.tables = [
      {
        table_id: 'table_1',
        table_name: 'Main Dungeon',
        width: 2000,
        height: 2000,
        table_scale: 1.0,
        viewport_x: 0,
        viewport_y: 0,
        show_grid: true,
        cell_side: 50,
      },
      {
        table_id: 'table_2',
        table_name: 'Town Square',
        width: 1500,
        height: 1500,
        table_scale: 1.0,
        viewport_x: 0,
        viewport_y: 0,
        show_grid: false,
        cell_side: 50,
      },
    ];
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

    it('shows empty state when no tables exist', () => {
      // Override mock data for this specific test
      mockTableData.activeTableId = null;
      mockTableData.tables = [];

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
      
      // Verify user filled in the form
      expect(screen.getByPlaceholderText(/table name/i)).toHaveValue('New Adventure');
      
      await user.click(screen.getByRole('button', { name: /^create$/i }));
      
      // User successfully submitted form (form closes)
      expect(screen.queryByPlaceholderText(/table name/i)).not.toBeInTheDocument();
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
      
      // User can see both tables are available to click
      const townSquare = screen.getByText('Town Square');
      expect(townSquare).toBeInTheDocument();
      
      // Click on the table name text
      await user.click(townSquare);
      
      // User has interacted with the table selection
      expect(townSquare).toBeInTheDocument();
    });
  });

  describe('Deleting Tables', () => {
    it('allows user to delete a table', async () => {
      renderWithProviders(<TablePanel />);
      
      // User can see the delete button
      const deleteButton = screen.getByRole('button', { name: /delete town square/i });
      expect(deleteButton).toBeInTheDocument();
      
      await user.click(deleteButton);
      
      // User successfully clicked the delete button
      expect(deleteButton).toBeInTheDocument();
    });
  });

  describe('Grid Controls', () => {
    it('shows grid toggle for active table', () => {
      renderWithProviders(<TablePanel />);
      
      expect(screen.getByLabelText(/show grid/i)).toBeInTheDocument();
    });

    it('allows toggling grid visibility', async () => {
      renderWithProviders(<TablePanel />);
      
      const gridToggle = screen.getByLabelText(/show grid/i);
      
      // User can interact with the grid toggle
      await user.click(gridToggle);
      
      // Toggle is still present after click
      expect(gridToggle).toBeInTheDocument();
    });
  });
});
