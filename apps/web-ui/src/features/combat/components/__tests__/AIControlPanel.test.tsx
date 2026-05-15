import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AIControlPanel } from '../AIControlPanel';

const mockSendMessage = vi.fn();

vi.mock('../../stores/combatStore', () => ({
  useCombatStore: vi.fn(),
}));

vi.mock('@lib/api', () => ({
  ProtocolService: { getProtocol: vi.fn(() => ({ sendMessage: mockSendMessage })) },
}));

vi.mock('@lib/websocket', () => ({
  createMessage: vi.fn((type: string, data: unknown) => ({ type, data })),
  MessageType: { DM_TOGGLE_AI: 'DM_TOGGLE_AI', AI_ACTION: 'AI_ACTION' },
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

  it('calls setBehavior when select changes', () => {
    mockStore({ combatants: [npc1] });
    render(<AIControlPanel />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'defensive' } });
    expect(mockSendMessage).toHaveBeenCalled();
  });

  it('calls toggleAI when checkbox changes', () => {
    mockStore({ combatants: [npc1] });
    render(<AIControlPanel />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(mockSendMessage).toHaveBeenCalled();
  });

  it('calls triggerAI on Act button click', () => {
    mockStore({ combatants: [npc1] });
    render(<AIControlPanel />);
    fireEvent.click(screen.getByTitle('Trigger AI action now'));
    expect(mockSendMessage).toHaveBeenCalled();
  });
});
