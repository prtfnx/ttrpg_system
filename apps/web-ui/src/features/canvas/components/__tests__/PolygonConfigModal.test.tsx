import { useGameStore } from '@/store';
import '@testing-library/jest-dom';
import { act, fireEvent, screen } from '@testing-library/react';
import { createMockWasmRuntime, renderWithWasmRuntime } from '@test/utils/wasmRuntimeTestUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PolygonConfigModal } from '../PolygonConfigModal';

const render = renderWithWasmRuntime;

vi.mock('@/store', () => ({ useGameStore: vi.fn() }));

const mockSendMessage = vi.fn();
const mockProtocol = { sendMessage: mockSendMessage };

vi.mock('@lib/api', () => ({
  useProtocol: vi.fn(() => ({ protocol: mockProtocol })),
}));

vi.mock('@lib/websocket', () => ({
  createMessage: vi.fn((type: string, data: unknown) => ({ type, data })),
  MessageType: { SPRITE_CREATE: 'sprite_create' },
}));

function setupStore(tableId: string | null = 'table-1') {
  vi.mocked(useGameStore).mockImplementation(
    ((sel?: (s: unknown) => unknown) => {
      const state = { activeTableId: tableId };
      return sel ? (sel as (s: typeof state) => unknown)(state) : state;
    }) as typeof useGameStore
  );
}

function dispatchPolygonCreated(vertices = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }]) {
  act(() => {
    window.dispatchEvent(new CustomEvent('polygonCreated', { detail: { vertices } }));
  });
}

describe('PolygonConfigModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupStore();
  });

  it('renders nothing before polygonCreated event', () => {
    const { container } = render(<PolygonConfigModal />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows modal after polygonCreated event', () => {
    render(<PolygonConfigModal />);
    dispatchPolygonCreated();
    expect(screen.getByText('New Polygon Obstacle')).toBeInTheDocument();
    expect(screen.getByText(/3 vertices/)).toBeInTheDocument();
  });

  it('Cancel button closes the modal', () => {
    render(<PolygonConfigModal />);
    dispatchPolygonCreated();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('New Polygon Obstacle')).not.toBeInTheDocument();
  });

  it('Create Obstacle sends one message with consistent sprite_id', () => {
    render(<PolygonConfigModal />);
    dispatchPolygonCreated();
    fireEvent.click(screen.getByText('Create Obstacle'));

    expect(mockSendMessage).toHaveBeenCalledOnce();
    const msg = mockSendMessage.mock.calls[0][0] as { data: { sprite_data: { sprite_id: string } } };
    const sentId: string = msg.data.sprite_data.sprite_id;
    // ID must look like 'polygon_<timestamp>_<random>' — never the old Date.now() fallback
    expect(sentId).toMatch(/^polygon_\d+_[a-z0-9]+$/);
  });

  it('Create Obstacle sets obstacle_type to polygon', () => {
    render(<PolygonConfigModal />);
    dispatchPolygonCreated();
    fireEvent.click(screen.getByText('Create Obstacle'));

    const msg = mockSendMessage.mock.calls[0][0] as { data: { sprite_data: { obstacle_type: string } } };
    expect(msg.data.sprite_data.obstacle_type).toBe('polygon');
  });

  it('Create Obstacle adds the polygon sprite to the attached render engine', () => {
    const addSpriteToLayer = vi.fn();
    render(
      <PolygonConfigModal />,
      createMockWasmRuntime({
        getRenderEngine: vi.fn(() => ({ add_sprite_to_layer: addSpriteToLayer }) as never),
      }),
    );
    dispatchPolygonCreated();
    fireEvent.click(screen.getByText('Create Obstacle'));

    expect(addSpriteToLayer).toHaveBeenCalledWith(
      'obstacles',
      expect.objectContaining({ obstacle_type: 'polygon', layer: 'obstacles' }),
    );
  });

  it('modal closes after submission', () => {
    render(<PolygonConfigModal />);
    dispatchPolygonCreated();
    fireEvent.click(screen.getByText('Create Obstacle'));
    expect(screen.queryByText('New Polygon Obstacle')).not.toBeInTheDocument();
  });
});
