/**
 * RightPanel — RBAC tab visibility tests
 *
 * Verifies that users only see the tabs appropriate to their role.
 * Tests real user behaviour: which tabs are present in the navigation.
 */
import { useGameStore } from '@/store';
import { RightPanel } from '@app/RightPanel';
import type { SessionRole } from '@features/session/types/roles';
import '@testing-library/jest-dom';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock all panel components — we test routing, not panel internals
vi.mock('@features/assets', () => ({
  AssetPanel: () => null,
  BackgroundManagementPanel: () => <div>Backgrounds Panel</div>,
}));
vi.mock('@features/character', () => ({
  CharacterPanel: () => <div>Character Panel</div>,
}));
vi.mock('@features/character/components/CustomizePanel', () => ({
  CustomizePanel: () => <div>Customize Panel</div>,
}));
vi.mock('@features/chat', () => ({
  ChatPanel: () => <div>Chat Panel</div>,
}));
vi.mock('@features/combat', () => ({
  InitiativeTracker: () => <div>Initiative Panel</div>,
}));
vi.mock('@features/compendium', () => ({
  CompendiumPanel: () => <div>Compendium Panel</div>,
}));
vi.mock('@features/fog', () => ({
  FogPanel: () => <div>Fog Panel</div>,
}));
vi.mock('@features/lighting', () => ({
  LightingPanel: () => <div>Lighting Panel</div>,
  initVisionService: vi.fn(),
  stopVisionService: vi.fn(),
}));
vi.mock('@features/measurement', () => ({
  AdvancedMeasurementPanel: () => <div>Measurement Panel</div>,
}));
vi.mock('@features/table', () => ({
  TableManagementPanel: () => <div>Table Panel</div>,
  TablePanel: () => null,
  TableSyncPanel: () => null,
}));
vi.mock('@features/canvas/components/EntitiesPanel', () => ({
  EntitiesPanel: () => <div>Entities Panel</div>,
}));
vi.mock('@features/canvas/components/PerformanceSettingsPanel', () => ({
  default: () => <div>Performance Panel</div>,
}));
vi.mock('@features/network/components/PlayerManagerPanel', () => ({
  PlayerManagerPanel: () => <div>Players Panel</div>,
}));
vi.mock('@features/network/components/NetworkPanel', () => ({
  NetworkPanel: () => null,
}));
vi.mock('@features/actions/components/ActionsQuickPanel', () => ({
  ActionsQuickPanel: () => <div>Quick Actions Panel</div>,
}));
vi.mock('@features/actions/components/ActionsPanel', () => ({
  ActionsPanel: () => null,
}));
vi.mock('@features/actions/components/ActionQueuePanel', () => ({
  ActionQueuePanel: () => null,
}));

function setRole(role: SessionRole) {
  useGameStore.setState({ sessionRole: role });
}

function renderPanel() {
  return render(<RightPanel sessionCode="TEST123" />);
}

describe('RightPanel — tab visibility per role', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGameStore.setState({ sessionRole: 'player' });
  });

  describe('Game Master (owner)', () => {
    beforeEach(() => setRole('owner'));

    it('sees the Tables tab', () => {
      renderPanel();
      expect(screen.getByRole('tab', { name: /tables/i })).toBeInTheDocument();
    });

    it('sees the Players tab', () => {
      renderPanel();
      expect(screen.getByRole('tab', { name: /players/i })).toBeInTheDocument();
    });

    it('sees the Lighting tab', () => {
      renderPanel();
      expect(screen.getByRole('tab', { name: /lighting/i })).toBeInTheDocument();
    });

    it('sees the Fog tab', () => {
      renderPanel();
      expect(screen.getByRole('tab', { name: /fog/i })).toBeInTheDocument();
    });

    it('sees the Compendium tab', () => {
      renderPanel();
      expect(screen.getByRole('tab', { name: /compendium/i })).toBeInTheDocument();
    });

    it('sees the Characters tab', () => {
      renderPanel();
      expect(screen.getByRole('tab', { name: /characters/i })).toBeInTheDocument();
    });
  });

  describe('Co-DM', () => {
    beforeEach(() => setRole('co_dm'));

    it('sees all the same tabs as owner', () => {
      renderPanel();
      expect(screen.getByRole('tab', { name: /tables/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /lighting/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /players/i })).toBeInTheDocument();
    });
  });

  describe('Trusted Player', () => {
    beforeEach(() => setRole('trusted_player'));

    it('sees the Compendium tab', () => {
      renderPanel();
      expect(screen.getByRole('tab', { name: /compendium/i })).toBeInTheDocument();
    });

    it('sees the Characters tab', () => {
      renderPanel();
      expect(screen.getByRole('tab', { name: /characters/i })).toBeInTheDocument();
    });

    it('does not see the Tables tab', () => {
      renderPanel();
      expect(screen.queryByRole('tab', { name: /^tables$/i })).not.toBeInTheDocument();
    });

    it('does not see the Lighting tab', () => {
      renderPanel();
      expect(screen.queryByRole('tab', { name: /^lighting$/i })).not.toBeInTheDocument();
    });

    it('does not see the Players tab', () => {
      renderPanel();
      expect(screen.queryByRole('tab', { name: /^players$/i })).not.toBeInTheDocument();
    });
  });

  describe('Player', () => {
    beforeEach(() => setRole('player'));

    it('sees the Characters tab', () => {
      renderPanel();
      expect(screen.getByRole('tab', { name: /characters/i })).toBeInTheDocument();
    });

    it('sees the Initiative tab', () => {
      renderPanel();
      expect(screen.getByRole('tab', { name: /initiative/i })).toBeInTheDocument();
    });

    it('does not see the Compendium tab', () => {
      renderPanel();
      expect(screen.queryByRole('tab', { name: /compendium/i })).not.toBeInTheDocument();
    });

    it('does not see the Tables tab', () => {
      renderPanel();
      expect(screen.queryByRole('tab', { name: /^tables$/i })).not.toBeInTheDocument();
    });

    it('does not see the Fog tab', () => {
      renderPanel();
      expect(screen.queryByRole('tab', { name: /^fog$/i })).not.toBeInTheDocument();
    });
  });

  describe('Spectator', () => {
    beforeEach(() => setRole('spectator'));

    it('does not see the Characters tab', () => {
      renderPanel();
      expect(screen.queryByRole('tab', { name: /characters/i })).not.toBeInTheDocument();
    });

    it('does not see the Chat tab', () => {
      renderPanel();
      expect(screen.queryByRole('tab', { name: /^chat$/i })).not.toBeInTheDocument();
    });

    it('still sees the Entities tab', () => {
      renderPanel();
      expect(screen.getByRole('tab', { name: /entities/i })).toBeInTheDocument();
    });

    it('still sees the Initiative tab', () => {
      renderPanel();
      expect(screen.getByRole('tab', { name: /initiative/i })).toBeInTheDocument();
    });
  });

  describe('Active tab auto-correction on role change', () => {
    it('switches away from a now-hidden tab when role downgrades', async () => {
      // Start as DM — Tables tab is visible
      setRole('owner');
      const { rerender } = render(<RightPanel sessionCode="TEST123" />);
      expect(screen.getByRole('tab', { name: /^tables$/i })).toBeInTheDocument();

      // Downgrade to player — store update must be wrapped in act
      await act(async () => {
        setRole('player');
      });
      rerender(<RightPanel sessionCode="TEST123" />);

      expect(screen.queryByRole('tab', { name: /^tables$/i })).not.toBeInTheDocument();
      // Panel should still render some tab navigation
      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });
  });
});
