import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TextSpriteModal } from '../TextSpriteModal';

const position = { x: 100, y: 200 };

describe('TextSpriteModal', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <TextSpriteModal isOpen={false} position={position} onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when position is null', () => {
    const { container } = render(
      <TextSpriteModal isOpen={true} position={null} onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal when open with position', () => {
    render(<TextSpriteModal isOpen={true} position={position} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getAllByText('Create Text Sprite').length).toBeGreaterThan(0);
  });

  it('shows default text "Sample Text"', () => {
    render(<TextSpriteModal isOpen={true} position={position} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const textarea = screen.getByPlaceholderText('Enter your text...') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Sample Text');
  });

  it('calls onCancel when close button clicked', () => {
    const onCancel = vi.fn();
    render(<TextSpriteModal isOpen={true} position={position} onConfirm={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByTitle('Close (Esc)'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onConfirm with trimmed text when confirmed', () => {
    const onConfirm = vi.fn();
    render(<TextSpriteModal isOpen={true} position={position} onConfirm={onConfirm} onCancel={vi.fn()} />);
    const textarea = screen.getByPlaceholderText('Enter your text...');
    fireEvent.change(textarea, { target: { value: '  Hello World  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Text Sprite' }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Hello World' })
    );
  });

  it('does not call onConfirm when text is empty', () => {
    const onConfirm = vi.fn();
    render(<TextSpriteModal isOpen={true} position={position} onConfirm={onConfirm} onCancel={vi.fn()} />);
    const textarea = screen.getByPlaceholderText('Enter your text...');
    fireEvent.change(textarea, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Text Sprite' }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onCancel when overlay is clicked', () => {
    const onCancel = vi.fn();
    render(<TextSpriteModal isOpen={true} position={position} onConfirm={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(document.querySelector('.text-sprite-modal-overlay')!);
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onCancel when Escape key pressed', () => {
    const onCancel = vi.fn();
    render(<TextSpriteModal isOpen={true} position={position} onConfirm={vi.fn()} onCancel={onCancel} />);
    fireEvent.keyDown(document.querySelector('[class*="textSpriteModal"]')!, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onConfirm on Enter key', () => {
    const onConfirm = vi.fn();
    render(<TextSpriteModal isOpen={true} position={position} onConfirm={onConfirm} onCancel={vi.fn()} />);
    const modal = document.querySelector('[class*="textSpriteModal"]')!;
    fireEvent.keyDown(modal, { key: 'Enter', shiftKey: false });
    expect(onConfirm).toHaveBeenCalled();
  });

  it('includes fontSize and color in onConfirm payload', () => {
    const onConfirm = vi.fn();
    render(<TextSpriteModal isOpen={true} position={position} onConfirm={onConfirm} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Text Sprite' }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ fontSize: expect.any(Number), color: expect.any(String) })
    );
  });
});
