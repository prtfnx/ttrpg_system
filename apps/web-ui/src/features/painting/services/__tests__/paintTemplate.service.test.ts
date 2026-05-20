import { beforeEach, describe, expect, it, vi } from 'vitest';
// Class is not exported — use the singleton and clear its internal state via delete+recreate in storage
import { paintTemplateService } from '../paintTemplate.service';

// PaintTemplateService constructor reads localStorage — stub it
const storage: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, value: string) => { storage[key] = value; },
  removeItem: (key: string) => { delete storage[key]; },
  clear: () => { Object.keys(storage).forEach(k => delete storage[k]); },
});

// Reset singleton state between tests by deleting all templates
async function clearService() {
  const templates = paintTemplateService.getAllTemplateMetadata();
  for (const t of templates) {
    await paintTemplateService.deleteTemplate(t.id);
  }
}

describe('PaintTemplateService', () => {
  const service = paintTemplateService;

  beforeEach(async () => {
    localStorage.clear();
    await clearService();
  });

  describe('saveTemplate + getTemplate', () => {
    it('saves and retrieves a template by id', async () => {
      const id = await service.saveTemplate('Test', [{ x: 0, y: 0 }], 'desc');
      expect(typeof id).toBe('string');
      const template = service.getTemplate(id);
      expect(template).not.toBeNull();
      expect(template!.name).toBe('Test');
      expect(template!.description).toBe('desc');
      expect(template!.strokes).toHaveLength(1);
    });

    it('trims name whitespace', async () => {
      const id = await service.saveTemplate('  Padded  ', []);
      expect(service.getTemplate(id)!.name).toBe('Padded');
    });

    it('returns null for unknown id', () => {
      expect(service.getTemplate('nonexistent')).toBeNull();
    });
  });

  describe('getAllTemplateMetadata', () => {
    it('returns empty array initially', () => {
      expect(service.getAllTemplateMetadata()).toEqual([]);
    });

    it('returns metadata without full stroke data', async () => {
      await service.saveTemplate('T1', [1, 2, 3]);
      const metadata = service.getAllTemplateMetadata();
      expect(metadata).toHaveLength(1);
      expect(metadata[0].name).toBe('T1');
      expect(metadata[0].strokeCount).toBe(3);
      // Ensure strokes array not present in metadata
      expect((metadata[0] as unknown as Record<string, unknown>).strokes).toBeUndefined();
    });
  });

  describe('deleteTemplate', () => {
    it('deletes existing template and returns true', async () => {
      const id = await service.saveTemplate('Del', []);
      expect(await service.deleteTemplate(id)).toBe(true);
      expect(service.getTemplate(id)).toBeNull();
    });

    it('returns false for unknown template', async () => {
      expect(await service.deleteTemplate('ghost')).toBe(false);
    });
  });

  describe('updateTemplate', () => {
    it('updates name and description', async () => {
      const id = await service.saveTemplate('Old', []);
      const ok = await service.updateTemplate(id, { name: 'New', description: 'Updated' });
      expect(ok).toBe(true);
      expect(service.getTemplate(id)!.name).toBe('New');
    });

    it('returns false for unknown id', async () => {
      expect(await service.updateTemplate('ghost', { name: 'X' })).toBe(false);
    });
  });

  describe('exportTemplates + importTemplates', () => {
    it('export/import roundtrip preserves templates', async () => {
      await service.saveTemplate('Export', [{ a: 1 }]);
      const json = service.exportTemplates();
      
      // Import into same service (clear first to avoid duplicates)
      await clearService();
      const result = await service.importTemplates(json);
      expect(result.success).toBe(true);
      expect(result.imported).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(service.getAllTemplateMetadata()[0].name).toBe('Export');
    });

    it('import invalid JSON returns error', async () => {
      const result = await service.importTemplates('not-json');
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('import missing templates array returns error', async () => {
      const result = await service.importTemplates('{"version":"1.0"}');
      expect(result.success).toBe(false);
    });

    it('import template with missing required fields is skipped', async () => {
      const bad = JSON.stringify({ templates: [{ name: 'bad' }] });
      const result = await service.importTemplates(bad);
      expect(result.imported).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('localStorage persistence', () => {
    it('persists templates to localStorage on save', async () => {
      await service.saveTemplate('Persist', [1, 2]);
      const stored = localStorage.getItem('paint_templates');
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed[0].name).toBe('Persist');
    });

    it('handles corrupt data gracefully via importTemplates', async () => {
      const result = await service.importTemplates('corrupt{{{');
      expect(result.success).toBe(false);
    });
  });
});
