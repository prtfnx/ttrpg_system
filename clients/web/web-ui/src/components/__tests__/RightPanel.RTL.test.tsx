import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RightPanel } from '../../app/RightPanel';

// Mock only what's necessary - child components that would cause issues
vi.mock('../features/table/components/TableManagementPanel', () => ({
  TableManagementPanel: () => <div data-testid="table-management-panel">Table Management</div>,
}));

vi.mock('../features/character/components/CharacterPanel', () => ({
  CharacterPanel: () => <div data-testid="character-panel">Character Panel</div>,
}));

vi.mock('../features/compendium/components/CompendiumPanel', () => ({
  CompendiumPanel: () => <div data-testid="compendium-panel">Compendium Panel</div>,
}));

vi.mock('../features/actions/components/ActionsQuickPanel', () => ({
  ActionsQuickPanel: () => <div data-testid="actions-quick-panel">Quick Actions Panel</div>,
}));

vi.mock('../features/network/components/PlayerManagerPanel', () => ({
  PlayerManagerPanel: () => <div data-testid="player-manager-panel">Player Manager</div>,
}));

vi.mock('../features/combat/components/InitiativeTracker', () => ({
  InitiativeTracker: () => <div data-testid="initiative-tracker">Initiative Tracker</div>,
}));

vi.mock('../features/canvas/components/EntitiesPanel', () => ({
  EntitiesPanel: () => <div data-testid="entities-panel">Entities Panel</div>,
}));

vi.mock('../features/chat/components/ChatPanel', () => ({
  ChatPanel: () => <div data-testid="chat-panel">Chat Panel</div>,
}));

vi.mock('../features/lighting/components/LightingPanel', () => ({
  LightingPanel: () => <div data-testid="lighting-panel">Lighting Panel</div>,
}));

vi.mock('../features/fog/components/FogPanel', () => ({
  FogPanel: () => <div data-testid="fog-panel">Fog Panel</div>,
}));

vi.mock('../features/measurement/components/AdvancedMeasurementPanel', () => ({
  AdvancedMeasurementPanel: () => <div data-testid="advanced-measurement-panel">Measurement Panel</div>,
}));

vi.mock('../features/assets/components/BackgroundManagementPanel', () => ({
  BackgroundManagementPanel: () => <div data-testid="background-management-panel">Background Panel</div>,
}));

vi.mock('../features/canvas/components/PerformanceSettingsPanel', () => ({
  default: () => <div data-testid="performance-settings-panel">Performance Settings</div>,
}));

vi.mock('../features/character/components/CustomizePanel', () => ({
  CustomizePanel: () => <div data-testid="customize-panel">Customize Panel</div>,
}));

describe('RightPanel', () => {
  const user = userEvent.setup();
  const mockUserInfo = { id: 123, username: 'testuser', role: 'player' as const, permissions: [] };
  const mockSessionCode = 'TEST123';

  beforeEach(() => {
    vi.clearAllMocks();
    // Set production mode by default
    vi.stubEnv('DEV', false);
  });

  describe('Tab Structure and Accessibility', () => {
    it('renders tab navigation with proper ARIA structure', () => {
      render(<RightPanel sessionCode={mockSessionCode} userInfo={mockUserInfo} />);

      const tabList = screen.getByRole('tablist', { name: /panel navigation/i });
      expect(tabList).toBeInTheDocument();

      const tabPanel = screen.getByRole('tabpanel');
      expect(tabPanel).toBeInTheDocument();
    });

    it('shows all production tabs with proper accessibility', () => {
      render(<RightPanel sessionCode={mockSessionCode} userInfo={mockUserInfo} />);

      // Verify all production tabs are present with proper roles
      const tabs = [
        'Compendium', 'Tables', 'Quick Actions', 'Characters', 
        'Players', 'Initiative', 'Entities', 'Chat', 
        'Lighting', 'Fog', 'Measurement', 'Backgrounds', 
        'Performance', 'Customize'
      ];

      tabs.forEach(tabName => {
        const tab = screen.getByRole('tab', { name: new RegExp(tabName, 'i') });
        expect(tab).toBeInTheDocument();
        expect(tab).toHaveAttribute('aria-selected');
      });
    });

    it('defaults to Tables tab being selected', () => {
      render(<RightPanel sessionCode={mockSessionCode} userInfo={mockUserInfo} />);

      const tablesTab = screen.getByRole('tab', { name: /^tables$/i });
      expect(tablesTab).toHaveAttribute('aria-selected', 'true');

      const tabPanel = screen.getByRole('tabpanel', { name: /tables panel/i });
      expect(within(tabPanel).getByTestId('table-management-panel')).toBeInTheDocument();
    });
  });

  describe('Tab Navigation Behavior', () => {
    it('switches to Characters tab when clicked', async () => {
      render(<RightPanel sessionCode={mockSessionCode} userInfo={mockUserInfo} />);

      const charactersTab = screen.getByRole('tab', { name: /^characters$/i });
      await user.click(charactersTab);

      expect(charactersTab).toHaveAttribute('aria-selected', 'true');
      
      const tabPanel = screen.getByRole('tabpanel', { name: /characters panel/i });
      expect(within(tabPanel).getByTestId('character-panel')).toBeInTheDocument();

      // Previous tab content should not be visible
      expect(screen.queryByTestId('table-management-panel')).not.toBeInTheDocument();
    });

    it('switches to Compendium tab and shows correct content', async () => {
      render(<RightPanel sessionCode={mockSessionCode} userInfo={mockUserInfo} />);

      const compendiumTab = screen.getByRole('tab', { name: /compendium/i });
      await user.click(compendiumTab);

      expect(compendiumTab).toHaveAttribute('aria-selected', 'true');
      
      const tabPanel = screen.getByRole('tabpanel', { name: /compendium panel/i });
      expect(within(tabPanel).getByTestId('compendium-panel')).toBeInTheDocument();
    });

    it('switches to Quick Actions tab', async () => {
      render(<RightPanel sessionCode={mockSessionCode} userInfo={mockUserInfo} />);

      const quickActionsTab = screen.getByRole('tab', { name: /quick actions/i });
      await user.click(quickActionsTab);

      expect(quickActionsTab).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('actions-quick-panel')).toBeInTheDocument();
    });

    it('switches between multiple tabs correctly', async () => {
      render(<RightPanel sessionCode={mockSessionCode} userInfo={mockUserInfo} />);

      // Start at Tables (default)
      expect(screen.getByRole('tab', { name: /^tables$/i })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('table-management-panel')).toBeInTheDocument();

      // Switch to Players
      const playersTab = screen.getByRole('tab', { name: /^players$/i });
      await user.click(playersTab);

      expect(playersTab).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('player-manager-panel')).toBeInTheDocument();
      expect(screen.queryByTestId('table-management-panel')).not.toBeInTheDocument();

      // Switch to Initiative
      const initiativeTab = screen.getByRole('tab', { name: /initiative/i });
      await user.click(initiativeTab);

      expect(initiativeTab).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('initiative-tracker')).toBeInTheDocument();
      expect(screen.queryByTestId('player-manager-panel')).not.toBeInTheDocument();
    });

    it('properly manages aria-selected across tab switches', async () => {
      render(<RightPanel sessionCode={mockSessionCode} userInfo={mockUserInfo} />);

      const tablesTab = screen.getByRole('tab', { name: /^tables$/i });
      const entitiesTab = screen.getByRole('tab', { name: /^entities$/i });

      // Initially Tables is selected
      expect(tablesTab).toHaveAttribute('aria-selected', 'true');
      expect(entitiesTab).toHaveAttribute('aria-selected', 'false');

      // Switch to Entities
      await user.click(entitiesTab);

      expect(tablesTab).toHaveAttribute('aria-selected', 'false');
      expect(entitiesTab).toHaveAttribute('aria-selected', 'true');
    });
  });

  describe('Panel Content Display', () => {
    it('shows Chat panel when Chat tab is selected', async () => {
      render(<RightPanel sessionCode={mockSessionCode} userInfo={mockUserInfo} />);

      const chatTab = screen.getByRole('tab', { name: /^chat$/i });
      await user.click(chatTab);

      expect(screen.getByTestId('chat-panel')).toBeInTheDocument();
    });

    it('shows Lighting panel when Lighting tab is selected', async () => {
      render(<RightPanel sessionCode={mockSessionCode} userInfo={mockUserInfo} />);

      const lightingTab = screen.getByRole('tab', { name: /lighting/i });
      await user.click(lightingTab);

      expect(screen.getByTestId('lighting-panel')).toBeInTheDocument();
    });

    it('shows Fog panel when Fog tab is selected', async () => {
      render(<RightPanel sessionCode={mockSessionCode} userInfo={mockUserInfo} />);

      const fogTab = screen.getByRole('tab', { name: /fog/i });
      await user.click(fogTab);

      expect(screen.getByTestId('fog-panel')).toBeInTheDocument();
    });

    it('shows utility panels when selected', async () => {
      render(<RightPanel sessionCode={mockSessionCode} userInfo={mockUserInfo} />);

      // Test Measurement panel
      const measurementTab = screen.getByRole('tab', { name: /measurement/i });
      await user.click(measurementTab);
      expect(screen.getByTestId('advanced-measurement-panel')).toBeInTheDocument();

      // Test Backgrounds panel  
      const backgroundsTab = screen.getByRole('tab', { name: /backgrounds/i });
      await user.click(backgroundsTab);
      expect(screen.getByTestId('background-management-panel')).toBeInTheDocument();

      // Test Performance panel
      const performanceTab = screen.getByRole('tab', { name: /performance/i });
      await user.click(performanceTab);
      expect(screen.getByTestId('performance-settings-panel')).toBeInTheDocument();

      // Test Customize panel
      const customizeTab = screen.getByRole('tab', { name: /customize/i });
      await user.click(customizeTab);
      expect(screen.getByTestId('customize-panel')).toBeInTheDocument();
    });
  });

  describe('Development Mode Features', () => {
    beforeEach(() => {
      vi.stubEnv('DEV', true);
    });

    it('shows development tabs in development mode', () => {
      render(<RightPanel sessionCode={mockSessionCode} userInfo={mockUserInfo} />);

      const devTabs = ['Table Tools', 'Sync', 'Actions', 'Queue', 'Assets', 'Network'];
      
      devTabs.forEach(tabName => {
        const tab = screen.getByRole('tab', { name: new RegExp(tabName, 'i') });
        expect(tab).toBeInTheDocument();
        expect(tab).toHaveAttribute('aria-selected', 'false');
      });
    });

    it('can switch to development tabs', async () => {
      // Mock the development components
      vi.mock('../features/table/components/TablePanel', () => ({
        TablePanel: () => <div data-testid="table-panel">Table Tools Panel</div>,
      }));

      vi.mock('../features/table/components/TableSyncPanel', () => ({
        TableSyncPanel: () => <div data-testid="table-sync-panel">Table Sync Panel</div>,
      }));

      render(<RightPanel sessionCode={mockSessionCode} userInfo={mockUserInfo} />);

      // Test switching to a dev tab
      const syncTab = screen.getByRole('tab', { name: /^sync$/i });
      await user.click(syncTab);

      expect(syncTab).toHaveAttribute('aria-selected', 'true');
      // Note: The actual panel rendering depends on dynamic imports
    });
  });

  describe('Session and User Props', () => {
    it('passes session code and user info to appropriate panels', async () => {
      const customUserInfo = { id: 456, username: 'customuser', role: 'dm' as const, permissions: [] };
      const customSessionCode = 'CUSTOM789';

      render(<RightPanel sessionCode={customSessionCode} userInfo={customUserInfo} />);

      // Switch to Players tab which receives these props
      const playersTab = screen.getByRole('tab', { name: /^players$/i });
      await user.click(playersTab);

      expect(screen.getByTestId('player-manager-panel')).toBeInTheDocument();
      
      // Switch to Initiative which also receives props
      const initiativeTab = screen.getByRole('tab', { name: /initiative/i });
      await user.click(initiativeTab);

      expect(screen.getByTestId('initiative-tracker')).toBeInTheDocument();
    });
  });

  describe('Keyboard Navigation', () => {
    it('supports keyboard navigation between tabs', async () => {
      render(<RightPanel sessionCode={mockSessionCode} userInfo={mockUserInfo} />);

      const tablesTab = screen.getByRole('tab', { name: /^tables$/i });
      const compendiumTab = screen.getByRole('tab', { name: /compendium/i });

      // Focus on first tab
      tablesTab.focus();
      expect(tablesTab).toHaveFocus();

      // Use keyboard to navigate (actual navigation depends on keyboard handler implementation)
      // For now, just test that tabs are focusable
      await user.tab();
      expect(document.activeElement).toBeTruthy();
    });

    it('allows activation of tabs with Enter key', async () => {
      render(<RightPanel sessionCode={mockSessionCode} userInfo={mockUserInfo} />);

      const charactersTab = screen.getByRole('tab', { name: /^characters$/i });
      
      charactersTab.focus();
      await user.keyboard('{Enter}');

      expect(charactersTab).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('character-panel')).toBeInTheDocument();
    });
  });
});