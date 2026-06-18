import type { TextSpriteConfig } from '../TextSpriteCreator';
import { ProtocolService } from '@lib/api';
import { setCurrentWasmRuntime } from '@lib/wasm/runtime';
import { createMockWasmRuntime } from '@test/utils/wasmRuntimeTestUtils';
import {
    createTextSprite,
    deleteTextSprite,
    renderTextSprite,
    updateTextSprite,
} from '../textSpriteUtils';

// Canvas 2D context mock — jsdom doesn't support real canvas
const makeCtxMock = () => ({
  font: '',
  fillStyle: '',
  strokeStyle: '',
  globalAlpha: 1,
  shadowColor: '',
  shadowBlur: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
  lineWidth: 0,
  textBaseline: '',
  scale: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  fillText: vi.fn(),
  measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
});

const mockGetContext = vi.fn(function (type: string) {
  if (type === '2d') return makeCtxMock();
  return null;
});

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = mockGetContext as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,testdata');
});

// Fake Image that fires onload immediately
class FakeImage {
  onload?: () => void;
  onerror?: () => void;
  set src(_: string) { setTimeout(() => this.onload?.(), 0); }
}

const mockRustRenderer = {
  load_texture: vi.fn(),
  add_sprite_to_layer: vi.fn(),
  remove_sprite: vi.fn(),
};
const mockProtocol = {
  createSprite: vi.fn(),
  updateSprite: vi.fn(),
  removeSprite: vi.fn(),
};

beforeEach(() => {
  vi.stubGlobal('Image', FakeImage);
  setCurrentWasmRuntime(createMockWasmRuntime({
    getRenderEngine: vi.fn(() => mockRustRenderer as never),
  }));
  ProtocolService.setProtocol(mockProtocol as never);
  vi.clearAllMocks();
});

afterEach(() => {
  setCurrentWasmRuntime(null);
  ProtocolService.clearProtocol();
  vi.unstubAllGlobals();
});

const makeConfig = (overrides: Partial<TextSpriteConfig> = {}): TextSpriteConfig => ({
  text: 'Hello',
  fontSize: 16,
  fontFamily: 'Arial',
  fontWeight: 'normal',
  color: '#ffffff',
  backgroundColor: '#000000',
  hasBackground: false,
  textAlign: 'left',
  opacity: 1,
  rotation: 0,
  borderWidth: 2,
  borderColor: '#ff0000',
  hasBorder: false,
  padding: 8,
  lineHeight: 1.2,
  letterSpacing: 0,
  textShadow: false,
  shadowColor: '#000000',
  shadowBlur: 4,
  shadowOffsetX: 2,
  shadowOffsetY: 2,
  ...overrides,
});

describe('renderTextSprite', () => {
  it('returns canvas, textureId, width, height', async () => {
    const result = await renderTextSprite(makeConfig(), 'sprite1');
    expect(result.canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(typeof result.textureId).toBe('string');
    expect(typeof result.width).toBe('number');
    expect(typeof result.height).toBe('number');
  });

  it('textureId contains the spriteId', async () => {
    const result = await renderTextSprite(makeConfig(), 'my_sprite');
    expect(result.textureId).toContain('my_sprite');
  });

  it('width >= 50 (minimum)', async () => {
    const result = await renderTextSprite(makeConfig({ text: 'Hi' }), 'sid');
    expect(result.width).toBeGreaterThanOrEqual(50);
  });

  it('height >= 30 (minimum)', async () => {
    const result = await renderTextSprite(makeConfig({ text: 'X' }), 'sid');
    expect(result.height).toBeGreaterThanOrEqual(30);
  });

  it('with background: fillRect is called', async () => {
    const ctxMock = makeCtxMock();
    mockGetContext.mockImplementationOnce(() => ctxMock);
    await renderTextSprite(makeConfig({ hasBackground: true }), 'sid');
    expect(ctxMock.fillRect).toHaveBeenCalled();
  });

  it('with border: strokeRect is called', async () => {
    const ctxMock = makeCtxMock();
    mockGetContext.mockImplementationOnce(() => ctxMock);
    await renderTextSprite(makeConfig({ hasBorder: true }), 'sid');
    expect(ctxMock.strokeRect).toHaveBeenCalled();
  });

  it('multi-line text: fillText called for each line', async () => {
    const ctxMock = makeCtxMock();
    mockGetContext.mockImplementationOnce(() => ctxMock);
    await renderTextSprite(makeConfig({ text: 'Line1\nLine2\nLine3' }), 'sid');
    expect(ctxMock.fillText).toHaveBeenCalledTimes(3);
  });

  it('rejects when getContext returns null', async () => {
    mockGetContext.mockImplementationOnce(() => null);
    await expect(renderTextSprite(makeConfig(), 'sid')).rejects.toThrow(/2D rendering context/);
  });

  it('no shadow: shadowColor set to transparent', async () => {
    const ctxMock = makeCtxMock();
    mockGetContext.mockImplementationOnce(() => ctxMock);
    await renderTextSprite(makeConfig({ textShadow: false }), 'sid');
    expect(ctxMock.shadowColor).toBe('transparent');
  });
});

describe('createTextSprite', () => {
  it('returns a sprite ID string', async () => {
    const id = await createTextSprite(makeConfig(), { x: 0, y: 0 }, 'tokens');
    expect(typeof id).toBe('string');
    expect(id).toMatch(/^text_/);
  });

  it('creates a sprite through the active protocol', async () => {
    await createTextSprite(makeConfig(), { x: 10, y: 20 }, 'tokens');
    expect(mockProtocol.createSprite).toHaveBeenCalledWith(expect.objectContaining({ type: 'text' }));
  });

  it('sprite_create payload contains correct position', async () => {
    await createTextSprite(makeConfig(), { x: 50, y: 75 }, 'map');
    expect(mockProtocol.createSprite).toHaveBeenCalledWith(expect.objectContaining({ x: 50, y: 75 }));
  });

  it('calls rustRenderManager.load_texture after img.onload', async () => {
    await createTextSprite(makeConfig(), { x: 0, y: 0 }, 'tokens');
    // img.onload triggers async via setTimeout(0)
    await new Promise(r => setTimeout(r, 10));
    expect(mockRustRenderer.load_texture).toHaveBeenCalled();
  });

  it('calls rustRenderManager.add_sprite_to_layer after img.onload', async () => {
    await createTextSprite(makeConfig(), { x: 0, y: 0 }, 'tokens');
    await new Promise(r => setTimeout(r, 10));
    expect(mockRustRenderer.add_sprite_to_layer).toHaveBeenCalledWith('tokens', expect.any(Object));
  });

  it('without protocol: does not throw, still returns ID', async () => {
    ProtocolService.clearProtocol();
    const id = await createTextSprite(makeConfig(), { x: 0, y: 0 }, 'tokens');
    expect(typeof id).toBe('string');
  });

  it('calls onSuccess callback with spriteId', async () => {
    const onSuccess = vi.fn();
    const id = await createTextSprite(makeConfig(), { x: 0, y: 0 }, 'tokens', onSuccess);
    await new Promise(r => setTimeout(r, 10));
    expect(onSuccess).toHaveBeenCalledWith(id);
  });
});

describe('deleteTextSprite', () => {
  it('removes the sprite from the render engine', () => {
    deleteTextSprite('sprite123');
    expect(mockRustRenderer.remove_sprite).toHaveBeenCalledWith('sprite123');
  });

  it('removes the sprite through the active protocol', () => {
    deleteTextSprite('sprite123');
    expect(mockProtocol.removeSprite).toHaveBeenCalledWith('sprite123');
  });

  it('does not throw when render engine is absent', () => {
    setCurrentWasmRuntime(createMockWasmRuntime({ getRenderEngine: vi.fn(() => null) }));
    expect(() => deleteTextSprite('s1')).not.toThrow();
  });
});

describe('updateTextSprite', () => {
  it('removes then adds the sprite for the replace flow', async () => {
    await updateTextSprite('sprite99', makeConfig(), { x: 0, y: 0 }, 'tokens');
    expect(mockRustRenderer.remove_sprite).toHaveBeenCalledWith('sprite99');
    // img.onload triggers via setTimeout
    await new Promise(r => setTimeout(r, 10));
    expect(mockRustRenderer.add_sprite_to_layer).toHaveBeenCalled();
  });

  it('updates the sprite through the active protocol', async () => {
    await updateTextSprite('sprite99', makeConfig({ text: 'Updated' }), { x: 5, y: 10 }, 'map');
    expect(mockProtocol.updateSprite).toHaveBeenCalledWith('sprite99', expect.objectContaining({ id: 'sprite99' }));
  });
});
