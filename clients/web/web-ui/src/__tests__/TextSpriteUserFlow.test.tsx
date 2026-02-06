import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TextSpriteTool } from '../features/canvas/components/TextSprite/TextSpriteTool';

describe('Text sprite creation user flow', () => {
  it('creates a text sprite and registers it with the renderer and network', async () => {
    const user = userEvent.setup();

    const onSpriteCreated = vi.fn();
    const onError = vi.fn();

    // Create a mock canvas element for the text editor
    const mockCanvas = document.createElement('canvas');
    mockCanvas.className = 'game-canvas';
    mockCanvas.width = 800;
    mockCanvas.height = 600;
    document.body.appendChild(mockCanvas);

    // Ensure global APIs are present (provided by test setup)
    // window.rustRenderManager and window.gameAPI are mocked in setup.ts

    render(<TextSpriteTool activeLayer="tokens" activeTool="text" onSpriteCreated={onSpriteCreated} onError={onError} />);

    // Simulate a map click event to trigger the text editor
    const clickEvent = new CustomEvent('textSpriteClick', {
      detail: { x: 100, y: 100 }
    });
    window.dispatchEvent(clickEvent);

    // Wait for the inline text editor to appear
    const input = await screen.findByPlaceholderText(/type text/i, {}, { timeout: 2000 });
    await user.clear(input);
    await user.type(input, 'Hello Table');

    // Click create button (checkmark button)
    const createBtn = screen.getByRole('button', { name: '✓' });
    await user.click(createBtn);

    // Wait for onSuccess callback to be invoked via createTextSprite -> onSuccess
    await waitFor(() => {
      expect(onSpriteCreated).toHaveBeenCalled();
    });

    // Ensure rustRenderManager was used to create text sprite
    expect((window as any).rustRenderManager.create_text_sprite).toHaveBeenCalled();

    // If gameAPI exists it should have been called to send network payload
    if ((window as any).gameAPI && (window as any).gameAPI.sendMessage) {
      expect((window as any).gameAPI.sendMessage).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ type: 'text' }));
    }

    // No error should have been reported
    expect(onError).not.toHaveBeenCalled();
  });
});
