import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMockWasmRuntime, renderWithWasmRuntime } from '@test/utils/wasmRuntimeTestUtils';
import { describe, expect, it, vi } from 'vitest';

import { TextSpriteTool } from '@features/canvas';

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

    const renderEngine = {
      world_to_screen: vi.fn(() => [100, 100]),
      create_text_sprite: vi.fn(() => 'text-sprite-1'),
    };

    renderWithWasmRuntime(
      <TextSpriteTool activeLayer="tokens" activeTool="text" onSpriteCreated={onSpriteCreated} onError={onError} />,
      createMockWasmRuntime({ getRenderEngine: vi.fn(() => renderEngine as never) }),
    );

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
    const createBtn = screen.getByRole('button', { name: /confirm/i });
    await user.click(createBtn);

    // Wait for onSuccess callback to be invoked via createTextSprite -> onSuccess
    await waitFor(() => {
      expect(onSpriteCreated).toHaveBeenCalled();
    });

    expect(renderEngine.create_text_sprite).toHaveBeenCalledWith(
      'Hello Table',
      100,
      100,
      0.5,
      '#ffffff',
      'tokens',
    );

    // No error should have been reported
    expect(onError).not.toHaveBeenCalled();
  });
});
