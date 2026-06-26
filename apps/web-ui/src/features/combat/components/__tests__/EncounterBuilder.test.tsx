import { useGameStore } from '@/store';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EncounterBuilder } from '../EncounterBuilder';

const mockSend = vi.fn();

vi.mock('@/store', () => ({ useGameStore: vi.fn() }));

vi.mock('@lib/api', () => ({
  useOptionalProtocol: vi.fn(() => ({ protocol: { sendMessage: mockSend } })),
}));

vi.mock('@lib/websocket', () => ({
  createMessage: vi.fn((type, data) => ({ type, data })),
  MessageType: { ENCOUNTER_START: 'ENCOUNTER_START' },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useGameStore).mockImplementation(
    ((sel?: (s: { activeTableId: string }) => unknown) => {
      const state = { activeTableId: 'table-1' };
      return sel ? sel(state) : state;
    }) as typeof useGameStore
  );
});

describe('EncounterBuilder', () => {
  it('renders title and description fields', () => {
    render(<EncounterBuilder />);
    expect(screen.getByPlaceholderText('Encounter title...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Describe the situation...')).toBeInTheDocument();
  });

  it('renders initial choice input', () => {
    render(<EncounterBuilder />);
    expect(screen.getByPlaceholderText('Choice 1')).toBeInTheDocument();
  });

  it('Add button inserts a new choice', () => {
    render(<EncounterBuilder />);
    fireEvent.click(screen.getByText('+ Add'));
    expect(screen.getByPlaceholderText('Choice 2')).toBeInTheDocument();
  });

  it('remove button on second choice removes it', () => {
    render(<EncounterBuilder />);
    fireEvent.click(screen.getByText('+ Add'));
    const removeBtns = screen.getAllByTitle('Remove choice');
    expect(removeBtns).toHaveLength(2);
    fireEvent.click(removeBtns[1]);
    expect(screen.queryByPlaceholderText('Choice 2')).not.toBeInTheDocument();
  });

  it('Roll checkbox reveals Skill and DC fields', () => {
    render(<EncounterBuilder />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Roll/ }));
    expect(screen.getByPlaceholderText('Skill')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('DC')).toBeInTheDocument();
  });

  it('does not call sendMessage when title is empty', () => {
    render(<EncounterBuilder />);
    fireEvent.click(screen.getByText('Launch Encounter'));
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('calls sendMessage with ENCOUNTER_START when title is filled', () => {
    render(<EncounterBuilder />);
    fireEvent.change(screen.getByPlaceholderText('Encounter title...'), {
      target: { value: 'Goblin Ambush' },
    });
    fireEvent.change(screen.getByPlaceholderText('Choice 1'), {
      target: { value: 'Fight them' },
    });
    fireEvent.click(screen.getByText('Launch Encounter'));
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ENCOUNTER_START',
        data: expect.objectContaining({
          table_id: 'table-1',
          title: 'Goblin Ambush',
          choices: [expect.objectContaining({ text: 'Fight them' })],
        }),
      })
    );
  });

  it('clears fields after successful launch', () => {
    render(<EncounterBuilder />);
    const titleInput = screen.getByPlaceholderText('Encounter title...');
    fireEvent.change(titleInput, { target: { value: 'Test' } });
    fireEvent.click(screen.getByText('Launch Encounter'));
    expect((titleInput as HTMLInputElement).value).toBe('');
  });
});
