import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TextSpriteEditor } from '../TextSpriteEditor';

const mockRustManager = {
  world_to_screen: vi.fn(() => [100, 200]),
};

const defaultProps = {
  position: { x: 10, y: 20 },
  onComplete: vi.fn(),
  onCancel: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  // Set up canvas element for coordinate conversion
  const canvas = document.createElement('canvas');
  canvas.className = 'game-canvas';
  document.body.appendChild(canvas);
  // Mock getBoundingClientRect
  canvas.getBoundingClientRect = vi.fn(() => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}) }));
  // Install rustRenderManager
  (window as unknown as Record<string, unknown>)['rustRenderManager'] = mockRustManager;
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>)['rustRenderManager'];
  document.querySelector('.game-canvas')?.remove();
});

describe('TextSpriteEditor', () => {
  it('returns null when position is null', () => {
    const { container } = render(<TextSpriteEditor {...defaultProps} position={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when rustRenderManager is not available', () => {
    delete (window as unknown as Record<string, unknown>)['rustRenderManager'];
    const { container } = render(<TextSpriteEditor {...defaultProps} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders text input and toolbar when position and manager available', () => {
    render(<TextSpriteEditor {...defaultProps} />);
    expect(screen.getByPlaceholderText(/Type text/i)).toBeInTheDocument();
  });

  it('finish button is disabled when text is empty', () => {
    render(<TextSpriteEditor {...defaultProps} />);
    const finishBtn = screen.getByTitle(/Finish/i);
    expect(finishBtn).toBeDisabled();
  });

  it('finish button enabled after typing text', () => {
    render(<TextSpriteEditor {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText(/Type text/i), { target: { value: 'Hello' } });
    expect(screen.getByTitle(/Finish/i)).not.toBeDisabled();
  });

  it('calls onComplete with config when finish clicked', () => {
    render(<TextSpriteEditor {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText(/Type text/i), { target: { value: 'Hello World' } });
    fireEvent.click(screen.getByTitle(/Finish/i));
    expect(defaultProps.onComplete).toHaveBeenCalledWith({
      text: 'Hello World',
      fontSize: 24,
      color: '#ffffff',
      bold: false,
    });
  });

  it('calls onCancel when cancel button clicked', () => {
    render(<TextSpriteEditor {...defaultProps} />);
    fireEvent.click(screen.getByTitle(/Cancel/i));
    expect(defaultProps.onCancel).toHaveBeenCalled();
  });

  it('changes font size via select', () => {
    render(<TextSpriteEditor {...defaultProps} />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '32' } });
    // After size change, calling finish reflects new size
    fireEvent.change(screen.getByPlaceholderText(/Type text/i), { target: { value: 'Test' } });
    fireEvent.click(screen.getByTitle(/Finish/i));
    expect(defaultProps.onComplete).toHaveBeenCalledWith(expect.objectContaining({ fontSize: 32 }));
  });

  it('toggles bold state via bold button', () => {
    render(<TextSpriteEditor {...defaultProps} />);
    fireEvent.click(screen.getByTitle(/Bold/i));
    fireEvent.change(screen.getByPlaceholderText(/Type text/i), { target: { value: 'Bold Text' } });
    fireEvent.click(screen.getByTitle(/Finish/i));
    expect(defaultProps.onComplete).toHaveBeenCalledWith(expect.objectContaining({ bold: true }));
  });

  it('cancels via Escape key', () => {
    render(<TextSpriteEditor {...defaultProps} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(defaultProps.onCancel).toHaveBeenCalled();
  });

  it('finishes via Ctrl+Enter key', () => {
    render(<TextSpriteEditor {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText(/Type text/i), { target: { value: 'Keyboard finish' } });
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    expect(defaultProps.onComplete).toHaveBeenCalledWith(expect.objectContaining({ text: 'Keyboard finish' }));
  });

  it('does not call onComplete for empty text on Ctrl+Enter', () => {
    render(<TextSpriteEditor {...defaultProps} />);
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    expect(defaultProps.onComplete).not.toHaveBeenCalled();
  });

  it('trims whitespace from text on finish', () => {
    render(<TextSpriteEditor {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText(/Type text/i), { target: { value: '  trimmed  ' } });
    fireEvent.click(screen.getByTitle(/Finish/i));
    expect(defaultProps.onComplete).toHaveBeenCalledWith(expect.objectContaining({ text: 'trimmed' }));
  });
});
