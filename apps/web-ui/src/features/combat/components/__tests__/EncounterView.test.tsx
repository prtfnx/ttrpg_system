import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEncounterStore } from '../../stores/encounterStore';
import { EncounterView } from '../EncounterView';

const mockSendMessage = vi.fn();

vi.mock('@/store', () => ({
  useGameStore: vi.fn((selector?: (s: { userId: number; sessionRole: 'owner' }) => unknown) => {
    const state = { userId: 7, sessionRole: 'owner' as const };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('@lib/api', () => ({
  useOptionalProtocol: vi.fn(() => ({ protocol: { sendMessage: mockSendMessage } })),
}));

vi.mock('@lib/websocket', () => ({
  createMessage: vi.fn((type, data) => ({ type, data })),
  MessageType: {
    ENCOUNTER_CHOICE: 'ENCOUNTER_CHOICE',
    ENCOUNTER_END: 'ENCOUNTER_END',
    ENCOUNTER_ROLL: 'ENCOUNTER_ROLL',
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  useEncounterStore.setState({ encounter: null });
});

describe('EncounterView', () => {
  it('renders nothing when encounter is null', () => {
    const { container } = render(<EncounterView />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders completed encounter with result and close button', () => {
    useEncounterStore.setState({
      encounter: {
        encounter_id: 'e1',
        title: 'Dragon Attack',
        description: 'A dragon appears!',
        phase: 'completed',
        choices: [],
        result: 'You survived!',
      },
    });
    render(<EncounterView />);
    expect(screen.getByText('Dragon Attack')).toBeInTheDocument();
    expect(screen.getByText('You survived!')).toBeInTheDocument();
    expect(screen.getByText('Close')).toBeInTheDocument();
  });

  it('closes a completed encounter locally without sending another end command', () => {
    useEncounterStore.setState({
      encounter: {
        encounter_id: 'e1',
        title: 'Finished',
        description: '',
        phase: 'completed',
        choices: [],
      },
    });
    render(<EncounterView />);
    fireEvent.click(screen.getByText('Close'));
    expect(useEncounterStore.getState().encounter).toBeNull();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('renders awaiting_roll phase with skill and DC', () => {
    useEncounterStore.setState({
      encounter: {
        encounter_id: 'e1',
        title: 'Trap',
        description: '',
        phase: 'awaiting_roll',
        choices: [],
        pending_rolls: {
          '7': { roll_skill: 'Perception', roll_dc: 15, choice_id: 'c1' },
        },
      },
    });
    render(<EncounterView />);
    expect(screen.getByText('Roll Required')).toBeInTheDocument();
    expect(screen.getByText('Perception check - DC 15')).toBeInTheDocument();
    expect(screen.getByText('Roll Perception')).toBeInTheDocument();
  });

  it('renders choices for pending phase', () => {
    useEncounterStore.setState({
      encounter: {
        encounter_id: 'e1',
        title: 'Crossroads',
        description: 'What do you do?',
        phase: 'presenting',
        choices: [
          { choice_id: 'c1', text: 'Fight' },
          { choice_id: 'c2', text: 'Flee' },
          { choice_id: 'c3', text: 'Negotiate', requires_roll: true, roll_skill: 'Persuasion', roll_dc: 12 },
        ],
      },
    });
    render(<EncounterView />);
    expect(screen.getByText('Crossroads')).toBeInTheDocument();
    expect(screen.getByText('Fight')).toBeInTheDocument();
    expect(screen.getByText('Flee')).toBeInTheDocument();
    expect(screen.getByText(/Persuasion DC 12/)).toBeInTheDocument();
  });

  it('clicking a choice sends ENCOUNTER_CHOICE', () => {
    useEncounterStore.setState({
      encounter: {
        encounter_id: 'e1',
        title: 'Battle',
        description: '',
        phase: 'presenting',
        choices: [{ choice_id: 'fight', text: 'Attack' }],
      },
    });
    render(<EncounterView />);
    fireEvent.click(screen.getByText('Attack'));
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ENCOUNTER_CHOICE',
        data: { encounter_id: 'e1', choice_id: 'fight' },
      })
    );
  });

  it('lets a GM end an active encounter', () => {
    useEncounterStore.setState({
      encounter: {
        encounter_id: 'e1',
        title: 'Battle',
        description: '',
        phase: 'presenting',
        choices: [{ choice_id: 'fight', text: 'Attack' }],
      },
    });
    render(<EncounterView />);
    fireEvent.click(screen.getByText('End Encounter'));
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ENCOUNTER_END',
        data: { encounter_id: 'e1' },
      })
    );
  });
});
