import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '@/store';
import { useGameModeStore } from '../../stores/gameModeStore';
import { useOAStore } from '../../stores/oaStore';
import { usePlanningStore } from '../../stores/planningStore';
import { useCombatStore } from '../../stores/combatStore';
import { CommitButton } from '../CommitButton';

vi.mock('@lib/api', () => ({
  useOptionalProtocol: vi.fn(() => ({ protocol: { sendMessage: vi.fn() } })),
}));
vi.mock('@lib/websocket', () => ({
  createMessage: vi.fn((type: string, payload: unknown) => ({ type, payload })),
  MessageType: { COMBAT_COMMAND: 'COMBAT_COMMAND' },
}));
vi.mock('../../services/planning.service', () => ({
  planningService: { clearAll: vi.fn() },
}));

const realStopPlanning = usePlanningStore.getState().stopPlanning;
const makeAction = (id: string) => ({
  id,
  action_type: 'move' as const,
  label: 'Move',
  sequence_index: 0,
});

beforeEach(() => {
  useCombatStore.setState({ combat: null });
  usePlanningStore.setState({ stopPlanning: realStopPlanning });
  usePlanningStore.setState({ pendingSubmission: null, submissionOutcome: null });
  useGameStore.setState({
    activeTableId: 'table-1',
    sprites: [{ id: 'sprite-1', tableId: 'table-1', x: 10, y: 20, name: 'Hero', layer: 'tokens', texture: '', scale: { x: 1, y: 1 }, rotation: 0 }],
  } as never);
  usePlanningStore.setState({ queue: [], isPlanningMode: false, selectedSpriteId: 'sprite-1', sequenceId: 0, nextSequenceId: () => 1 } as never);
  useOAStore.setState({ pendingCombatCommand: null } as never);
  useGameModeStore.setState({ mode: 'combat' } as never);
});

describe('CommitButton', () => {
  it('renders nothing when queue is empty', () => {
    usePlanningStore.setState({ queue: [], isPlanningMode: true } as never);
    const { container } = render(<CommitButton />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when not in planning mode and not free_roam', () => {
    const { container } = render(<CommitButton />);
    expect(container.firstChild).toBeNull();
  });

  it('renders commit button in planning mode with queue', () => {
    usePlanningStore.setState({ queue: [makeAction('a1')], isPlanningMode: true } as never);
    render(<CommitButton />);
    expect(screen.getByRole('button', { name: /Commit Turn/i })).toBeTruthy();
  });

  it('shows action count in button label', () => {
    usePlanningStore.setState({ queue: [makeAction('a1'), makeAction('a2')], isPlanningMode: true } as never);
    render(<CommitButton />);
    expect(screen.getByText(/2 actions/)).toBeTruthy();
  });

  it('shows singular "action" for 1 item', () => {
    usePlanningStore.setState({ queue: [makeAction('a1')], isPlanningMode: true } as never);
    render(<CommitButton />);
    expect(screen.getByText(/1 action\b/)).toBeTruthy();
  });

  it('renders in free_roam mode with queue', () => {
    useGameModeStore.setState({ mode: 'free_roam' } as never);
    usePlanningStore.setState({ queue: [makeAction('a1')], isPlanningMode: false } as never);
    render(<CommitButton />);
    expect(screen.getByRole('button', { name: /Commit Turn/i })).toBeTruthy();
  });

  it('cancel button calls stopPlanning', async () => {
    const stopPlanning = vi.fn();
    usePlanningStore.setState({ queue: [makeAction('a1')], isPlanningMode: true, stopPlanning } as never);
    render(<CommitButton />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(stopPlanning).toHaveBeenCalled();
  });

  it('stores pending combat command for server opportunity confirmation', async () => {
    usePlanningStore.setState({
      queue: [{ ...makeAction('a1'), target_x: 80, target_y: 90, cost_ft: 10 }],
      isPlanningMode: true,
    } as never);

    render(<CommitButton />);
    await userEvent.click(screen.getByRole('button', { name: /Commit Turn/i }));

    expect(useOAStore.getState().pendingCombatCommand).toMatchObject({
      sequence_id: 1,
      commands: [expect.objectContaining({
        type: 'move',
        actor_id: 'sprite-1',
        table_id: 'table-1',
        target_x: 80,
        target_y: 90,
        cost_ft: 10,
      })],
    });
  });
});


describe('reaction-aware plan submission', () => {
  it('submits a planned attack on the encounter table while another table is visible', async () => {
    useCombatStore.setState({ combat: { combat_id: 'encounter', table_id: 'battle-table', state_version: 7 } as never });
    useGameStore.setState({ activeTableId: 'other-table' });
    usePlanningStore.setState({
      queue: [{ id: 'attack', action_type: 'attack', label: 'Sword', target_id: 'enemy', action_id: 'sword', sequence_index: 0 }],
      isPlanningMode: true,
    });
    render(<CommitButton />);
    await userEvent.click(screen.getByRole('button', { name: /Commit Turn/i }));
    expect(usePlanningStore.getState().pendingSubmission?.payload).toMatchObject({
      combat_id: 'encounter', expected_state_version: 7,
      commands: [{ table_id: 'battle-table', type: 'attack', target_id: 'enemy', action_id: 'sword' }],
    });
  });

  it('submits one move, waits through reactions, then resumes only the remaining actions', async () => {
    usePlanningStore.setState({ queue: [
      { ...makeAction('move'), target_x: 80, target_y: 90, cost_ft: 10 },
      { id: 'dodge', action_type: 'dodge', label: 'Dodge', sequence_index: 1 },
    ], isPlanningMode: true });
    render(<CommitButton />);
    await userEvent.click(screen.getByRole('button', { name: /Commit Turn/i }));
    expect(usePlanningStore.getState().pendingSubmission?.actionIds).toEqual(['move']);
    act(() => {
      useCombatStore.setState({ combat: { pending_movement: { movement_id: 'pending', expires_at: 2000000000 } } as never });
      usePlanningStore.getState().finishSubmission(1, true);
    });
    expect(screen.getByRole('button', { name: /Waiting for reactions/ })).toBeDisabled();
    expect(usePlanningStore.getState().queue.map((action) => action.id)).toEqual(['dodge']);
    expect(usePlanningStore.getState().pendingSubmission).toBeNull();
    act(() => useCombatStore.setState({ combat: null }));
    await waitFor(() => expect(usePlanningStore.getState().pendingSubmission?.actionIds).toEqual(['dodge']));
  });

  it('stops on rejection and preserves the unsent steps', async () => {
    usePlanningStore.setState({ queue: [{ id:'dodge',action_type:'dodge',label:'Dodge',sequence_index:0 }], isPlanningMode:true });
    render(<CommitButton />);
    await userEvent.click(screen.getByRole('button', {name:/Commit Turn/i}));
    act(() => usePlanningStore.getState().finishSubmission(1,false));
    expect(await screen.findByText(/server rejected this step/i)).toBeInTheDocument();
    expect(usePlanningStore.getState().queue).toHaveLength(1);
    expect(usePlanningStore.getState().pendingSubmission).toBeNull();
  });
});


it('leaves actions added after commit unsent', async () => {
  usePlanningStore.setState({queue:[{id:'initial',action_type:'dodge',label:'Dodge',sequence_index:0}],isPlanningMode:true});
  render(<CommitButton />);
  await userEvent.click(screen.getByRole('button',{name:/Commit Turn/i}));
  act(() => {
    usePlanningStore.getState().addAction({id:'later',action_type:'hide',label:'Hide'});
    usePlanningStore.getState().finishSubmission(1,true);
  });
  await waitFor(() => expect(screen.getByRole('button',{name:/Commit Turn/i})).toBeEnabled());
  expect(usePlanningStore.getState().pendingSubmission).toBeNull();
  expect(usePlanningStore.getState().queue.map((action)=>action.id)).toEqual(['later']);
});


it('retains acknowledgement ownership when planning is closed during a sent step', () => {
  usePlanningStore.setState({queue:[{id:'sent',action_type:'dodge',label:'Dodge',sequence_index:0}],isPlanningMode:true});
  usePlanningStore.getState().markSubmitted(99,['sent']);
  usePlanningStore.getState().stopPlanning();
  expect(usePlanningStore.getState().pendingSubmission?.sequenceId).toBe(99);
  usePlanningStore.getState().finishSubmission(99,true);
  expect(usePlanningStore.getState().queue).toEqual([]);
});
