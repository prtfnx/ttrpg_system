import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TextSpriteTool } from '../components/TextSprite/TextSpriteTool';

describe('Text sprite creation user flow', () => {
  it('creates a text sprite and registers it with the renderer and network', async () => {
    const user = userEvent.setup();

    const onSpriteCreated = vi.fn();
    const onError = vi.fn();

    // Ensure global APIs are present (provided by test setup)
    // window.rustRenderManager and window.gameAPI are mocked in setup.ts

    render(<TextSpriteTool activeLayer="tokens" onSpriteCreated={onSpriteCreated} onError={onError} />);

  // Try a few common labels for the add button
  const addButton = screen.getByRole('button', { name: /add text|create text sprite|📝 add text/i });
    await user.click(addButton);

  // Creator modal should open and show text area
  const textarea = await screen.findByPlaceholderText(/enter your text|sample text/i);
    await user.clear(textarea);
    await user.type(textarea, 'Hello Table');

    // Click create button in modal
    const createBtn = screen.getByRole('button', { name: /create text sprite/i });
    await user.click(createBtn);

    // Wait for onSuccess callback to be invoked via createTextSprite -> onSuccess
    await waitFor(() => {
      expect(onSpriteCreated).toHaveBeenCalled();
    });

    // Ensure rustRenderManager was used to add sprite to layer
    expect((window as any).rustRenderManager.add_sprite_to_layer).toHaveBeenCalled();

    // If gameAPI exists it should have been called to send network payload
    if ((window as any).gameAPI && (window as any).gameAPI.sendMessage) {
      expect((window as any).gameAPI.sendMessage).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ type: 'text' }));
    }

    // No error should have been reported
    expect(onError).not.toHaveBeenCalled();
  });
});
