import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { HelpWindow } from '../HelpWindow';

vi.mock('@shared/components/FloatingWindow', () => ({ FloatingWindow: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
describe('canvas tool help', () => {
  it('uses current object/text names and distinguishes combined selection and paint rotation', () => {
    render(<HelpWindow onClose={vi.fn()} zIndex={1} />);
    expect(screen.getByText('Table objects')).toBeInTheDocument();
    expect(screen.getByText('Text sprite')).toBeInTheDocument();
    expect(screen.queryByText('Draw Shapes')).not.toBeInTheDocument();
    expect(screen.getByText('Snap paint rotation in 15° increments')).toBeInTheDocument();
    expect(screen.getByText(/combined-selection preference in Paint/)).toBeInTheDocument();
  });
});
