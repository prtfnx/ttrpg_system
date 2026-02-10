import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CollapsedView } from '@features/session';

describe('CollapsedView', () => {
  const user = userEvent.setup();
  const mockOnToggle = vi.fn();
  const testSessionCode = 'TEST123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders manage players button', () => {
      render(<CollapsedView sessionCode={testSessionCode} onToggle={mockOnToggle} />);

      const button = screen.getByRole('button', { name: '👥 Manage Players' });
      expect(button).toBeInTheDocument();
    });

    it('renders admin panel link with correct href', () => {
      render(<CollapsedView sessionCode={testSessionCode} onToggle={mockOnToggle} />);

      const adminLink = screen.getByRole('link', { name: '⚙️ Admin Panel' });
      expect(adminLink).toBeInTheDocument();
      expect(adminLink).toHaveAttribute('href', `/game/session/${testSessionCode}/admin`);
    });

    it('admin panel link opens in new tab', () => {
      render(<CollapsedView sessionCode={testSessionCode} onToggle={mockOnToggle} />);

      const adminLink = screen.getByRole('link', { name: '⚙️ Admin Panel' });
      expect(adminLink).toHaveAttribute('target', '_blank');
      expect(adminLink).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('uses session code correctly in admin link', () => {
      const customSessionCode = 'CUSTOM456';
      render(<CollapsedView sessionCode={customSessionCode} onToggle={mockOnToggle} />);

      const adminLink = screen.getByRole('link', { name: '⚙️ Admin Panel' });
      expect(adminLink).toHaveAttribute('href', `/game/session/${customSessionCode}/admin`);
    });

    it('handles empty session code gracefully', () => {
      render(<CollapsedView sessionCode="" onToggle={mockOnToggle} />);

      const adminLink = screen.getByRole('link', { name: '⚙️ Admin Panel' });
      expect(adminLink).toHaveAttribute('href', '/game/session//admin');
    });

    it('handles special characters in session code', () => {
      const specialSessionCode = 'TEST-123_ABC';
      render(<CollapsedView sessionCode={specialSessionCode} onToggle={mockOnToggle} />);

      const adminLink = screen.getByRole('link', { name: '⚙️ Admin Panel' });
      expect(adminLink).toHaveAttribute('href', `/game/session/${specialSessionCode}/admin`);
    });
  });

  describe('User Interactions', () => {
    it('calls onToggle when manage players button is clicked', async () => {
      render(<CollapsedView sessionCode={testSessionCode} onToggle={mockOnToggle} />);

      const button = screen.getByRole('button', { name: '👥 Manage Players' });
      await user.click(button);

      expect(mockOnToggle).toHaveBeenCalledTimes(1);
    });

    it('calls onToggle only once per click', async () => {
      render(<CollapsedView sessionCode={testSessionCode} onToggle={mockOnToggle} />);

      const button = screen.getByRole('button', { name: '👥 Manage Players' });
      await user.click(button);
      await user.click(button);
      await user.click(button);

      expect(mockOnToggle).toHaveBeenCalledTimes(3);
    });

    it('does not prevent default admin panel link behavior', async () => {
      render(<CollapsedView sessionCode={testSessionCode} onToggle={mockOnToggle} />);

      const adminLink = screen.getByRole('link', { name: '⚙️ Admin Panel' });
      
      // Click on admin link - should not call onToggle
      await user.click(adminLink);
      expect(mockOnToggle).not.toHaveBeenCalled();
    });
  });

  describe('Keyboard Accessibility', () => {
    it('button is accessible via keyboard', async () => {
      render(<CollapsedView sessionCode={testSessionCode} onToggle={mockOnToggle} />);

      const button = screen.getByRole('button', { name: '👥 Manage Players' });
      
      // Focus and activate with Enter
      button.focus();
      await user.keyboard('{Enter}');

      expect(mockOnToggle).toHaveBeenCalledTimes(1);
    });

    it('button is accessible via Space key', async () => {
      render(<CollapsedView sessionCode={testSessionCode} onToggle={mockOnToggle} />);

      const button = screen.getByRole('button', { name: '👥 Manage Players' });
      
      // Focus and activate with Space
      button.focus();
      await user.keyboard(' ');

      expect(mockOnToggle).toHaveBeenCalledTimes(1);
    });

    it('admin link is accessible via keyboard', () => {
      render(<CollapsedView sessionCode={testSessionCode} onToggle={mockOnToggle} />);

      const adminLink = screen.getByRole('link', { name: '⚙️ Admin Panel' });
      
      // Should be focusable
      adminLink.focus();
      expect(document.activeElement).toBe(adminLink);
    });

    it('supports tab navigation between elements', () => {
      render(<CollapsedView sessionCode={testSessionCode} onToggle={mockOnToggle} />);

      const button = screen.getByRole('button', { name: '👥 Manage Players' });
      const adminLink = screen.getByRole('link', { name: '⚙️ Admin Panel' });

      // Both elements should be in tab order
      expect(button).not.toHaveAttribute('tabindex', '-1');
      expect(adminLink).not.toHaveAttribute('tabindex', '-1');
    });
  });

  describe('Visual Elements', () => {
    it('displays correct emojis/icons', () => {
      render(<CollapsedView sessionCode={testSessionCode} onToggle={mockOnToggle} />);

      expect(screen.getByText('👥 Manage Players')).toBeInTheDocument();
      expect(screen.getByText('⚙️ Admin Panel')).toBeInTheDocument();
    });

    it('applies correct CSS classes', () => {
      const { container } = render(
        <CollapsedView sessionCode={testSessionCode} onToggle={mockOnToggle} />
      );

      const collapsedDiv = container.firstChild as HTMLElement;
    expect(collapsedDiv).toHaveClass('_collapsed_5b9edc');
      const button = screen.getByRole('button', { name: '👥 Manage Players' });
      expect(button).toHaveClass('_toggle_5b9edc');

      const adminLink = screen.getByRole('link', { name: '⚙️ Admin Panel' });
      expect(adminLink).toHaveClass('_adminLink_5b9edc');
    });
  });

  describe('Props Handling', () => {
    it('handles onToggle prop changes', async () => {
      const user = userEvent.setup();
      const firstToggle = vi.fn();
      const secondToggle = vi.fn();

      const { rerender } = render(
        <CollapsedView sessionCode={testSessionCode} onToggle={firstToggle} />
      );

      // Should work with first handler
      const button = screen.getByRole('button', { name: '👥 Manage Players' });
      user.click(button);

      // Update prop
      rerender(<CollapsedView sessionCode={testSessionCode} onToggle={secondToggle} />);

      // Should work with new handler
      await user.click(button);
      expect(secondToggle).toHaveBeenCalled();
    });

    it('updates admin link when sessionCode changes', () => {
      const { rerender } = render(
        <CollapsedView sessionCode="INITIAL" onToggle={mockOnToggle} />
      );

      let adminLink = screen.getByRole('link', { name: '⚙️ Admin Panel' });
      expect(adminLink).toHaveAttribute('href', '/game/session/INITIAL/admin');

      // Change session code
      rerender(<CollapsedView sessionCode="UPDATED" onToggle={mockOnToggle} />);

      adminLink = screen.getByRole('link', { name: '⚙️ Admin Panel' });
      expect(adminLink).toHaveAttribute('href', '/game/session/UPDATED/admin');
    });
  });

  describe('Security', () => {
    it('uses proper rel attributes for external link security', () => {
      render(<CollapsedView sessionCode={testSessionCode} onToggle={mockOnToggle} />);

      const adminLink = screen.getByRole('link', { name: '⚙️ Admin Panel' });
      const relValue = adminLink.getAttribute('rel');
      
      expect(relValue).toContain('noopener');
      expect(relValue).toContain('noreferrer');
    });

    it('does not inject script through session code', () => {
      const maliciousCode = '<script>alert("xss")</script>';
      render(<CollapsedView sessionCode={maliciousCode} onToggle={mockOnToggle} />);

      // The href should contain the raw string, not execute as script
      const adminLink = screen.getByRole('link', { name: '⚙️ Admin Panel' });
      expect(adminLink.getAttribute('href')).toBe(`/game/session/${maliciousCode}/admin`);
      
      // Should not create any script elements
      expect(document.querySelectorAll('script')).toHaveLength(0);
    });
  });

  describe('Error Boundaries', () => {
    it('handles undefined props gracefully', () => {
      // TypeScript would prevent this, but good to test runtime behavior
      expect(() => {
        render(<CollapsedView sessionCode={undefined as any} onToggle={mockOnToggle} />);
      }).not.toThrow();
    });

    it('handles null onToggle gracefully', () => {
      expect(() => {
        render(<CollapsedView sessionCode={testSessionCode} onToggle={null as any} />);
      }).not.toThrow();
    });
  });
});
