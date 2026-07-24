import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProtocolService } from '@lib/api';
import { paintTemplateService } from '../paintTemplate.service';

describe('PaintTemplateService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    paintTemplateService.replaceFromServer([]);
  });

  it('keeps an optimistic template cache while publishing to the server', async () => {
    const upsertPaintTemplate = vi.fn();
    vi.spyOn(ProtocolService, 'hasProtocol').mockReturnValue(true);
    vi.spyOn(ProtocolService, 'getProtocol').mockReturnValue({
      upsertPaintTemplate,
    } as unknown as ReturnType<typeof ProtocolService.getProtocol>);

    const id = await paintTemplateService.saveTemplate(
      '  Fire  ',
      [{ id: 'stroke-1', points: [], color: [1, 0, 0, 1], width: 4 }],
      'marker',
    );

    expect(paintTemplateService.getTemplate(id)).toEqual(
      expect.objectContaining({ id, name: 'Fire', description: 'marker' }),
    );
    expect(upsertPaintTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ id, name: 'Fire' }),
    );
  });

  it('reconciles authoritative session snapshots', () => {
    paintTemplateService.replaceFromServer([
      {
        id: 'template-1',
        name: 'Shared',
        strokes: [],
        created: '2026-07-23T00:00:00',
        updated: '2026-07-23T00:00:00',
        created_by: 42,
      },
    ]);

    expect(paintTemplateService.getAllTemplateMetadata()).toEqual([
      expect.objectContaining({
        id: 'template-1',
        name: 'Shared',
        createdBy: 42,
      }),
    ]);
  });

  it('waits for server confirmation before deleting connected state', async () => {
    const deletePaintTemplate = vi.fn();
    vi.spyOn(ProtocolService, 'hasProtocol').mockReturnValue(true);
    vi.spyOn(ProtocolService, 'getProtocol').mockReturnValue({
      deletePaintTemplate,
    } as unknown as ReturnType<typeof ProtocolService.getProtocol>);
    paintTemplateService.replaceFromServer([
      {
        id: 'template-1',
        name: 'Shared',
        strokes: [],
        created: '2026-07-23T00:00:00',
        updated: '2026-07-23T00:00:00',
      },
    ]);

    expect(await paintTemplateService.deleteTemplate('template-1')).toBe(true);
    expect(deletePaintTemplate).toHaveBeenCalledWith('template-1');
    expect(paintTemplateService.getTemplate('template-1')).not.toBeNull();

    window.dispatchEvent(new CustomEvent('paint-template-deleted', {
      detail: { id: 'template-1' },
    }));
    expect(paintTemplateService.getTemplate('template-1')).toBeNull();
  });

  it('notifies subscribers when remote state changes', () => {
    const listener = vi.fn();
    const unsubscribe = paintTemplateService.subscribe(listener);

    paintTemplateService.replaceFromServer([]);

    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('exports and imports templates through the durable publish path', async () => {
    const upsertPaintTemplate = vi.fn();
    vi.spyOn(ProtocolService, 'hasProtocol').mockReturnValue(true);
    vi.spyOn(ProtocolService, 'getProtocol').mockReturnValue({
      upsertPaintTemplate,
    } as unknown as ReturnType<typeof ProtocolService.getProtocol>);
    paintTemplateService.replaceFromServer([
      {
        id: 'template-1',
        name: 'Export',
        strokes: [],
        created: '2026-07-23T00:00:00',
        updated: '2026-07-23T00:00:00',
      },
    ]);
    const exported = paintTemplateService.exportTemplates();
    paintTemplateService.replaceFromServer([]);

    const result = await paintTemplateService.importTemplates(exported);

    expect(result).toMatchObject({ success: true, imported: 1, errors: [] });
    expect(upsertPaintTemplate).toHaveBeenCalledOnce();
  });

  it('rejects malformed imports without changing the cache', async () => {
    const result = await paintTemplateService.importTemplates('{"version":"1.0"}');

    expect(result.success).toBe(false);
    expect(paintTemplateService.getAllTemplateMetadata()).toEqual([]);
  });
});
