import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../components/OAWarningModal.module.css', () => ({ default: {} }));

import { OAWarningModal } from '../components/OAWarningModal';

const triggers = [
  { combatant_id: 'c1', name: 'Goblin' },
  { combatant_id: 'c2', name: 'Orc' },
];

describe('OAWarningModal', () => {
  it('renders trigger list', () => {
    render(<OAWarningModal triggers={triggers} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Goblin')).toBeInTheDocument();
    expect(screen.getByText('Orc')).toBeInTheDocument();
  });

  it('calls onConfirm when continue clicked', async () => {
    const onConfirm = vi.fn();
    render(<OAWarningModal triggers={triggers} onConfirm={onConfirm} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByText(/continue anyway/i));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onCancel when stay put clicked', async () => {
    const onCancel = vi.fn();
    render(<OAWarningModal triggers={triggers} onConfirm={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByText(/stay put/i));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('shows Opportunity Attack heading', () => {
    render(<OAWarningModal triggers={triggers} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/opportunity attack/i)).toBeInTheDocument();
  });
});
