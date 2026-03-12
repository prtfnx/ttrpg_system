/**
 * PolygonConfigModal - Behavioral Tests
 * Tests real user interactions: DM draws a polygon obstacle, configures it, submits.
 */

import { useGameStore } from '@/store';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PolygonConfigModal } from '../PolygonConfigModal';

const mockSendMessage = vi.fn();
const mockCreatePolygonSprite = vi.fn(() => 'polygon_sprite_123');
const mockCancelPolygon = vi.fn();

vi.mock('@lib/api', () => ({
  useProtocol: () => ({ protocol: { sendMessage: mockSendMessage } }),
}));

vi.mock('@/store', () => ({
  useGameStore: vi.fn(),
}));

vi.mock('@lib/websocket', () => ({
  createMessage: vi.fn((type, data) => ({ type, data })),
  MessageType: { SPRITE_CREATE: 'sprite_create' },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useGameStore).mockImplementation((selector: any) =>
    selector({ activeTableId: 'table-1' })
  );
  (window as any).rustRenderManager = {
    create_polygon_sprite: mockCreatePolygonSprite,
    cancel_polygon_creation: mockCancelPolygon,
  };
});

const SAMPLE_VERTICES = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

function firePolygonCreated(vertices = SAMPLE_VERTICES) {
  window.dispatchEvent(new CustomEvent('polygonCreated', { detail: { vertices } }));
}

describe('PolygonConfigModal — DM places a polygon obstacle', () => {
  const user = userEvent.setup();

  it('modal is hidden until DM completes a polygon', () => {
    render(<PolygonConfigModal />);
    expect(screen.queryByText('New Polygon Obstacle')).not.toBeInTheDocument();
  });

  it('appears after polygonCreated event', async () => {
    render(<PolygonConfigModal />);
    firePolygonCreated();
    await waitFor(() => expect(screen.getByText('New Polygon Obstacle')).toBeInTheDocument());
  });

  it('shows the vertex count to confirm DM\'s drawing', async () => {
    render(<PolygonConfigModal />);
    firePolygonCreated(SAMPLE_VERTICES);
    await waitFor(() => screen.getByText('New Polygon Obstacle'));

    expect(screen.getByText(/4 vertices placed/i)).toBeInTheDocument();
  });

  it('defaults to obstacles layer', async () => {
    render(<PolygonConfigModal />);
    firePolygonCreated();
    await waitFor(() => screen.getByText('New Polygon Obstacle'));

    expect(screen.getByDisplayValue('Obstacles')).toBeInTheDocument();
  });

  it('DM can change target layer', async () => {
    render(<PolygonConfigModal />);
    firePolygonCreated();
    await waitFor(() => screen.getByText('New Polygon Obstacle'));

    await user.selectOptions(screen.getByDisplayValue('Obstacles'), 'map');
    expect(screen.getByDisplayValue('Map')).toBeInTheDocument();
  });

  it('DM can add a label', async () => {
    render(<PolygonConfigModal />);
    firePolygonCreated();
    await waitFor(() => screen.getByText('New Polygon Obstacle'));

    const labelInput = screen.getByPlaceholderText(/e\.g\. Wall/i);
    await user.type(labelInput, 'Stone Pillar');
    expect(labelInput).toHaveValue('Stone Pillar');
  });

  it('Cancel closes modal and cancels Rust polygon', async () => {
    render(<PolygonConfigModal />);
    firePolygonCreated();
    await waitFor(() => screen.getByText('New Polygon Obstacle'));

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByText('New Polygon Obstacle')).not.toBeInTheDocument());
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(mockCancelPolygon).toHaveBeenCalled();
  });

  it('Create Obstacle calls WASM create_polygon_sprite', async () => {
    render(<PolygonConfigModal />);
    firePolygonCreated(SAMPLE_VERTICES);
    await waitFor(() => screen.getByText('New Polygon Obstacle'));

    await user.click(screen.getByRole('button', { name: /create obstacle/i }));

    expect(mockCreatePolygonSprite).toHaveBeenCalledOnce();
    const [flatArg, layerArg, tableArg] = mockCreatePolygonSprite.mock.calls[0];
    expect(flatArg).toBeInstanceOf(Float32Array);
    expect(flatArg.length).toBe(8); // 4 vertices × 2 coords
    expect(layerArg).toBe('obstacles');
    expect(tableArg).toBe('table-1');
  });

  it('Create Obstacle sends SPRITE_CREATE to server', async () => {
    render(<PolygonConfigModal />);
    firePolygonCreated(SAMPLE_VERTICES);
    await waitFor(() => screen.getByText('New Polygon Obstacle'));

    await user.click(screen.getByRole('button', { name: /create obstacle/i }));

    expect(mockSendMessage).toHaveBeenCalledOnce();
    const call = mockSendMessage.mock.calls[0][0];
    expect(call.type).toBe('sprite_create');
    expect(call.data).toMatchObject({
      table_id: 'table-1',
      sprite_data: {
        layer: 'obstacles',
        obstacle_type: 'polygon',
        sprite_id: 'polygon_sprite_123',
      },
    });
    expect(call.data.sprite_data.polygon_vertices).toHaveLength(4);
  });

  it('modal closes after creating obstacle', async () => {
    render(<PolygonConfigModal />);
    firePolygonCreated(SAMPLE_VERTICES);
    await waitFor(() => screen.getByText('New Polygon Obstacle'));

    await user.click(screen.getByRole('button', { name: /create obstacle/i }));

    await waitFor(() => expect(screen.queryByText('New Polygon Obstacle')).not.toBeInTheDocument());
  });

  it('triangular polygon (3 vertices) works correctly', async () => {
    render(<PolygonConfigModal />);
    firePolygonCreated([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 25, y: 50 }]);
    await waitFor(() => screen.getByText('New Polygon Obstacle'));

    expect(screen.getByText(/3 vertices placed/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /create obstacle/i }));

    const flatArg = mockCreatePolygonSprite.mock.calls[0][0];
    expect(flatArg.length).toBe(6); // 3 × 2
  });
});
