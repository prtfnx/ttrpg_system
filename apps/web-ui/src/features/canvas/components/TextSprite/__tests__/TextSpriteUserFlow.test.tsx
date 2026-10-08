import { useGameStore } from '@/store';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TextSpriteTool } from '../TextSpriteTool';
import { DEFAULT_TEXT } from '../textSpriteModel';
import { MessageType, type Message } from '@lib/websocket';

const h = vi.hoisted(() => ({ handlers: new Map<string, Set<(reply: Message) => void>>(), sendMessage: vi.fn(), requestSpriteData: vi.fn() }));
vi.mock('@app/providers', () => { const context = { protocol: {
  isConnected: () => true, sendMessage: h.sendMessage, requestSpriteData: h.requestSpriteData,
  registerHandler: (type: string, handler: (reply: Message) => void) => {
    const set = h.handlers.get(type) ?? new Set(); set.add(handler); h.handlers.set(type, set);
  }, unregisterHandler: (type: string, handler: (reply: Message) => void) => h.handlers.get(type)?.delete(handler),
} }; return { useOptionalProtocol: () => context }; });
vi.mock('../textSpriteModel', async original => ({ ...await original<object>(), rasterizeTextSprite: vi.fn(async () => ({ width: 120, height: 40 })) }));

beforeEach(() => {
  h.handlers.clear(); h.sendMessage.mockReset();
  useGameStore.setState({ activeTableId: 'table-1', userId: 7, sessionRole: 'player', activeTool: 'text', selectedSprites: [], sprites: [] });
});

function reply(type: MessageType, data: Record<string, unknown> = {}) {
  const sent = h.sendMessage.mock.calls[0][0] as Message;
  act(() => h.handlers.get(type)?.forEach(handler => handler({ type, correlation_id: sent.message_id, data } as Message)));
}

describe('text sprite user flow', () => {
  it('does not save while an IME composition is being confirmed', async () => {
    render(<TextSpriteTool activeLayer="tokens" activeTool="text" />);
    act(() => window.dispatchEvent(new CustomEvent('textSpriteClick', { detail: { x: 10, y: 20 } })));
    const input = await screen.findByRole('textbox', { name: 'Text' });
    fireEvent.change(input, { target: { value: '日本語' } });
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true, isComposing: true });
    expect(h.sendMessage).not.toHaveBeenCalled();
    expect(input).toHaveValue('日本語');
  });
  it('submits world placement and Unicode metadata, and confirms creation only after acknowledgement', async () => {
    const user = userEvent.setup(); const onCreated = vi.fn();
    render(<TextSpriteTool activeLayer="tokens" activeTool="text" onSpriteCreated={onCreated} />);
    act(() => window.dispatchEvent(new CustomEvent('textSpriteClick', { detail: { x: 100, y: 200 } })));
    await user.type(await screen.findByRole('textbox', { name: 'Text' }), 'Привіт\nمرحبا');
    await user.click(screen.getByRole('button', { name: 'Save text' }));
    await waitFor(() => expect(h.sendMessage).toHaveBeenCalledOnce());
    expect(h.sendMessage.mock.calls[0][0].data.sprite_data).toMatchObject({ x: 100, y: 200, layer: 'tokens', texture_path: '__TEXT__' });
    expect(onCreated).not.toHaveBeenCalled();
    reply(MessageType.SPRITE_RESPONSE);
    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
    expect(screen.queryByRole('textbox', { name: 'Text' })).not.toBeInTheDocument();
  });
  it('edits the selected saved sprite using its current revision and retains the draft on rejection', async () => {
    useGameStore.setState({ activeTool: 'select', selectedSprites: ['saved'], sprites: [{ id: 'saved', name: 'Old', tableId: 'table-1', x: 1, y: 2,
      layer: 'tokens', controlledBy: ['7'], scale: { x: 1, y: 1 }, rotation: 0, texture: '__TEXT__',
      metadata: JSON.stringify({ text_sprite: { ...DEFAULT_TEXT, text: 'Old' }, text_revision: 3 }) }] });
    const user = userEvent.setup(); render(<TextSpriteTool activeLayer="tokens" activeTool="select" />);
    await user.click(screen.getByRole('button', { name: 'Edit selected text' }));
    const input = screen.getByRole('textbox', { name: 'Text' });
    await user.clear(input); await user.type(input, 'Edited');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Typeface' }), 'serif');
    fireEvent.change(screen.getByLabelText('Text color'), { target: { value: '#123456' } });
    fireEvent.change(screen.getByLabelText('Text size'), { target: { value: '32' } });
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'uk-UA' } });
    await user.selectOptions(screen.getByLabelText('Text direction'), 'rtl');
    await user.click(screen.getByLabelText('Bold')); await user.click(screen.getByLabelText('Italic'));
    await user.click(screen.getByRole('button', { name: 'Save text' }));
    await waitFor(() => expect(h.sendMessage).toHaveBeenCalledOnce());
    expect(h.sendMessage.mock.calls[0][0].data.expected_text_revision).toBe(3);
    expect(JSON.parse(h.sendMessage.mock.calls[0][0].data.metadata).text_sprite).toMatchObject({ text: 'Edited', color: '#123456',
      font_size: 32, language: 'uk-UA', direction: 'rtl', font_weight: 700, font_style: 'italic', font_family: 'serif' });
    reply(MessageType.ERROR, { error: 'A newer edit exists' });
    expect(await screen.findByRole('alert')).toHaveTextContent('A newer edit exists');
    expect(input).toHaveValue('Edited');
  });
  it('discards the local editor on table change without submitting to the next table', async () => {
    render(<TextSpriteTool activeLayer="tokens" activeTool="text" />);
    act(() => window.dispatchEvent(new CustomEvent('textSpriteClick', { detail: { x: 10, y: 20 } })));
    expect(await screen.findByRole('textbox', { name: 'Text' })).toBeInTheDocument();
    act(() => useGameStore.setState({ activeTableId: 'table-2' }));
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Text' })).not.toBeInTheDocument());
    expect(h.sendMessage).not.toHaveBeenCalled();
  });
});
