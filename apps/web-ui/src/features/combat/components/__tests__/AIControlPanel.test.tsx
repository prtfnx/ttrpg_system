import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIControlPanel } from '../AIControlPanel';

const mockSendMessage = vi.fn();

vi.mock('../../stores/combatStore', () => ({
  useCombatStore: vi.fn(),
}));

vi.mock('@lib/api', () => ({
  useOptionalProtocol: vi.fn(() => ({ protocol: { sendMessage: mockSendMessage } })),
}));

vi.mock('@lib/websocket', () => ({
  createMessage: vi.fn((type: string, data: unknown) => ({ type, data })),
  MessageType: { COMBAT_COMMAND: 'combat_command', AI_ACTION: 'AI_ACTION' },
}));

vi.mock('../AIControlPanel.module.css', () => ({
  default: { panel: 'panel', title: 'title', row: 'row', name: 'name', select: 'select', toggle: 'toggle', actBtn: 'actBtn' }
}));

import { useCombatStore } from '../../stores/combatStore';

const npc1 = {
  combatant_id: 'npc-1', name: 'Goblin',
  is_npc: true, is_defeated: false,
  ai_behavior: 'aggressive', ai_enabled: true,
};

const mockStore = (combat: unknown) => {
  (useCombatStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (s: unknown) => unknown) =>
    selector({ combat })
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  mockStore(null);
});

describe('AIControlPanel', () => {
  it('returns null when no combat', () => {
    const { container } = render(<AIControlPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when no NPCs', () => {
    mockStore({ combatants: [{ ...npc1, is_npc: false }] });
    const { container } = render(<AIControlPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when all NPCs are defeated', () => {
    mockStore({ combatants: [{ ...npc1, is_defeated: true }] });
    const { container } = render(<AIControlPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('renders NPC name and controls', () => {
    mockStore({ combatants: [npc1] });
    render(<AIControlPanel />);
    expect(screen.getByText('Goblin')).toBeTruthy();
    expect(screen.getByRole('combobox')).toBeTruthy();
    expect(screen.getByTitle('Trigger AI action now')).toBeTruthy();
  });

  it('changes AI behavior through a canonical DM override', () => {
    mockStore({ combatants: [npc1] });
    render(<AIControlPanel />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'defensive' } });
    expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'combat_command',
      data: expect.objectContaining({
        commands: [expect.objectContaining({
          actor_id: 'npc-1',
          override_type: 'configure_ai',
          ai_behavior: 'defensive',
        })],
      }),
    }));
  });

  it('toggles AI through a canonical DM override', () => {
    mockStore({ combatants: [npc1] });
    render(<AIControlPanel />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'combat_command',
      data: expect.objectContaining({
        commands: [expect.objectContaining({
          actor_id: 'npc-1',
          override_type: 'configure_ai',
          ai_enabled: false,
        })],
      }),
    }));
  });

  it('calls triggerAI on Act button click', () => {
    mockStore({ combatants: [npc1] });
    render(<AIControlPanel />);
    fireEvent.click(screen.getByTitle('Trigger AI action now'));
    expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'AI_ACTION',
      data: { combatant_id: 'npc-1' },
    }));
  });
});
