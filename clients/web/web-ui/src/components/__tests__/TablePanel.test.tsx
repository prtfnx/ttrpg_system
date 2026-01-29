import TablePanel, { type TableInfo } from '@features/table';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock useTableManager hook
const mockCreateTable = vi.fn();
const mockSetActiveTable = vi.fn();
const mockSetTableGrid = vi.fn();
const mockRemoveTable = vi.fn();
const mockPanViewport = vi.fn();
const mockZoomTable = vi.fn();

vi.mock('@features/table', () => ({
  default: vi.fn(),
  useTableManager: vi.fn(() => ({
    activeTableId: 'table_1',
    tables: [] as TableInfo[],
    createTable: mockCreateTable,
    setActiveTable: mockSetActiveTable,
    setTableGrid: mockSetTableGrid,
    removeTable: mockRemoveTable,
    panViewport: mockPanViewport,
    zoomTable: mockZoomTable,
  })),
}));

describe('TablePanel', () => {
  // Helper to get the create button in header (not the zoom + button)
  const getCreateButton = () => {
    const header = document.querySelector('[class*="tablePanelHeader"]');
    return within(header!).getByRole('button', { name: '+' });
  };

  const mockTables: TableInfo[] = [
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
      table_scale: 0.8,
      viewport_x: 100,
      viewport_y: 200,
      show_grid: false,
      cell_side: 40,
    },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCreateTable.mockReturnValue(true);
    
    // Import to get access to the mock - use dynamic import for ESM
    const module = await import('@features/table');
    vi.mocked(module.useTableManager).mockReturnValue({
      activeTableId: 'table_1',
      tables: mockTables,
      createTable: mockCreateTable,
      setActiveTable: mockSetActiveTable,
      setTableGrid: mockSetTableGrid,
      removeTable: mockRemoveTable,
      panViewport: mockPanViewport,
      zoomTable: mockZoomTable,
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no tables exist', async () => {
      const module = await import('@features/table');
      vi.mocked(module.useTableManager).mockReturnValue({
        activeTableId: null,
        tables: [],
        createTable: mockCreateTable,
        setActiveTable: mockSetActiveTable,
        setTableGrid: mockSetTableGrid,
        removeTable: mockRemoveTable,
        panViewport: mockPanViewport,
        zoomTable: mockZoomTable,
      });

      render(<TablePanel />);

      expect(screen.getByText(/no tables created/i)).toBeDefined();
      expect(screen.getByText(/click \+ to create your first table/i)).toBeDefined();
    });

    it('should show create button in empty state', async () => {
      const module = await import('@features/table');
      vi.mocked(module.useTableManager).mockReturnValue({
        activeTableId: null,
        tables: [],
        createTable: mockCreateTable,
        setActiveTable: mockSetActiveTable,
        setTableGrid: mockSetTableGrid,
        removeTable: mockRemoveTable,
        panViewport: mockPanViewport,
        zoomTable: mockZoomTable,
      });

      render(<TablePanel />);

      expect(getCreateButton()).toBeDefined();
    });
  });

  describe('Table List Display', () => {
    it('should display all tables', () => {
      render(<TablePanel />);

      expect(screen.getByText('Main Dungeon')).toBeDefined();
      expect(screen.getByText('Town Square')).toBeDefined();
    });

    it('should display table dimensions', () => {
      render(<TablePanel />);

      expect(screen.getByText('2000×2000')).toBeDefined();
      expect(screen.getByText('1500×1500')).toBeDefined();
    });

    it('should display table scale', () => {
      render(<TablePanel />);

      expect(screen.getByText(/scale: 1\.00x/i)).toBeDefined();
      expect(screen.getByText(/scale: 0\.80x/i)).toBeDefined();
    });

    it('should highlight active table', () => {
      render(<TablePanel />);

      const mainDungeonItem = screen.getByText('Main Dungeon').closest('[class*="tableItem"]');
      expect(mainDungeonItem?.className).toContain('active');

      const townSquareItem = screen.getByText('Town Square').closest('[class*="tableItem"]');
      expect(townSquareItem?.className).not.toContain('active');
    });

    it('should show remove button for each table', () => {
      render(<TablePanel />);

      const removeButtons = screen.getAllByTitle(/remove table/i);
      expect(removeButtons.length).toBe(2);
    });
  });

  describe('Table Creation', () => {
    it('should show create form when + button is clicked', async () => {
      const user = userEvent.setup();
      render(<TablePanel />);

      await user.click(getCreateButton());

      expect(screen.getByPlaceholderText(/table name/i)).toBeDefined();
      expect(screen.getByRole('button', { name: /create/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeDefined();
    });

    it('should hide create form when cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<TablePanel />);

      await user.click(getCreateButton());
      expect(screen.getByPlaceholderText(/table name/i)).toBeDefined();

      await user.click(screen.getByRole('button', { name: /cancel/i }));
      expect(screen.queryByPlaceholderText(/table name/i)).toBeNull();
    });

    it('should toggle create form when + button clicked multiple times', async () => {
      const user = userEvent.setup();
      render(<TablePanel />);

      // Show form
      await user.click(getCreateButton());
      expect(screen.getByPlaceholderText(/table name/i)).toBeDefined();

      // Hide form
      await user.click(getCreateButton());
      expect(screen.queryByPlaceholderText(/table name/i)).toBeNull();

      // Show form again
      await user.click(getCreateButton());
      expect(screen.getByPlaceholderText(/table name/i)).toBeDefined();
    });

    it('should update table name input', async () => {
      const user = userEvent.setup();
      render(<TablePanel />);

      await user.click(getCreateButton());
      
      const nameInput = screen.getByPlaceholderText(/table name/i) as HTMLInputElement;
      await user.type(nameInput, 'New Adventure');

      expect(nameInput.value).toBe('New Adventure');
    });

    it('should update width input', async () => {
      const user = userEvent.setup();
      render(<TablePanel />);

      await user.click(getCreateButton());
      
      const widthInput = screen.getByLabelText(/width/i) as HTMLInputElement;
      await user.clear(widthInput);
      await user.type(widthInput, '3000');

      expect(widthInput.value).toBe('3000');
    });

    it('should update height input', async () => {
      const user = userEvent.setup();
      render(<TablePanel />);

      await user.click(getCreateButton());
      
      const heightInput = screen.getByLabelText(/height/i) as HTMLInputElement;
      await user.clear(heightInput);
      await user.type(heightInput, '2500');

      expect(heightInput.value).toBe('2500');
    });

    it('should call createTable when create button is clicked', async () => {
      const user = userEvent.setup();
      render(<TablePanel />);

      await user.click(getCreateButton());
      
      const nameInput = screen.getByPlaceholderText(/table name/i);
      await user.type(nameInput, 'Test Table');

      await user.click(screen.getByRole('button', { name: /create/i }));

      expect(mockCreateTable).toHaveBeenCalledWith(
        expect.stringMatching(/table_\d+/),
        'Test Table',
        2000,
        2000
      );
    });

    it('should not create table if name is empty', async () => {
      const user = userEvent.setup();
      render(<TablePanel />);

      await user.click(getCreateButton());
      await user.click(screen.getByRole('button', { name: /create/i }));

      expect(mockCreateTable).not.toHaveBeenCalled();
    });

    it('should not create table if name is only whitespace', async () => {
      const user = userEvent.setup();
      render(<TablePanel />);

      await user.click(getCreateButton());
      
      const nameInput = screen.getByPlaceholderText(/table name/i);
      await user.type(nameInput, '   ');
      await user.click(screen.getByRole('button', { name: /create/i }));

      expect(mockCreateTable).not.toHaveBeenCalled();
    });

    it('should close form and activate table after successful creation', async () => {
      const user = userEvent.setup();
      render(<TablePanel />);

      await user.click(getCreateButton());
      
      const nameInput = screen.getByPlaceholderText(/table name/i);
      await user.type(nameInput, 'New Table');
      await user.click(screen.getByRole('button', { name: /create/i }));

      expect(mockSetActiveTable).toHaveBeenCalledWith(expect.stringMatching(/table_\d+/));
      expect(screen.queryByPlaceholderText(/table name/i)).toBeNull();
    });

    it('should use custom dimensions when creating table', async () => {
      const user = userEvent.setup();
      render(<TablePanel />);

      await user.click(getCreateButton());
      
      const nameInput = screen.getByPlaceholderText(/table name/i);
      await user.type(nameInput, 'Custom Size Table');
      
      const widthInput = screen.getByLabelText(/width/i);
      await user.clear(widthInput);
      await user.type(widthInput, '3500');
      
      const heightInput = screen.getByLabelText(/height/i);
      await user.clear(heightInput);
      await user.type(heightInput, '2800');

      await user.click(screen.getByRole('button', { name: /create/i }));

      expect(mockCreateTable).toHaveBeenCalledWith(
        expect.any(String),
        'Custom Size Table',
        3500,
        2800
      );
    });
  });

  describe('Table Selection', () => {
    it('should call setActiveTable when table name is clicked', async () => {
      const user = userEvent.setup();
      render(<TablePanel />);

      await user.click(screen.getByText('Town Square'));

      expect(mockSetActiveTable).toHaveBeenCalledWith('table_2');
    });

    it('should allow switching between tables', async () => {
      const user = userEvent.setup();
      render(<TablePanel />);

      await user.click(screen.getByText('Main Dungeon'));
      expect(mockSetActiveTable).toHaveBeenCalledWith('table_1');

      await user.click(screen.getByText('Town Square'));
      expect(mockSetActiveTable).toHaveBeenCalledWith('table_2');
    });
  });

  describe('Table Removal', () => {
    it('should call removeTable when remove button is clicked', async () => {
      const user = userEvent.setup();
      render(<TablePanel />);

      const removeButtons = screen.getAllByTitle(/remove table/i);
      await user.click(removeButtons[0]);

      expect(mockRemoveTable).toHaveBeenCalledWith('table_1');
    });

    it('should allow removing different tables', async () => {
      const user = userEvent.setup();
      render(<TablePanel />);

      const removeButtons = screen.getAllByTitle(/remove table/i);
      
      await user.click(removeButtons[1]);
      expect(mockRemoveTable).toHaveBeenCalledWith('table_2');
    });
  });

  describe('Grid Controls', () => {
    it('should show grid controls for active table', () => {
      render(<TablePanel />);

      const activeTableItem = screen.getByText('Main Dungeon').closest('[class*="tableItem"]');
      const gridCheckbox = within(activeTableItem!).getByRole('checkbox', { name: /show grid/i });
      
      expect(gridCheckbox).toBeDefined();
    });

    it('should not show grid controls for inactive table', () => {
      render(<TablePanel />);

      const inactiveTableItem = screen.getByText('Town Square').closest('[class*="tableItem"]');
      const gridCheckbox = within(inactiveTableItem!).queryByRole('checkbox', { name: /show grid/i });
      
      expect(gridCheckbox).toBeNull();
    });

    it('should reflect grid state in checkbox', () => {
      render(<TablePanel />);

      const activeTableItem = screen.getByText('Main Dungeon').closest('[class*="tableItem"]');
      const gridCheckbox = within(activeTableItem!).getByRole('checkbox', { name: /show grid/i }) as HTMLInputElement;
      
      expect(gridCheckbox.checked).toBe(true);
    });

    it('should toggle grid when checkbox is clicked', async () => {
      const user = userEvent.setup();
      render(<TablePanel />);

      const activeTableItem = screen.getByText('Main Dungeon').closest('[class*="tableItem"]');
      const gridCheckbox = within(activeTableItem!).getByRole('checkbox', { name: /show grid/i });
      
      await user.click(gridCheckbox);

      expect(mockSetTableGrid).toHaveBeenCalledWith('table_1', false, 50);
    });

    it('should show cell size input when grid is enabled', () => {
      render(<TablePanel />);

      const activeTableItem = screen.getByText('Main Dungeon').closest('[class*="tableItem"]');
      const cellSizeInput = within(activeTableItem!).getByTitle(/grid cell size/i);
      
      expect(cellSizeInput).toBeDefined();
    });

    it('should update cell size when input changes', async () => {
      const user = userEvent.setup();
      render(<TablePanel />);

      const activeTableItem = screen.getByText('Main Dungeon').closest('[class*="tableItem"]');
      const cellSizeInput = within(activeTableItem!).getByTitle(/grid cell size/i);
      
      await user.clear(cellSizeInput);
      await user.type(cellSizeInput, '75');

      // Verify setTableGrid was called (typing triggers onChange for each keystroke)
      expect(mockSetTableGrid).toHaveBeenCalled();
      expect(mockSetTableGrid.mock.calls[0][0]).toBe('table_1');
      expect(mockSetTableGrid.mock.calls[0][1]).toBe(true);
    });
  });

  describe('Pan Controls', () => {
    it('should show pan controls for active table', () => {
      render(<TablePanel />);

      expect(screen.getByText(/pan:/i)).toBeDefined();
      expect(screen.getByRole('button', { name: '↑' })).toBeDefined();
      expect(screen.getByRole('button', { name: '↓' })).toBeDefined();
      expect(screen.getByRole('button', { name: '←' })).toBeDefined();
      expect(screen.getByRole('button', { name: '→' })).toBeDefined();
    });

    it('should pan up when up button is clicked', async () => {
      const user = userEvent.setup();
      render(<TablePanel />);

      await user.click(screen.getByRole('button', { name: '↑' }));

      expect(mockPanViewport).toHaveBeenCalledWith('table_1', 0, -100);
    });

    it('should pan down when down button is clicked', async () => {
      const user = userEvent.setup();
      render(<TablePanel />);

      await user.click(screen.getByRole('button', { name: '↓' }));

      expect(mockPanViewport).toHaveBeenCalledWith('table_1', 0, 100);
    });

    it('should pan left when left button is clicked', async () => {
      const user = userEvent.setup();
      render(<TablePanel />);

      await user.click(screen.getByRole('button', { name: '←' }));

      expect(mockPanViewport).toHaveBeenCalledWith('table_1', -100, 0);
    });

    it('should pan right when right button is clicked', async () => {
      const user = userEvent.setup();
      render(<TablePanel />);

      await user.click(screen.getByRole('button', { name: '→' }));

      expect(mockPanViewport).toHaveBeenCalledWith('table_1', 100, 0);
    });

    it('should allow multiple pan operations', async () => {
      const user = userEvent.setup();
      render(<TablePanel />);

      await user.click(screen.getByRole('button', { name: '↑' }));
      await user.click(screen.getByRole('button', { name: '→' }));
      await user.click(screen.getByRole('button', { name: '↓' }));

      expect(mockPanViewport).toHaveBeenCalledTimes(3);
    });
  });

  describe('Zoom Controls', () => {
    it('should show zoom controls for active table', () => {
      render(<TablePanel />);

      const zoomLabel = screen.getByText(/zoom:/i);
      expect(zoomLabel).toBeDefined();
      
      // Find zoom buttons within the zoom controls section
      const zoomControls = zoomLabel.closest('[class*="zoomControls"]') || zoomLabel.parentElement;
      expect(within(zoomControls!).getByRole('button', { name: '+' })).toBeDefined();
      expect(within(zoomControls!).getByRole('button', { name: '-' })).toBeDefined();
    });

    it('should zoom in when + button is clicked', async () => {
      const user = userEvent.setup();
      render(<TablePanel />);

      // Find the zoom + button specifically
      const zoomLabel = screen.getByText(/zoom:/i);
      const zoomControls = zoomLabel.closest('[class*="zoomControls"]') || zoomLabel.parentElement;
      const zoomInButton = within(zoomControls!).getByRole('button', { name: '+' });
      
      await user.click(zoomInButton);

      // zoomTable is called with (tableId, zoomFactor, centerX, centerY)
      expect(mockZoomTable).toHaveBeenCalledWith('table_1', 1.2, 400, 300);
    });

    it('should zoom out when - button is clicked', async () => {
      const user = userEvent.setup();
      render(<TablePanel />);

      const zoomLabel = screen.getByText(/zoom:/i);
      const zoomControls = zoomLabel.closest('[class*="zoomControls"]') || zoomLabel.parentElement;
      const zoomOutButton = within(zoomControls!).getByRole('button', { name: '-' });
      
      await user.click(zoomOutButton);

      // zoomTable is called with (tableId, zoomFactor, centerX, centerY)
      expect(mockZoomTable).toHaveBeenCalledWith('table_1', 0.8, 400, 300);
    });

    it('should allow multiple zoom operations', async () => {
      const user = userEvent.setup();
      render(<TablePanel />);

      const zoomLabel = screen.getByText(/zoom:/i);
      const zoomControls = zoomLabel.closest('[class*="zoomControls"]') || zoomLabel.parentElement;
      const zoomInButton = within(zoomControls!).getByRole('button', { name: '+' });
      const zoomOutButton = within(zoomControls!).getByRole('button', { name: '-' });

      await user.click(zoomInButton);
      await user.click(zoomInButton);
      await user.click(zoomOutButton);

      expect(mockZoomTable).toHaveBeenCalledTimes(3);
    });
  });

  describe('Viewport Info Display', () => {
    it('should display viewport coordinates for active table', () => {
      render(<TablePanel />);

      expect(screen.getByText(/viewport: \(0, 0\)/i)).toBeDefined();
    });

    it('should show accurate viewport coordinates', async () => {
      const module = await import('@features/table');
      vi.mocked(module.useTableManager).mockReturnValue({
        activeTableId: 'table_2',
        tables: mockTables,
        createTable: mockCreateTable,
        setActiveTable: mockSetActiveTable,
        setTableGrid: mockSetTableGrid,
        removeTable: mockRemoveTable,
        panViewport: mockPanViewport,
        zoomTable: mockZoomTable,
      });

      render(<TablePanel />);

      // table_2 has viewport_x: 100, viewport_y: 200
      expect(screen.getByText(/viewport: \(100, 200\)/i)).toBeDefined();
    });
  });

  describe('UI Layout', () => {
    it('should have header with title', () => {
      render(<TablePanel />);

      expect(screen.getByRole('heading', { name: /tables/i })).toBeDefined();
    });

    it('should have create button in header', () => {
      render(<TablePanel />);

      const header = document.querySelector('[class*="tablePanelHeader"]');
      const createButton = within(header!).getByRole('button', { name: '+' });
      
      expect(createButton).toBeDefined();
    });
  });

  describe('Input Validation', () => {
    it('should enforce minimum width', async () => {
      const user = userEvent.setup();
      render(<TablePanel />);

      // Find the create button in the header
      const header = document.querySelector('[class*="tablePanelHeader"]');
      const createButton = within(header!).getByRole('button', { name: '+' });
      await user.click(createButton);
      
      const widthInput = screen.getByLabelText(/width/i) as HTMLInputElement;
      
      expect(widthInput.min).toBe('500');
      expect(widthInput.max).toBe('10000');
    });

    it('should enforce minimum cell size', () => {
      render(<TablePanel />);

      const activeTableItem = screen.getByText('Main Dungeon').closest('[class*="tableItem"]');
      const cellSizeInput = within(activeTableItem!).getByTitle(/grid cell size/i) as HTMLInputElement;
      
      expect(cellSizeInput.min).toBe('5');
    });

    it('should enforce maximum cell size', () => {
      render(<TablePanel />);

      const activeTableItem = screen.getByText('Main Dungeon').closest('[class*="tableItem"]');
      const cellSizeInput = within(activeTableItem!).getByTitle(/grid cell size/i) as HTMLInputElement;
      
      expect(cellSizeInput.max).toBe('200');
    });
  });
});
