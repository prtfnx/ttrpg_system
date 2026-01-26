/**
 * Character Export/Import Step Component
 * Provides UI for exporting and importing character data
 */

import { useCallback, useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { CharacterExportService } from '../../services/characterExport.service';
import { CharacterImportService, type ImportResult } from '../../services/characterImport.service';
import { PDFGenerationService, type PDFGenerationOptions } from '../../services/pdfGeneration.service';
import styles from './CharacterExportStep.module.css';
import type { WizardFormData } from './WizardFormData';

interface CharacterExportStepProps {
  onNext?: () => void;
  onBack?: () => void;
}

type ExportFormat = 'd5e' | 'dndBeyond' | 'characterSheet';
type TabType = 'export' | 'import' | 'pdf';

export function CharacterExportStep({ onNext: _onNext, onBack: _onBack }: CharacterExportStepProps = {}) {
  const { getValues, setValue } = useFormContext<WizardFormData>();
  const [activeTab, setActiveTab] = useState<TabType>('export');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('d5e');
  const [pdfOptions, setPdfOptions] = useState<PDFGenerationOptions>({
    includeSpells: true,
    includeBackground: true,
    includeNotes: false,
    format: 'official',
    theme: 'light',
  });
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<WizardFormData | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  
  const characterData = getValues();
  
  const handleExport = useCallback(() => {
    const additionalData = {
      level: 1, // Could be derived from character progression
      exportedBy: 'Character Creation Wizard',
      notes: `Exported on ${new Date().toLocaleDateString()}`,
    };
    
    let exportData: any;
    let filename: string;
    
    switch (exportFormat) {
      case 'd5e':
        exportData = CharacterExportService.exportToD5e(characterData, additionalData);
        filename = CharacterExportService.generateFilename(characterData.name, 'D5e');
        break;
      case 'dndBeyond':
        exportData = CharacterExportService.exportToDNDBeyond(characterData, additionalData);
        filename = CharacterExportService.generateFilename(characterData.name, 'DNDBeyond');
        break;
      case 'characterSheet':
        exportData = CharacterExportService.exportToCharacterSheet(characterData, additionalData);
        filename = CharacterExportService.generateFilename(characterData.name, 'CharacterSheet');
        break;
      default:
        return;
    }
    
    CharacterExportService.downloadAsJSON(exportData, filename);
  }, [characterData, exportFormat]);
  
  const handleFileImport = useCallback(async (file: File) => {
    setIsImporting(true);
    setImportResult(null);
    setImportPreview(null);
    
    try {
      const validation = await CharacterImportService.validateFile(file);
      
      if (!validation.valid) {
        setImportResult({
          success: false,
          errors: validation.errors,
        });
        return;
      }
      
      const result = await CharacterImportService.importFromFile(file);
      setImportResult(result);
      
      if (result.success && result.character) {
        setImportPreview(result.character);
      }
    } catch (error) {
      setImportResult({
        success: false,
        errors: [`Import failed: ${(error as Error).message}`],
      });
    } finally {
      setIsImporting(false);
    }
  }, []);
  
  const handleUrlImport = useCallback(async (url: string) => {
    if (!url.trim()) return;
    
    setIsImporting(true);
    setImportResult(null);
    setImportPreview(null);
    
    try {
      const result = await CharacterImportService.importFromURL(url);
      setImportResult(result);
      
      if (result.success && result.character) {
        setImportPreview(result.character);
      }
    } catch (error) {
      setImportResult({
        success: false,
        errors: [`URL import failed: ${(error as Error).message}`],
      });
    } finally {
      setIsImporting(false);
    }
  }, []);
  
  const applyImport = useCallback(() => {
    if (importPreview) {
      // Create backup of current character
      const backup = CharacterImportService.createBackup(characterData);
      localStorage.setItem('character-backup', backup);
      
      // Apply imported character data
      Object.entries(importPreview).forEach(([key, value]) => {
        setValue(key as keyof WizardFormData, value);
      });
      
      setImportResult(null);
      setImportPreview(null);
      setActiveTab('export');
    }
  }, [importPreview, characterData, setValue]);
  
  const handlePDFGeneration = useCallback(() => {
    PDFGenerationService.openPrintableSheet(characterData, pdfOptions);
  }, [characterData, pdfOptions]);
  
  const handlePDFDownload = useCallback(() => {
    PDFGenerationService.downloadHTMLSheet(characterData, pdfOptions);
  }, [characterData, pdfOptions]);
  
  const renderExportTab = () => (
    <div className="export-tab">
      <h4>Export Character Data</h4>
      <p className="tab-description">
        Export your character to various formats for backup, sharing, or use in other applications.
      </p>
      
      <div className="export-format-selection">
        <label>
          <input
            type="radio"
            value="d5e"
            checked={exportFormat === 'd5e'}
            onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
          />
          <div className="format-option">
            <strong>D&D 5e Complete</strong>
            <span>Full character data with all calculations and computed values</span>
          </div>
        </label>
        
        <label>
          <input
            type="radio"
            value="dndBeyond"
            checked={exportFormat === 'dndBeyond'}
            onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
          />
          <div className="format-option">
            <strong>D&D Beyond Compatible</strong>
            <span>Format compatible with D&D Beyond character sheets</span>
          </div>
        </label>
        
        <label>
          <input
            type="radio"
            value="characterSheet"
            checked={exportFormat === 'characterSheet'}
            onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
          />
          <div className="format-option">
            <strong>Character Sheet Data</strong>
            <span>Simplified format focused on character sheet display</span>
          </div>
        </label>
      </div>
      
      <div className={styles.exportPreview}>
        <h5>Character Summary</h5>
        <div className="character-summary">
          <div><strong>Name:</strong> {characterData.name || 'Unnamed Character'}</div>
          <div><strong>Race:</strong> {characterData.race}</div>
          <div><strong>Class:</strong> {characterData.class}</div>
          <div><strong>Background:</strong> {characterData.background}</div>
          {characterData.spells && (
            <div><strong>Spells:</strong> {characterData.spells.cantrips.length} cantrips, {characterData.spells.knownSpells.length} known spells</div>
          )}
        </div>
      </div>
      
      <div className="export-actions">
        <button
          type="button"
          className="export-button primary"
          onClick={handleExport}
          disabled={!characterData.name || !characterData.race || !characterData.class}
        >
          Export Character Data
        </button>
      </div>
    </div>
  );
  
  const renderImportTab = () => (
    <div className="import-tab">
      <h4>Import Character Data</h4>
      <p className="tab-description">
        Import character data from various sources. Supported formats: D&D 5e JSON, D&D Beyond, Roll20, and generic character JSON.
      </p>
      
      <div className="import-methods">
        <div className="import-method">
          <h5>Import from File</h5>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleFileImport(file);
              }
            }}
            style={{ marginBottom: '10px' }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="secondary"
          >
            Choose File to Import
          </button>
        </div>
        
        <div className="import-method">
          <h5>Import from URL</h5>
          <div className="url-import">
            <input
              ref={urlInputRef}
              type="url"
              placeholder="Enter character data URL..."
              className="url-input"
            />
            <button
              type="button"
              onClick={() => {
                const url = urlInputRef.current?.value;
                if (url) {
                  handleUrlImport(url);
                }
              }}
              className="secondary"
            >
              Import from URL
            </button>
          </div>
        </div>
      </div>
      
      {isImporting && (
        <div className="import-status loading">
          <div className="spinner"></div>
          <span>Importing character...</span>
        </div>
      )}
      
      {importResult && !importResult.success && (
        <div className="import-status error">
          <h5>Import Failed</h5>
          {importResult.errors?.map((error, index) => (
            <p key={index} className="error-message">{error}</p>
          ))}
        </div>
      )}
      
      {importResult && importResult.success && importPreview && (
        <div className="import-preview">
          <h5>Import Preview</h5>
          <div className="preview-character">
            <div><strong>Name:</strong> {importPreview.name}</div>
            <div><strong>Race:</strong> {importPreview.race}</div>
            <div><strong>Class:</strong> {importPreview.class}</div>
            <div><strong>Background:</strong> {importPreview.background}</div>
            <div><strong>Ability Scores:</strong> STR {importPreview.strength}, DEX {importPreview.dexterity}, CON {importPreview.constitution}, INT {importPreview.intelligence}, WIS {importPreview.wisdom}, CHA {importPreview.charisma}</div>
            {importPreview.skills?.length > 0 && (
              <div><strong>Skills:</strong> {importPreview.skills.join(', ')}</div>
            )}
          </div>
          
          {importResult.warnings && importResult.warnings.length > 0 && (
            <div className="import-warnings">
              <h6>Warnings:</h6>
              {importResult.warnings.map((warning, index) => (
                <p key={index} className="warning-message">{warning}</p>
              ))}
            </div>
          )}
          
          <div className="preview-actions">
            <button
              type="button"
              className="apply-import primary"
              onClick={applyImport}
            >
              Apply Import
            </button>
            <button
              type="button"
              className="cancel-import secondary"
              onClick={() => {
                setImportResult(null);
                setImportPreview(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
  
  const renderPDFTab = () => (
    <div className="pdf-tab">
      <h4>Generate Character Sheet PDF</h4>
      <p className="tab-description">
        Generate a printable character sheet in PDF format.
      </p>
      
      <div className="pdf-options">
        <div className="option-group">
          <h5>Content Options</h5>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={pdfOptions.includeSpells}
              onChange={(e) => setPdfOptions(prev => ({ ...prev, includeSpells: e.target.checked }))}
            />
            Include Spells & Spellcasting
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={pdfOptions.includeBackground}
              onChange={(e) => setPdfOptions(prev => ({ ...prev, includeBackground: e.target.checked }))}
            />
            Include Background & Personality
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={pdfOptions.includeNotes}
              onChange={(e) => setPdfOptions(prev => ({ ...prev, includeNotes: e.target.checked }))}
            />
            Include Notes Section
          </label>
        </div>
        
        <div className="option-group">
          <h5>Theme</h5>
          {PDFGenerationService.getAvailableThemes().map(theme => (
            <label key={theme.value} className="radio-label">
              <input
                type="radio"
                value={theme.value}
                checked={pdfOptions.theme === theme.value}
                onChange={(e) => setPdfOptions(prev => ({ ...prev, theme: e.target.value as any }))}
              />
              <div className="theme-option">
                <strong>{theme.label}</strong>
                <span>{theme.description}</span>
              </div>
            </label>
          ))}
        </div>
        
        <div className="option-group">
          <h5>Format</h5>
          {PDFGenerationService.getAvailableFormats().map(format => (
            <label key={format.value} className="radio-label">
              <input
                type="radio"
                value={format.value}
                checked={pdfOptions.format === format.value}
                onChange={(e) => setPdfOptions(prev => ({ ...prev, format: e.target.value as any }))}
              />
              <div className="format-option">
                <strong>{format.label}</strong>
                <span>{format.description}</span>
              </div>
            </label>
          ))}
        </div>
      </div>
      
      <div className="pdf-actions">
        <button
          type="button"
          className="pdf-button primary"
          onClick={handlePDFGeneration}
        >
          Open Print Preview
        </button>
        <button
          type="button"
          className="pdf-button secondary"
          onClick={handlePDFDownload}
        >
          Download HTML Sheet
        </button>
      </div>
    </div>
  );
  
  return (
    <div className="character-export-step">
      <div className="step-header">
        <h3>Character Export & Import</h3>
        <p>Export your character for backup and sharing, import existing characters, or generate printable character sheets.</p>
      </div>
      
      <div className="export-import-tabs">
        <div className="tab-navigation">
          <button
            type="button"
            className={`tab-button ${activeTab === 'export' ? 'active' : ''}`}
            onClick={() => setActiveTab('export')}
          >
            Export
          </button>
          <button
            type="button"
            className={`tab-button ${activeTab === 'import' ? 'active' : ''}`}
            onClick={() => setActiveTab('import')}
          >
            Import
          </button>
          <button
            type="button"
            className={`tab-button ${activeTab === 'pdf' ? 'active' : ''}`}
            onClick={() => setActiveTab('pdf')}
          >
            PDF Sheet
          </button>
        </div>
        
        <div className="tab-content">
          {activeTab === 'export' && renderExportTab()}
          {activeTab === 'import' && renderImportTab()}
          {activeTab === 'pdf' && renderPDFTab()}
        </div>
      </div>
    </div>
  );
};

export default CharacterExportStep;