import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackgroundStep } from '../BackgroundStep';

// Mock compendium hooks — use vi.hoisted so factories can reference them
const mocks = vi.hoisted(() => ({
  useBackgrounds: vi.fn(() => ({ data: null as unknown, loading: false, error: null as string | null })),
  useClasses: vi.fn(() => ({ data: null as unknown })),
  useRaces: vi.fn(() => ({ data: null as unknown })),
  setValue: vi.fn(),
  getValues: vi.fn(() => [] as string[]),
  watchValues: {} as Record<string, string>,
}));

vi.mock('@features/compendium', () => ({
  useBackgrounds: () => mocks.useBackgrounds(),
  useClasses: () => mocks.useClasses(),
  useRacesForCharacterWizard: () => mocks.useRaces(),
}));

vi.mock('react-hook-form', () => ({
  useFormContext: () => ({
    register: () => ({}),
    formState: { errors: {} },
    watch: (key: string) => mocks.watchValues[key] ?? '',
    setValue: mocks.setValue,
    getValues: mocks.getValues,
  }),
}));

const mockBackgrounds = [
  {
    name: 'Acolyte',
    skill_proficiencies: ['Insight', 'Religion'],
    tool_proficiencies: [],
    language_proficiencies: ['Celestial'],
    features: [{ name: 'Shelter of the Faithful', description: 'You can seek help from temples.' }],
  },
  {
    name: 'Criminal',
    skill_proficiencies: ['Deception', 'Stealth'],
    tool_proficiencies: ["Thieves' tools"],
    language_proficiencies: [],
    features: [],
  },
];

const mockClass = {
  name: 'Fighter',
  skill_proficiencies: ['Acrobatics', 'Animal Handling', 'Athletics', 'History'],
  num_skills: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.watchValues = {};
  mocks.getValues.mockReturnValue([]);
  // Default: no data, not loading
  mocks.useBackgrounds.mockReturnValue({ data: null, loading: false, error: null });
  mocks.useClasses.mockReturnValue({ data: null });
  mocks.useRaces.mockReturnValue({ data: null });
});

describe('BackgroundStep', () => {
  it('shows loading state', () => {
    mocks.useBackgrounds.mockReturnValue({ data: null, loading: true, error: null });
    render(<BackgroundStep />);
    expect(screen.getByText(/Loading backgrounds/i)).toBeInTheDocument();
  });

  it('shows error state', () => {
    mocks.useBackgrounds.mockReturnValue({ data: null, loading: false, error: 'Failed to load' });
    render(<BackgroundStep />);
    expect(screen.getByText(/Error loading backgrounds/i)).toBeInTheDocument();
    expect(screen.getByText(/Failed to load/i)).toBeInTheDocument();
  });

  it('shows "no backgrounds available" when list is empty', () => {
    mocks.useBackgrounds.mockReturnValue({ data: [], loading: false, error: null });
    render(<BackgroundStep />);
    expect(screen.getByText(/No backgrounds available/i)).toBeInTheDocument();
  });

  it('renders background select with options', () => {
    mocks.useBackgrounds.mockReturnValue({ data: mockBackgrounds, loading: false, error: null });
    render(<BackgroundStep />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Acolyte' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Criminal' })).toBeInTheDocument();
  });

  it('shows background details card when background selected', () => {
    mocks.watchValues = { background: 'Acolyte', class: '', race: '' };
    mocks.useBackgrounds.mockReturnValue({ data: mockBackgrounds, loading: false, error: null });
    render(<BackgroundStep />);
    expect(screen.getByText('Acolyte Benefits')).toBeInTheDocument();
    expect(screen.getByText(/Insight, Religion/i)).toBeInTheDocument();
    expect(screen.getByText(/Celestial/i)).toBeInTheDocument();
    expect(screen.getByText(/Shelter of the Faithful/i)).toBeInTheDocument();
  });

  it('shows tool proficiencies in details card', () => {
    mocks.watchValues = { background: 'Criminal', class: '', race: '' };
    mocks.useBackgrounds.mockReturnValue({ data: mockBackgrounds, loading: false, error: null });
    render(<BackgroundStep />);
    expect(screen.getByText(/Thieves' tools/i)).toBeInTheDocument();
  });

  it('does not show details card when no background selected', () => {
    mocks.watchValues = { background: '', class: '', race: '' };
    mocks.useBackgrounds.mockReturnValue({ data: mockBackgrounds, loading: false, error: null });
    render(<BackgroundStep />);
    expect(screen.queryByText(/Benefits/i)).not.toBeInTheDocument();
  });

  it('shows class skill choices when class has skills', () => {
    mocks.watchValues = { background: '', class: 'Fighter', race: '' };
    mocks.useBackgrounds.mockReturnValue({ data: mockBackgrounds, loading: false, error: null });
    mocks.useClasses.mockReturnValue({ data: [mockClass] });
    render(<BackgroundStep />);
    expect(screen.getByText(/Class Skill Proficiencies/i)).toBeInTheDocument();
    expect(screen.getByText(/Acrobatics/i)).toBeInTheDocument();
  });

  it('allows selecting a class skill checkbox', () => {
    mocks.watchValues = { background: '', class: 'Fighter', race: '' };
    mocks.useBackgrounds.mockReturnValue({ data: mockBackgrounds, loading: false, error: null });
    mocks.useClasses.mockReturnValue({ data: [mockClass] });
    render(<BackgroundStep />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Acrobatics' }));
    expect(screen.getByText(/1 \/ 2 chosen/i)).toBeInTheDocument();
  });

  it('disables skill checkbox when at max selections', () => {
    mocks.watchValues = { background: '', class: 'Fighter', race: '' };
    mocks.useBackgrounds.mockReturnValue({ data: mockBackgrounds, loading: false, error: null });
    mocks.useClasses.mockReturnValue({ data: [mockClass] });
    render(<BackgroundStep />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Acrobatics' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Animal Handling' }));
    expect(screen.getByRole('checkbox', { name: 'Athletics' })).toBeDisabled();
  });

  it('deselects a skill when clicked again', () => {
    mocks.watchValues = { background: '', class: 'Fighter', race: '' };
    mocks.useBackgrounds.mockReturnValue({ data: mockBackgrounds, loading: false, error: null });
    mocks.useClasses.mockReturnValue({ data: [mockClass] });
    render(<BackgroundStep />);
    const acrobaticsCheckbox = screen.getByRole('checkbox', { name: 'Acrobatics' });
    fireEvent.click(acrobaticsCheckbox); // select
    fireEvent.click(acrobaticsCheckbox); // deselect
    expect(screen.getByText(/0 \/ 2 chosen/i)).toBeInTheDocument();
  });
});
