import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../components/OAPrompt.module.css', () => ({ default: {} }));

import { OAPrompt } from '../components/OAPrompt';

describe('OAPrompt', () => {
  it('shows target name in prompt', () => {
    render(<OAPrompt targetName="Goblin" onUseReaction={vi.fn()} onPass={vi.fn()} />);
    expect(screen.getByText(/Goblin/)).toBeInTheDocument();
  });

  it('calls onUseReaction when use reaction clicked', async () => {
    const onUseReaction = vi.fn();
    render(<OAPrompt targetName="Goblin" onUseReaction={onUseReaction} onPass={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /use reaction/i }));
    expect(onUseReaction).toHaveBeenCalledOnce();
  });

  it('calls onPass when pass clicked', async () => {
    const onPass = vi.fn();
    render(<OAPrompt targetName="Goblin" onUseReaction={vi.fn()} onPass={onPass} />);
    await userEvent.click(screen.getByText(/^pass$/i));
    expect(onPass).toHaveBeenCalledOnce();
  });
});
