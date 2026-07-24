/**
 * Session-backed paint template cache.
 *
 * The server owns durable state. This service keeps an optimistic in-memory
 * cache for responsive editing and reconciles it from protocol confirmations
 * and snapshots so templates follow the session across browsers.
 */

import { ProtocolService } from '@lib/api';
import { onProtocolEvent } from '@lib/websocket/protocolEvents';
import { logger } from '@shared/utils/logger';

export interface PaintTemplate {
  id: string;
  name: string;
  description?: string;
  strokes: unknown[];
  thumbnail?: string;
  created: string;
  updated: string;
  created_by?: number;
}

export interface TemplateMetadata {
  id: string;
  name: string;
  description?: string;
  thumbnail?: string;
  created: string;
  updated: string;
  strokeCount: number;
  createdBy?: number;
}

class PaintTemplateService {
  private templates: Map<string, PaintTemplate> = new Map();
  private subscribers = new Set<() => void>();
  private protocolListeners: Array<() => void> = [];

  constructor() {
    if (typeof window !== 'undefined') this.attachProtocolListeners();
  }

  private attachProtocolListeners(): void {
    this.protocolListeners.forEach(stop => stop());
    this.protocolListeners = [
      onProtocolEvent('paint-template-upserted', data => {
        const template = data?.template;
        if (this.validateTemplate(template)) {
          this.templates.set(template.id, this.cloneTemplate(template));
          this.notify();
        }
      }),
      onProtocolEvent('paint-template-deleted', data => {
        if (typeof data?.id === 'string' && this.templates.delete(data.id)) {
          this.notify();
        }
      }),
      onProtocolEvent('paint-templates-synced', data => {
        if (!Array.isArray(data?.templates)) return;
        this.replaceFromServer(data.templates);
      }),
      onProtocolEvent('protocol-connected', () => this.requestSync()),
    ];
  }

  subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  requestSync(): void {
    if (ProtocolService.hasProtocol()) {
      ProtocolService.getProtocol().requestPaintTemplateSync();
    }
  }

  /**
   * Save current paint strokes as a template.
   */
  async saveTemplate(
    name: string,
    strokes: unknown[],
    description?: string,
    thumbnail?: string
  ): Promise<string> {
    const id = `template_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const now = new Date().toISOString();
    const template: PaintTemplate = {
      id,
      name: name.trim(),
      description: description?.trim(),
      strokes: structuredClone(strokes),
      thumbnail,
      created: now,
      updated: now,
    };

    this.templates.set(id, template);
    this.publish(template);
    this.notify();
    logger.debug('[PaintTemplateService] Saved template', {
      name,
      strokeCount: strokes.length,
    });
    return id;
  }

  getTemplate(id: string): PaintTemplate | null {
    return this.templates.get(id) || null;
  }

  getAllTemplateMetadata(): TemplateMetadata[] {
    return Array.from(this.templates.values()).map(template => ({
      id: template.id,
      name: template.name,
      description: template.description,
      thumbnail: template.thumbnail,
      created: template.created,
      updated: template.updated,
      strokeCount: template.strokes.length,
      createdBy: template.created_by,
    }));
  }

  async deleteTemplate(id: string): Promise<boolean> {
    if (!this.templates.has(id)) return false;
    if (ProtocolService.hasProtocol()) {
      ProtocolService.getProtocol().deletePaintTemplate(id);
      return true;
    }
    this.templates.delete(id);
    this.notify();
    return true;
  }

  async updateTemplate(
    id: string,
    updates: Partial<Pick<PaintTemplate, 'name' | 'description' | 'thumbnail'>>
  ): Promise<boolean> {
    const template = this.templates.get(id);
    if (!template) return false;
    const updatedTemplate = {
      ...template,
      ...updates,
      name: updates.name?.trim() ?? template.name,
      description: updates.description === undefined
        ? template.description
        : updates.description.trim(),
      updated: new Date().toISOString(),
    };
    this.templates.set(id, updatedTemplate);
    this.publish(updatedTemplate);
    this.notify();
    return true;
  }

  generateThumbnail(canvas: HTMLCanvasElement, maxSize = 64): string {
    try {
      const tempCanvas = document.createElement('canvas');
      const ctx = tempCanvas.getContext('2d');
      if (!ctx) return '';
      const aspectRatio = canvas.width / canvas.height;
      if (aspectRatio > 1) {
        tempCanvas.width = maxSize;
        tempCanvas.height = maxSize / aspectRatio;
      } else {
        tempCanvas.width = maxSize * aspectRatio;
        tempCanvas.height = maxSize;
      }
      ctx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
      return tempCanvas.toDataURL('image/png', 0.8);
    } catch (error) {
      logger.error('[PaintTemplateService] Failed to generate thumbnail', error);
      return '';
    }
  }

  exportTemplates(): string {
    return JSON.stringify({
      version: '1.0',
      exported: new Date().toISOString(),
      templates: Array.from(this.templates.values()),
    }, null, 2);
  }

  async importTemplates(
    jsonData: string
  ): Promise<{ success: boolean; imported: number; errors: string[] }> {
    try {
      const data = JSON.parse(jsonData) as { templates?: unknown[] };
      if (!Array.isArray(data.templates)) {
        return {
          success: false,
          imported: 0,
          errors: ['Invalid template data format'],
        };
      }

      const errors: string[] = [];
      let imported = 0;
      for (const candidate of data.templates) {
        if (!this.validateTemplate(candidate)) {
          const name = (
            candidate
            && typeof candidate === 'object'
            && 'name' in candidate
            && typeof candidate.name === 'string'
          ) ? candidate.name : 'Unknown';
          errors.push(`Invalid template: ${name}`);
          continue;
        }
        const id = `template_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
        const now = new Date().toISOString();
        const template = this.cloneTemplate({
          ...candidate,
          id,
          created: now,
          updated: now,
        });
        this.templates.set(id, template);
        this.publish(template);
        imported += 1;
      }
      if (imported > 0) this.notify();
      return { success: imported > 0, imported, errors };
    } catch (error) {
      return {
        success: false,
        imported: 0,
        errors: [
          `Failed to parse template data: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        ],
      };
    }
  }

  replaceFromServer(candidates: unknown[]): void {
    this.templates = new Map(
      candidates
        .filter((candidate): candidate is PaintTemplate => this.validateTemplate(candidate))
        .map(template => [template.id, this.cloneTemplate(template)]),
    );
    this.notify();
  }

  private publish(template: PaintTemplate): void {
    if (ProtocolService.hasProtocol()) {
      ProtocolService.getProtocol().upsertPaintTemplate(
        template as unknown as Record<string, unknown>,
      );
    }
  }

  private cloneTemplate(template: PaintTemplate): PaintTemplate {
    return {
      ...template,
      strokes: structuredClone(template.strokes),
      description: template.description ?? undefined,
      thumbnail: template.thumbnail ?? undefined,
      created: template.created || new Date().toISOString(),
      updated: template.updated || template.created || new Date().toISOString(),
    };
  }

  private validateTemplate(template: unknown): template is PaintTemplate {
    if (!template || typeof template !== 'object') return false;
    const candidate = template as Record<string, unknown>;
    return (
      typeof candidate.id === 'string'
      && typeof candidate.name === 'string'
      && Array.isArray(candidate.strokes)
      && (candidate.created == null || typeof candidate.created === 'string')
      && (candidate.updated == null || typeof candidate.updated === 'string')
    );
  }

  private notify(): void {
    this.subscribers.forEach(callback => callback());
  }
}

export const paintTemplateService = new PaintTemplateService();
