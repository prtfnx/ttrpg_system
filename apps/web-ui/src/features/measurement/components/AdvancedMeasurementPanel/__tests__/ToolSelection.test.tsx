import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ToolSelection } from '../ToolSelection';

describe('ToolSelection', () => {
  it('renders available tools and hides unfinished template placement', () => {
    render(<ToolSelection activeTool={null} onToolSelect={vi.fn()} />);
    expect(screen.getByTitle('Measurement Tool')).toBeInTheDocument();
    expect(screen.getByTitle('Shape Tool')).toBeInTheDocument();
    expect(screen.getByTitle('Grid Tool')).toBeInTheDocument();
    expect(screen.queryByTitle('Template Tool')).not.toBeInTheDocument();
  });

  it('active tool button has active class', () => {
    render(<ToolSelection activeTool="shape" onToolSelect={vi.fn()} />);
    expect(screen.getByTitle('Shape Tool').className).toContain('active');
    expect(screen.getByTitle('Measurement Tool').className).not.toContain('active');
  });

  it('no button has active class when activeTool is null', () => {
    render(<ToolSelection activeTool={null} onToolSelect={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach(btn => expect(btn.className).not.toContain('active'));
  });

  it('calls onToolSelect when button clicked', () => {
    const onToolSelect = vi.fn();
    render(<ToolSelection activeTool={null} onToolSelect={onToolSelect} />);
    fireEvent.click(screen.getByTitle('Shape Tool'));
    expect(onToolSelect).toHaveBeenCalledWith('shape');
  });
});
