import { CharacterExportService } from '@features/character/services/characterExport.service';
import { CharacterImportService, type ImportResult } from '@features/character/services/characterImport.service';
import { useCallback, useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import styles from './CharacterExportStep.module.css';
import type { WizardFormData } from './WizardFormData';

interface CharacterExportStepProps {
  onNext?: () => void;
  onBack?: () => void;
}

type ExportFormat = 'd5e' | 'dndBeyond' | 'characterSheet';

export function CharacterExportStep({ onNext: _onNext, onBack: _onBack }: CharacterExportStepProps = {}) {
  const { getValues, setValue } = useFormContext<WizardFormData>();
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('d5e');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<WizardFormData | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const characterData = getValues();

  const handleExport = useCallback(() => {
    const additionalData = {
      level: 1,
      exportedBy: 'Character Creation Wizard',
      notes: `Exported on ${new Date().toLocaleDateString()}`,
    };
    let exportData: unknown;
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
        setImportResult({ success: false, errors: validation.errors });
        return;
      }
      const result = await CharacterImportService.importFromFile(file);
      setImportResult(result);
      if (result.success && result.character) setImportPreview(result.character);
    } catch (error) {
      setImportResult({ success: false, errors: [`Import failed: ${(error as Error).message}`] });
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
      if (result.success && result.character) setImportPreview(result.character);
    } catch (error) {
      setImportResult({ success: false, errors: [`URL import failed: ${(error as Error).message}`] });
    } finally {
      setIsImporting(false);
    }
  }, []);

  const applyImport = useCallback(() => {
    if (!importPreview) return;
    const backup = CharacterImportService.createBackup(characterData);
    localStorage.setItem('character-backup', backup);
    Object.entries(importPreview).forEach(([key, value]) => {
      setValue(key as keyof WizardFormData, value);
    });
    setImportResult(null);
    setImportPreview(null);
    setActiveTab('export');
  }, [importPreview, characterData, setValue]);

  return (
    <div className="character-export-step">
      <div className="step-header">
        <h3>Character Export & Import</h3>
        <p>Export your character for backup and sharing, or import an existing character.</p>
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
        </div>

        <div className="tab-content">
          {activeTab === 'export' && (
            <div className="export-tab">
              <h4>Export Character Data</h4>
              <div className="export-format-selection">
                <label>
                  <input type="radio" value="d5e" checked={exportFormat === 'd5e'} onChange={(e) => setExportFormat(e.target.value as ExportFormat)} />
                  <div className="format-option">
                    <strong>D&D 5e Complete</strong>
                    <span>Full character data with all calculations and computed values</span>
                  </div>
                </label>
                <label>
                  <input type="radio" value="dndBeyond" checked={exportFormat === 'dndBeyond'} onChange={(e) => setExportFormat(e.target.value as ExportFormat)} />
                  <div className="format-option">
                    <strong>D&D Beyond Compatible</strong>
                    <span>Format compatible with D&D Beyond character sheets</span>
                  </div>
                </label>
                <label>
                  <input type="radio" value="characterSheet" checked={exportFormat === 'characterSheet'} onChange={(e) => setExportFormat(e.target.value as ExportFormat)} />
                  <div className="format-option">
                    <strong>Character Sheet Data</strong>
                    <span>Simplified format focused on character sheet display</span>
                  </div>
                </label>
              </div>

              <div className={styles.exportPreview}>
                <h5>Character Summary</h5>
                <div>
                  <div><strong>Name:</strong> {characterData.name || 'Unnamed'}</div>
                  <div><strong>Race:</strong> {characterData.race}</div>
                  <div><strong>Class:</strong> {characterData.class}</div>
                  <div><strong>Background:</strong> {characterData.background}</div>
                </div>
              </div>

              <button
                type="button"
                className="export-button primary"
                onClick={handleExport}
                disabled={!characterData.name || !characterData.race || !characterData.class}
              >
                Export Character Data
              </button>
            </div>
          )}

          {activeTab === 'import' && (
            <div className="import-tab">
              <h4>Import Character</h4>
              <p>Import from a JSON file or URL. Supported formats: D&D 5e, D&D Beyond, Roll20.</p>

              <div className="import-methods">
                <div className="import-method">
                  <h5>From File</h5>
                  <input ref={fileInputRef} type="file" accept=".json" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileImport(f); }} style={{ display: 'none' }} />
                  <button type="button" onClick={() => fileInputRef.current?.click()}>Choose JSON File</button>
                </div>
                <div className="import-method">
                  <h5>From URL</h5>
                  <input ref={urlInputRef} type="url" placeholder="Enter character data URL..." />
                  <button type="button" onClick={() => { const url = urlInputRef.current?.value; if (url) handleUrlImport(url); }}>Import from URL</button>
                </div>
              </div>

              {isImporting && <div className="import-status">Importing character...</div>}

              {importResult && !importResult.success && (
                <div className="import-error">
                  <strong>Import Failed</strong>
                  {importResult.errors?.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}

              {importResult?.success && importPreview && (
                <div className="import-preview">
                  <h5>Preview</h5>
                  <div>
                    <div><strong>Name:</strong> {importPreview.name}</div>
                    <div><strong>Race:</strong> {importPreview.race}</div>
                    <div><strong>Class:</strong> {importPreview.class}</div>
                    <div><strong>Background:</strong> {importPreview.background}</div>
                  </div>
                  {importResult.warnings?.map((w, i) => <p key={i} className="warning">{w}</p>)}
                  <div className="preview-actions">
                    <button type="button" onClick={applyImport}>Apply Import</button>
                    <button type="button" onClick={() => { setImportResult(null); setImportPreview(null); }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CharacterExportStep;