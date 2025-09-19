/**
 * PDF Generation Service
 * Generates D&D 5e character sheets as PDF documents
 */

import type { WizardFormData } from '../components/CharacterWizard/WizardFormData';
import { CharacterExportService, type D5eCharacterExport } from './characterExport.service';

export interface PDFGenerationOptions {
  includeSpells?: boolean;
  includeBackground?: boolean;
  includeNotes?: boolean;
  format?: 'official' | 'simplified' | 'custom';
  theme?: 'light' | 'dark' | 'parchment';
}

export interface PDFGenerationResult {
  success: boolean;
  pdf?: Blob;
  error?: string;
  filename?: string;
}

export class PDFGenerationService {
  /**
   * Generate PDF character sheet
   * Note: This is a framework for PDF generation. In production, you would use
   * a library like jsPDF, PDFLib, or a server-side service like Puppeteer
   */
  static async generateCharacterSheet(
    character: WizardFormData,
    options: PDFGenerationOptions = {}
  ): Promise<PDFGenerationResult> {
    try {
      // Export character to D5e format for complete data
      const characterData = CharacterExportService.exportToD5e(character);
      
      // For now, we'll generate an HTML version that can be converted to PDF
      const html = this.generateHTMLCharacterSheet(characterData, options);
      
      // In a real implementation, you would use:
      // - jsPDF for client-side PDF generation
      // - Puppeteer on server-side for high-quality PDFs
      // - PDFLib for advanced PDF manipulation
      // - Canvas API for custom layouts
      
      const filename = CharacterExportService.generateFilename(character.name, 'character_sheet');
      
      // For now, create a simple HTML blob that can be printed to PDF
      const blob = new Blob([html], { type: 'text/html' });
      
      return {
        success: true,
        pdf: blob,
        filename: `${filename}.html`, // In real implementation, this would be .pdf
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to generate PDF: ${(error as Error).message}`,
      };
    }
  }
  
  /**
   * Generate print-ready character sheet for browser printing
   */
  static generatePrintableSheet(character: WizardFormData, options: PDFGenerationOptions = {}): string {
    const characterData = CharacterExportService.exportToD5e(character);
    return this.generateHTMLCharacterSheet(characterData, options);
  }
  
  /**
   * Generate HTML character sheet that matches D&D 5e official format
   */
  private static generateHTMLCharacterSheet(
    character: D5eCharacterExport,
    options: PDFGenerationOptions
  ): string {
    const char = character.character;
    const calc = char.calculated;
    const theme = options.theme || 'light';
    
    const css = this.generateCSS(theme);
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${char.name} - D&D 5e Character Sheet</title>
    <style>${css}</style>
</head>
<body class="character-sheet ${theme}">
    <div class="sheet-container">
        <!-- Header -->
        <header class="character-header">
            <div class="character-name-section">
                <h1 class="character-name">${char.name}</h1>
                <div class="character-class-level">${char.class} Level ${char.level}</div>
            </div>
            <div class="character-info">
                <div class="info-item">
                    <label>Race</label>
                    <span>${char.race}</span>
                </div>
                <div class="info-item">
                    <label>Background</label>
                    <span>${char.background}</span>
                </div>
            </div>
        </header>
        
        <!-- Core Stats Section -->
        <section class="core-stats">
            <!-- Ability Scores -->
            <div class="ability-scores">
                <h3>Ability Scores</h3>
                <div class="abilities-grid">
                    ${this.generateAbilityScore('STR', char.abilities.strength, calc.abilityModifiers.strength)}
                    ${this.generateAbilityScore('DEX', char.abilities.dexterity, calc.abilityModifiers.dexterity)}
                    ${this.generateAbilityScore('CON', char.abilities.constitution, calc.abilityModifiers.constitution)}
                    ${this.generateAbilityScore('INT', char.abilities.intelligence, calc.abilityModifiers.intelligence)}
                    ${this.generateAbilityScore('WIS', char.abilities.wisdom, calc.abilityModifiers.wisdom)}
                    ${this.generateAbilityScore('CHA', char.abilities.charisma, calc.abilityModifiers.charisma)}
                </div>
            </div>
            
            <!-- Combat Stats -->
            <div class="combat-stats">
                <div class="stat-block">
                    <label>Armor Class</label>
                    <div class="stat-value large">${calc.armorClass}</div>
                </div>
                <div class="stat-block">
                    <label>Hit Points</label>
                    <div class="stat-value large">${calc.hitPoints}</div>
                </div>
                <div class="stat-block">
                    <label>Speed</label>
                    <div class="stat-value">${calc.speed} ft</div>
                </div>
                <div class="stat-block">
                    <label>Proficiency</label>
                    <div class="stat-value">+${calc.proficiencyBonus}</div>
                </div>
            </div>
        </section>
        
        <!-- Saving Throws and Skills -->
        <section class="saves-and-skills">
            <div class="saving-throws">
                <h3>Saving Throws</h3>
                <div class="saves-list">
                    ${Object.entries(calc.savingThrows).map(([ability, data]) => 
                        `<div class="save-item ${data.proficient ? 'proficient' : ''}">
                            <span class="save-modifier">${data.value >= 0 ? '+' : ''}${data.value}</span>
                            <span class="save-name">${ability.charAt(0).toUpperCase() + ability.slice(1)}</span>
                            ${data.proficient ? '<span class="prof-indicator">●</span>' : '<span class="prof-indicator">○</span>'}
                        </div>`
                    ).join('')}
                </div>
            </div>
            
            <div class="skills">
                <h3>Skills</h3>
                <div class="skills-list">
                    ${Object.entries(calc.skillModifiers).map(([skill, data]) => 
                        `<div class="skill-item ${data.proficient ? 'proficient' : ''}">
                            <span class="skill-modifier">${data.value >= 0 ? '+' : ''}${data.value}</span>
                            <span class="skill-name">${skill}</span>
                            ${data.proficient ? '<span class="prof-indicator">●</span>' : '<span class="prof-indicator">○</span>'}
                        </div>`
                    ).join('')}
                </div>
            </div>
        </section>
        
        ${char.spells && options.includeSpells !== false ? this.generateSpellsSection(char.spells) : ''}
        
        ${options.includeBackground !== false && char.personality?.bio ? this.generateBackgroundSection(char.personality.bio) : ''}
        
        <!-- Footer -->
        <footer class="sheet-footer">
            <div class="generated-info">
                <p>Generated by TTRPG System Web Client</p>
                <p>Created: ${new Date().toLocaleDateString()}</p>
            </div>
        </footer>
    </div>
</body>
</html>`;
  }
  
  /**
   * Generate ability score HTML
   */
  private static generateAbilityScore(name: string, score: number, modifier: number): string {
    const modifierStr = modifier >= 0 ? `+${modifier}` : `${modifier}`;
    return `
        <div class="ability-score">
            <div class="ability-name">${name}</div>
            <div class="ability-modifier">${modifierStr}</div>
            <div class="ability-value">${score}</div>
        </div>`;
  }
  
  /**
   * Generate spells section HTML
   */
  private static generateSpellsSection(spells: any): string {
    if (!spells.cantrips?.length && !spells.knownSpells?.length && !spells.preparedSpells?.length) {
      return '';
    }
    
    return `
        <section class="spells-section">
            <h3>Spellcasting</h3>
            ${spells.spellcastingAbility ? `<p><strong>Spellcasting Ability:</strong> ${spells.spellcastingAbility.charAt(0).toUpperCase() + spells.spellcastingAbility.slice(1)}</p>` : ''}
            
            ${spells.cantrips?.length ? `
                <div class="spell-level">
                    <h4>Cantrips</h4>
                    <ul class="spells-list">
                        ${spells.cantrips.map((spell: string) => `<li>${spell}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
            
            ${spells.knownSpells?.length ? `
                <div class="spell-level">
                    <h4>Known Spells</h4>
                    <ul class="spells-list">
                        ${spells.knownSpells.map((spell: string) => `<li>${spell}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
            
            ${spells.preparedSpells?.length ? `
                <div class="spell-level">
                    <h4>Prepared Spells</h4>
                    <ul class="spells-list">
                        ${spells.preparedSpells.map((spell: string) => `<li>${spell}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
        </section>`;
  }
  
  /**
   * Generate background section HTML
   */
  private static generateBackgroundSection(bio: string): string {
    return `
        <section class="background-section">
            <h3>Background & Personality</h3>
            <div class="background-text">
                ${bio.split('\n').map(paragraph => `<p>${paragraph}</p>`).join('')}
            </div>
        </section>`;
  }
  
  /**
   * Generate CSS for character sheet
   */
  private static generateCSS(theme: string): string {
    const colors = {
      light: {
        background: '#ffffff',
        text: '#000000',
        border: '#cccccc',
        accent: '#8b0000',
        highlight: '#f5f5f5',
      },
      dark: {
        background: '#2d2d2d',
        text: '#ffffff',
        border: '#555555',
        accent: '#ff6b6b',
        highlight: '#3d3d3d',
      },
      parchment: {
        background: '#f4f1e8',
        text: '#3d2914',
        border: '#8b7355',
        accent: '#8b0000',
        highlight: '#ede7d3',
      },
    };
    
    const color = colors[theme as keyof typeof colors] || colors.light;
    
    return `
        @page {
            margin: 0.5in;
            size: letter;
        }
        
        * {
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Georgia', 'Times New Roman', serif;
            background-color: ${color.background};
            color: ${color.text};
            margin: 0;
            padding: 20px;
            line-height: 1.4;
        }
        
        .sheet-container {
            max-width: 8.5in;
            margin: 0 auto;
            background: ${color.background};
        }
        
        .character-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 3px solid ${color.accent};
        }
        
        .character-name {
            font-size: 32px;
            font-weight: bold;
            margin: 0;
            color: ${color.accent};
        }
        
        .character-class-level {
            font-size: 18px;
            font-weight: bold;
            margin-top: 5px;
        }
        
        .character-info {
            display: flex;
            gap: 30px;
        }
        
        .info-item {
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        
        .info-item label {
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
            margin-bottom: 5px;
            color: ${color.accent};
        }
        
        .info-item span {
            font-size: 16px;
            font-weight: bold;
        }
        
        .core-stats {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 40px;
            margin-bottom: 30px;
        }
        
        .abilities-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
        }
        
        .ability-score {
            text-align: center;
            border: 2px solid ${color.border};
            border-radius: 8px;
            padding: 15px 10px;
            background: ${color.highlight};
        }
        
        .ability-name {
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 8px;
            color: ${color.accent};
        }
        
        .ability-modifier {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 5px;
        }
        
        .ability-value {
            font-size: 16px;
            background: ${color.background};
            border: 1px solid ${color.border};
            border-radius: 4px;
            padding: 4px 8px;
            margin-top: 5px;
        }
        
        .combat-stats {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
        }
        
        .stat-block {
            text-align: center;
            border: 2px solid ${color.border};
            border-radius: 8px;
            padding: 15px;
            background: ${color.highlight};
        }
        
        .stat-block label {
            display: block;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
            margin-bottom: 8px;
            color: ${color.accent};
        }
        
        .stat-value {
            font-size: 18px;
            font-weight: bold;
        }
        
        .stat-value.large {
            font-size: 28px;
        }
        
        .saves-and-skills {
            display: grid;
            grid-template-columns: 1fr 2fr;
            gap: 40px;
            margin-bottom: 30px;
        }
        
        .saving-throws h3,
        .skills h3 {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 15px;
            color: ${color.accent};
            border-bottom: 1px solid ${color.border};
            padding-bottom: 5px;
        }
        
        .saves-list,
        .skills-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        
        .save-item,
        .skill-item {
            display: flex;
            align-items: center;
            padding: 8px 12px;
            border: 1px solid ${color.border};
            border-radius: 4px;
            background: ${color.highlight};
        }
        
        .save-item.proficient,
        .skill-item.proficient {
            background: ${color.accent}20;
            border-color: ${color.accent};
        }
        
        .save-modifier,
        .skill-modifier {
            font-weight: bold;
            min-width: 35px;
            text-align: center;
            margin-right: 10px;
        }
        
        .save-name,
        .skill-name {
            flex-grow: 1;
        }
        
        .prof-indicator {
            font-weight: bold;
            color: ${color.accent};
        }
        
        .spells-section,
        .background-section {
            margin-bottom: 30px;
        }
        
        .spells-section h3,
        .background-section h3 {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 15px;
            color: ${color.accent};
            border-bottom: 1px solid ${color.border};
            padding-bottom: 5px;
        }
        
        .spell-level {
            margin-bottom: 20px;
        }
        
        .spell-level h4 {
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 10px;
            color: ${color.accent};
        }
        
        .spells-list {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 5px;
            list-style: none;
            padding: 0;
        }
        
        .spells-list li {
            padding: 5px 10px;
            background: ${color.highlight};
            border: 1px solid ${color.border};
            border-radius: 4px;
            font-size: 14px;
        }
        
        .background-text p {
            margin-bottom: 10px;
            text-indent: 20px;
        }
        
        .sheet-footer {
            margin-top: 50px;
            padding-top: 20px;
            border-top: 1px solid ${color.border};
            text-align: center;
        }
        
        .generated-info p {
            margin: 5px 0;
            font-size: 12px;
            color: ${color.text}80;
        }
        
        /* Print styles */
        @media print {
            body {
                padding: 0;
            }
            
            .sheet-container {
                max-width: none;
            }
            
            .character-header {
                break-inside: avoid;
            }
            
            .core-stats,
            .saves-and-skills,
            .spells-section {
                break-inside: avoid;
            }
        }`;
  }
  
  /**
   * Open printable character sheet in new window
   */
  static openPrintableSheet(character: WizardFormData, options: PDFGenerationOptions = {}): void {
    const html = this.generatePrintableSheet(character, options);
    const newWindow = window.open('', '_blank');
    
    if (newWindow) {
      newWindow.document.write(html);
      newWindow.document.close();
      
      // Auto-focus print dialog after content loads
      newWindow.onload = () => {
        newWindow.focus();
        setTimeout(() => {
          newWindow.print();
        }, 250);
      };
    } else {
      console.error('Failed to open print window. Pop-ups may be blocked.');
    }
  }
  
  /**
   * Download character sheet as HTML file for manual PDF conversion
   */
  static downloadHTMLSheet(character: WizardFormData, options: PDFGenerationOptions = {}): void {
    const html = this.generatePrintableSheet(character, options);
    const filename = CharacterExportService.generateFilename(character.name, 'character_sheet');
    
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.html`;
    document.body.appendChild(link);
    link.click();
    
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
  
  /**
   * Get available PDF themes
   */
  static getAvailableThemes(): Array<{ value: string; label: string; description: string }> {
    return [
      {
        value: 'light',
        label: 'Light',
        description: 'Clean white background with black text',
      },
      {
        value: 'dark',
        label: 'Dark',
        description: 'Dark background with light text',
      },
      {
        value: 'parchment',
        label: 'Parchment',
        description: 'Vintage parchment look with warm colors',
      },
    ];
  }
  
  /**
   * Get available PDF formats
   */
  static getAvailableFormats(): Array<{ value: string; label: string; description: string }> {
    return [
      {
        value: 'official',
        label: 'Official Style',
        description: 'Matches official D&D 5e character sheet layout',
      },
      {
        value: 'simplified',
        label: 'Simplified',
        description: 'Clean, minimalist design focused on essential information',
      },
      {
        value: 'custom',
        label: 'Custom',
        description: 'Customizable layout with additional options',
      },
    ];
  }
}