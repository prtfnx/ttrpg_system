import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ToolSelection } from '../ToolSelection';

describe('ToolSelection', () => {
  it('renders all tool buttons', () => {
    render(<ToolSelection activeTool={null} onToolSelect={vi.fn()} />);
    expect(screen.getByTitle('Measurement Tool')).toBeInTheDocument();
    expect(screen.getByTitle('Shape Tool')).toBeInTheDocument();
    expect(screen.getByTitle('Template Tool')).toBeInTheDocument();
    expect(screen.getByTitle('Grid Tool')).toBeInTheDocument();
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
    fireEvent.click(screen.getByTitle('Template Tool'));
    expect(onToolSelect).toHaveBeenCalledWith('template');
  });
});
