import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TabNavigation } from '../TabNavigation';

describe('TabNavigation', () => {
  it('renders all tabs', () => {
    render(<TabNavigation selectedTab="measure" onTabChange={vi.fn()} />);
    expect(screen.getByText('Measure')).toBeInTheDocument();
    expect(screen.getByText('Shapes')).toBeInTheDocument();
    expect(screen.getByText('Grids')).toBeInTheDocument();
    expect(screen.getByText('Templates')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('active tab has active class', () => {
    render(<TabNavigation selectedTab="shapes" onTabChange={vi.fn()} />);
    expect(screen.getByText('Shapes').className).toContain('active');
    expect(screen.getByText('Measure').className).not.toContain('active');
  });

  it('calls onTabChange when tab is clicked', () => {
    const onTabChange = vi.fn();
    render(<TabNavigation selectedTab="measure" onTabChange={onTabChange} />);
    fireEvent.click(screen.getByText('Grids'));
    expect(onTabChange).toHaveBeenCalledWith('grids');
  });
});
