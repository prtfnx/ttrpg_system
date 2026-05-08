import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { describe, it, expect, vi } from 'vitest';
import { DiceRoller } from '../DiceRoller';

describe('DiceRoller', () => {
  it('renders roll button and dice selector', async () => {
    render(<DiceRoller />);
    await expect.element(page.getByRole('button', { name: /roll/i })).toBeInTheDocument();
    await expect.element(page.getByRole('combobox')).toBeInTheDocument();
  });

  it('shows a result after clicking Roll', async () => {
    render(<DiceRoller />);
    await page.getByRole('button', { name: /roll/i }).click();
    await expect.element(page.getByText(/result:/i)).toBeInTheDocument();
  });

  it('result is within valid range for selected die', async () => {
    render(<DiceRoller dice={6} />);
    await page.getByRole('button', { name: /roll/i }).click();
    const text = await page.getByText(/result:/i).element();
    const match = text.textContent?.match(/Result:\s*(\d+)/);
    const value = match ? parseInt(match[1]) : 0;
    expect(value).toBeGreaterThanOrEqual(1);
    expect(value).toBeLessThanOrEqual(6);
  });

  it('calls onRoll callback with result array', async () => {
    const onRoll = vi.fn();
    render(<DiceRoller dice={20} onRoll={onRoll} />);
    await page.getByRole('button', { name: /roll/i }).click();
    expect(onRoll).toHaveBeenCalledOnce();
    const [results] = onRoll.mock.calls[0];
    expect(results).toHaveLength(1);
    expect(results[0]).toBeGreaterThanOrEqual(1);
    expect(results[0]).toBeLessThanOrEqual(20);
  });

  it('switching die type changes the roll range', async () => {
    const onRoll = vi.fn();
    render(<DiceRoller onRoll={onRoll} />);

    const select = page.getByRole('combobox');
    await select.selectOptions('4');
    await page.getByRole('button', { name: /roll/i }).click();

    const [results] = onRoll.mock.calls[0];
    expect(results[0]).toBeGreaterThanOrEqual(1);
    expect(results[0]).toBeLessThanOrEqual(4);
  });
});
