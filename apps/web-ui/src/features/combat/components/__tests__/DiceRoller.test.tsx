import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DiceRoller, AttackRoll, DamageRoll, SavingThrowRoll } from '../DiceRoller';

// ── mock CombatPreviewService ────────────────────────────────────────────────
const mockRollDice = vi.hoisted(() => vi.fn());

vi.mock('@features/combat', () => ({
  CombatPreviewService: { rollDice: mockRollDice },
}));

const makeResult = (total: number, rolls: number[], modifier = 0, formula = '1d20') => ({
  total,
  rolls,
  modifier,
  formula,
  timestamp: new Date(),
});

beforeEach(() => {
  vi.useFakeTimers();
  mockRollDice.mockReturnValue(makeResult(15, [15], 0));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// helper: click Roll and advance through the 500ms animation delay
async function clickAndRoll(btn: HTMLElement) {
  fireEvent.click(btn);
  await act(async () => { vi.advanceTimersByTime(600); });
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('DiceRoller — render', () => {
  it('renders default formula 1d20', () => {
    render(<DiceRoller />);
    expect(screen.getByText('1d20')).toBeInTheDocument();
  });

  it('renders custom formula and label', () => {
    render(<DiceRoller formula="2d6+3" label="Fire Bolt" />);
    expect(screen.getByText('2d6+3')).toBeInTheDocument();
    expect(screen.getByText('Fire Bolt')).toBeInTheDocument();
  });

  it('roll button is disabled when disabled prop is true', () => {
    render(<DiceRoller disabled />);
    expect(screen.getByTitle('Roll 1d20')).toBeDisabled();
  });

  it('roll button is not disabled by default', () => {
    render(<DiceRoller />);
    expect(screen.getByTitle('Roll 1d20')).not.toBeDisabled();
  });
});

describe('DiceRoller — rolling', () => {
  it('calls CombatPreviewService.rollDice with formula on click', async () => {
    render(<DiceRoller formula="1d8+2" />);
    await clickAndRoll(screen.getByTitle('Roll 1d8+2'));
    expect(mockRollDice).toHaveBeenCalledWith('1d8+2');
  });

  it('shows roll result after rolling', async () => {
    mockRollDice.mockReturnValue(makeResult(18, [18], 0));
    render(<DiceRoller />);
    await clickAndRoll(screen.getByTitle('Roll 1d20'));
    // result appears in the button badge and the roll-details breakdown
    expect(screen.getAllByText('18').length).toBeGreaterThanOrEqual(1);
  });

  it('calls onRoll callback with result', async () => {
    const onRoll = vi.fn();
    const result = makeResult(12, [12], 0);
    mockRollDice.mockReturnValue(result);
    render(<DiceRoller onRoll={onRoll} />);
    await clickAndRoll(screen.getByTitle('Roll 1d20'));
    expect(onRoll).toHaveBeenCalledWith(result);
  });

  it('adds roll to history', async () => {
    mockRollDice.mockReturnValue(makeResult(10, [10], 0));
    render(<DiceRoller showHistory />);
    await clickAndRoll(screen.getByTitle('Roll 1d20'));
    expect(screen.getByText('Recent Rolls')).toBeInTheDocument();
    // formula appears in button + history entry = at least 2 elements
    expect(screen.getAllByText('1d20').length).toBeGreaterThanOrEqual(2);
  });

  it('does not show history when showHistory is false', async () => {
    render(<DiceRoller showHistory={false} />);
    await clickAndRoll(screen.getByTitle('Roll 1d20'));
    expect(screen.queryByText('Recent Rolls')).not.toBeInTheDocument();
  });

  it('clearing history removes roll history', async () => {
    mockRollDice.mockReturnValue(makeResult(7, [7], 0));
    render(<DiceRoller showHistory />);
    await clickAndRoll(screen.getByTitle('Roll 1d20'));
    expect(screen.getByText('Recent Rolls')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Clear History'));
    expect(screen.queryByText('Recent Rolls')).not.toBeInTheDocument();
  });

  it('shows Critical Success for a roll of 20', async () => {
    mockRollDice.mockReturnValue(makeResult(20, [20], 0));
    render(<DiceRoller />);
    await clickAndRoll(screen.getByTitle('Roll 1d20'));
    // showDetails is true for 3s after roll
    expect(screen.getByText('Critical Success!')).toBeInTheDocument();
  });

  it('shows Critical Failure for a roll of 1', async () => {
    mockRollDice.mockReturnValue(makeResult(1, [1], 0));
    render(<DiceRoller />);
    await clickAndRoll(screen.getByTitle('Roll 1d20'));
    expect(screen.getByText('Critical Failure!')).toBeInTheDocument();
  });

  it('details auto-hide after 3 seconds', async () => {
    render(<DiceRoller />);
    await clickAndRoll(screen.getByTitle('Roll 1d20'));
    // roll-details breakdown is visible (contains '=')
    expect(screen.getByText('=')).toBeInTheDocument();
    // Advance past the 3s auto-hide
    await act(async () => { vi.advanceTimersByTime(3100); });
    // roll-details div is gone
    expect(screen.queryByText('=')).not.toBeInTheDocument();
  });
});

describe('DiceRoller — sub-components', () => {
  it('AttackRoll renders with attack variant formula', () => {
    render(<AttackRoll attackBonus={5} />);
    expect(screen.getByText('1d20+5')).toBeInTheDocument();
  });

  it('AttackRoll with negative bonus', () => {
    render(<AttackRoll attackBonus={-2} />);
    expect(screen.getByText('1d20-2')).toBeInTheDocument();
  });

  it('DamageRoll renders correct formula', () => {
    render(<DamageRoll dice="2d6" bonus={3} />);
    expect(screen.getByText('2d6+3')).toBeInTheDocument();
  });

  it('SavingThrowRoll renders save formula', () => {
    render(<SavingThrowRoll saveBonus={4} saveName="Wisdom" />);
    expect(screen.getByText('1d20+4')).toBeInTheDocument();
    expect(screen.getByText('Wisdom Save')).toBeInTheDocument();
  });
});
