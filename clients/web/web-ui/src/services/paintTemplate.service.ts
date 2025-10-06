/**
 * Paint Template Service
 * Handles saving and loading paint stroke templates
 */

export interface PaintTemplate {
  id: string;
  name: string;
  description?: string;
  strokes: any[]; // Stroke data from WASM
  thumbnail?: string; // Base64 image
  created: string;
  updated: string;
}

export interface TemplateMetadata {
  id: string;
  name: string;
  description?: string;
  thumbnail?: string;
  created: string;
  updated: string;
  strokeCount: number;
}

class PaintTemplateService {
  private readonly STORAGE_KEY = 'paint_templates';
  private templates: Map<string, PaintTemplate> = new Map();

  constructor() {
    this.loadTemplatesFromStorage();
  }

  /**
   * Save current paint strokes as a template
   */
  async saveTemplate(
    name: string,
    strokes: any[],
    description?: string,
    thumbnail?: string
  ): Promise<string> {
    const id = `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    
    const template: PaintTemplate = {
      id,
      name: name.trim(),
      description: description?.trim(),
      strokes: JSON.parse(JSON.stringify(strokes)), // Deep clone
      thumbnail,
      created: now,
      updated: now,
    };

    this.templates.set(id, template);
    await this.saveTemplatesToStorage();
    
    console.log(`[PaintTemplateService] Saved template: ${name} (${strokes.length} strokes)`);
    return id;
  }

  /**
   * Load template by ID
   */
  getTemplate(id: string): PaintTemplate | null {
    return this.templates.get(id) || null;
  }

  /**
   * Get all template metadata (without stroke data for performance)
   */
  getAllTemplateMetadata(): TemplateMetadata[] {
    return Array.from(this.templates.values()).map(template => ({
      id: template.id,
      name: template.name,
      description: template.description,
      thumbnail: template.thumbnail,
      created: template.created,
      updated: template.updated,
      strokeCount: template.strokes.length,
    }));
  }

  /**
   * Delete template
   */
  async deleteTemplate(id: string): Promise<boolean> {
    const deleted = this.templates.delete(id);
    if (deleted) {
      await this.saveTemplatesToStorage();
      console.log(`[PaintTemplateService] Deleted template: ${id}`);
    }
    return deleted;
  }

  /**
   * Update template metadata
   */
  async updateTemplate(
    id: string,
    updates: Partial<Pick<PaintTemplate, 'name' | 'description' | 'thumbnail'>>
  ): Promise<boolean> {
    const template = this.templates.get(id);
    if (!template) return false;

    const updatedTemplate = {
      ...template,
      ...updates,
      updated: new Date().toISOString(),
    };

    this.templates.set(id, updatedTemplate);
    await this.saveTemplatesToStorage();
    
    console.log(`[PaintTemplateService] Updated template: ${id}`);
    return true;
  }

  /**
   * Generate thumbnail from canvas
   */
  generateThumbnail(canvas: HTMLCanvasElement, maxSize = 64): string {
    try {
      const tempCanvas = document.createElement('canvas');
      const ctx = tempCanvas.getContext('2d');
      if (!ctx) return '';

      // Set thumbnail dimensions while maintaining aspect ratio
      const aspectRatio = canvas.width / canvas.height;
      if (aspectRatio > 1) {
        tempCanvas.width = maxSize;
        tempCanvas.height = maxSize / aspectRatio;
      } else {
        tempCanvas.width = maxSize * aspectRatio;
        tempCanvas.height = maxSize;
      }

      // Draw scaled canvas content
      ctx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
      
      return tempCanvas.toDataURL('image/png', 0.8);
    } catch (error) {
      console.error('[PaintTemplateService] Failed to generate thumbnail:', error);
      return '';
    }
  }

  /**
   * Export templates for backup
   */
  exportTemplates(): string {
    const exportData = {
      version: '1.0',
      exported: new Date().toISOString(),
      templates: Array.from(this.templates.values()),
    };
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import templates from backup
   */
  async importTemplates(jsonData: string): Promise<{ success: boolean; imported: number; errors: string[] }> {
    try {
      const data = JSON.parse(jsonData);
      const errors: string[] = [];
      let imported = 0;

      if (!data.templates || !Array.isArray(data.templates)) {
        return { success: false, imported: 0, errors: ['Invalid template data format'] };
      }

      for (const template of data.templates) {
        try {
          if (this.validateTemplate(template)) {
            // Generate new ID to avoid conflicts
            const newId = `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const importedTemplate = { ...template, id: newId };
            this.templates.set(newId, importedTemplate);
            imported++;
          } else {
            errors.push(`Invalid template: ${template.name || 'Unknown'}`);
          }
        } catch (error) {
          errors.push(`Failed to import template: ${template.name || 'Unknown'}`);
        }
      }

      await this.saveTemplatesToStorage();
      console.log(`[PaintTemplateService] Imported ${imported} templates with ${errors.length} errors`);
      
      return { success: imported > 0, imported, errors };
    } catch (error) {
      return { 
        success: false, 
        imported: 0, 
        errors: [`Failed to parse template data: ${error instanceof Error ? error.message : 'Unknown error'}`] 
      };
    }
  }

  private validateTemplate(template: any): boolean {
    return (
      template &&
      typeof template.id === 'string' &&
      typeof template.name === 'string' &&
      Array.isArray(template.strokes) &&
      typeof template.created === 'string' &&
      typeof template.updated === 'string'
    );
  }

  private loadTemplatesFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        if (Array.isArray(data)) {
          this.templates = new Map(data.map((template: PaintTemplate) => [template.id, template]));
          console.log(`[PaintTemplateService] Loaded ${this.templates.size} templates from storage`);
        }
      }
    } catch (error) {
      console.error('[PaintTemplateService] Failed to load templates from storage:', error);
      this.templates = new Map();
    }
  }

  private async saveTemplatesToStorage(): Promise<void> {
    try {
      const data = Array.from(this.templates.values());
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('[PaintTemplateService] Failed to save templates to storage:', error);
    }
  }
}

// Export singleton instance
export const paintTemplateService = new PaintTemplateService();