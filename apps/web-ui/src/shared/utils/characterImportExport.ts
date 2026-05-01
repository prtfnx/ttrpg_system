/**
 * Character Import/Export Utilities
 * 
 * Provides functionality to export characters to JSON files and import them back.
 * Includes validation, error handling, and sanitization following best practices.
 */

import type { Character } from '@/types';

// Version for file format compatibility
const EXPORT_FORMAT_VERSION = '1.0';

// Interface for exported character file
export interface ExportedCharacter {
  version: string;
  exportDate: string;
  character: Character;
  metadata: {
    exportedBy?: string;
    originalSessionId?: string;
    notes?: string;
  };
}

/**
 * Export a character to JSON format
 * 
 * @param character - The character to export
 * @param metadata - Optional metadata to include
 * @returns JSON string of the exported character
 */
export function exportCharacter(
  character: Character,
  metadata: { exportedBy?: string; notes?: string } = {}
): string {
  const exported: ExportedCharacter = {
    version: EXPORT_FORMAT_VERSION,
    exportDate: new Date().toISOString(),
    character: {
      ...character,
      // Strip runtime-only fields
      syncStatus: undefined,
    } as Character,
    metadata: {
      ...metadata,
      originalSessionId: character.sessionId,
    },
  };

  return JSON.stringify(exported, null, 2);
}

/**
 * Download a character as a JSON file
 * 
 * @param character - The character to download
 * @param metadata - Optional metadata
 */
export function downloadCharacterAsJSON(
  character: Character,
  metadata: { exportedBy?: string; notes?: string } = {}
): void {
  const json = exportCharacter(character, metadata);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  // Sanitize filename
  const safeName = character.name.replace(/[^a-z0-9_-]/gi, '_');
  const filename = `character_${safeName}_${Date.now()}.json`;
  
  // Create download link and trigger download
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  
  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export multiple characters as a single JSON file
 * 
 * @param characters - Array of characters to export
 * @param metadata - Optional metadata
 */
export function exportMultipleCharacters(
  characters: Character[],
  metadata: { exportedBy?: string; notes?: string } = {}
): string {
  const exported = {
    version: EXPORT_FORMAT_VERSION,
    exportDate: new Date().toISOString(),
    count: characters.length,
    characters: characters.map(char => ({
      ...char,
      syncStatus: undefined,
    } as Character)),
    metadata,
  };

  return JSON.stringify(exported, null, 2);
}

/**
 * Download multiple characters as a JSON file
 * 
 * @param characters - Array of characters to download
 * @param metadata - Optional metadata
 */
export function downloadMultipleCharactersAsJSON(
  characters: Character[],
  metadata: { exportedBy?: string; notes?: string } = {}
): void {
  const json = exportMultipleCharacters(characters, metadata);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const filename = `characters_backup_${Date.now()}.json`;
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Validation result for imported characters
 */
export interface ImportValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate an imported character file
 * 
 * @param data - Parsed JSON data
 * @returns Validation result with errors and warnings
 */
export function validateImportedCharacter(data: unknown): ImportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (typeof data !== 'object' || data === null) {
    errors.push('Import data must be an object');
    return { valid: false, errors, warnings };
  }

  const obj = data as Record<string, unknown>;

  // Check version
  if (!obj.version) {
    warnings.push('No version specified in import file');
  } else if (obj.version !== EXPORT_FORMAT_VERSION) {
    warnings.push(`Import file version (${obj.version}) differs from current version (${EXPORT_FORMAT_VERSION})`);
  }

  // Check required character fields
  if (!obj.character) {
    errors.push('No character data found in import file');
    return { valid: false, errors, warnings };
  }

  const char = obj.character as Record<string, unknown>;

  // Validate required fields
  if (!char.name || typeof char.name !== 'string') {
    errors.push('Character name is required and must be a string');
  }

  if (!char.data || typeof char.data !== 'object') {
    errors.push('Character data is required and must be an object');
  }

  // Validate optional but important fields
  if (char.ownerId !== undefined && typeof char.ownerId !== 'number') {
    warnings.push('ownerId should be a number, will be reset on import');
  }

  if (char.version !== undefined && typeof char.version !== 'number') {
    warnings.push('version should be a number, will be reset on import');
  }

  if (char.controlledBy !== undefined && !Array.isArray(char.controlledBy)) {
    warnings.push('controlledBy should be an array, will be reset on import');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Import a character from JSON data
 * 
 * Generates new IDs and resets session-specific data.
 * 
 * @param fileContent - JSON string from file
 * @param currentUserId - ID of user importing the character
 * @param currentSessionId - ID of current session
 * @returns Imported character with new ID, or null if invalid
 * @throws Error if JSON is invalid or validation fails
 */
export function importCharacterFromJSON(
  fileContent: string,
  currentUserId: number,
  currentSessionId: string
): { character: Character; warnings: string[] } {
  let data: Record<string, unknown>;
  
  try {
    data = JSON.parse(fileContent) as Record<string, unknown>;
  } catch (_error) {
    throw new Error('Invalid JSON file. Please select a valid character export file.');
  }

  // Validate
  const validation = validateImportedCharacter(data);
  
  if (!validation.valid) {
    throw new Error(`Invalid character file:\n${validation.errors.join('\n')}`);
  }

  // Generate new character with reset values
  const importedCharacter: Character = {
    ...(data.character as object),
    // Reset identity and session data
    id: `imported-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    sessionId: currentSessionId,
    ownerId: currentUserId,
    controlledBy: [currentUserId], // Importer gets control
    
    // Reset versioning
    version: 1,
    
    // Reset timestamps
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    
    // Reset sync status
    syncStatus: 'local' as const,
  } as Character;

  return {
    character: importedCharacter,
    warnings: validation.warnings,
  };
}

/**
 * Import multiple characters from a JSON file
 * 
 * @param fileContent - JSON string from file
 * @param currentUserId - ID of user importing
 * @param currentSessionId - ID of current session
 * @returns Array of imported characters with warnings
 */
export function importMultipleCharactersFromJSON(
  fileContent: string,
  currentUserId: number,
  currentSessionId: string
): { characters: Character[]; warnings: string[] } {
  let data: Record<string, unknown>;
  
  try {
    data = JSON.parse(fileContent) as Record<string, unknown>;
  } catch (_error) {
    throw new Error('Invalid JSON file. Please select a valid character export file.');
  }

  if (!data.characters || !Array.isArray(data.characters)) {
    throw new Error('Invalid multiple character export file. Expected "characters" array.');
  }

  const warnings: string[] = [];
  const characters: Character[] = [];

  const charList = data.characters as unknown[];

  for (let i = 0; i < charList.length; i++) {
    const charData = { character: charList[i], version: data.version };
    const validation = validateImportedCharacter(charData);
    
    if (!validation.valid) {
      warnings.push(`Character ${i + 1} skipped: ${validation.errors.join(', ')}`);
      continue;
    }

    warnings.push(...validation.warnings.map(w => `Character ${i + 1}: ${w}`));

    const importedChar: Character = {
      ...(charList[i] as object),
      id: `imported-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 11)}`,
      sessionId: currentSessionId,
      ownerId: currentUserId,
      controlledBy: [currentUserId],
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'local' as const,
    } as Character;

    characters.push(importedChar);
  }

  if (characters.length === 0) {
    throw new Error('No valid characters found in import file.');
  }

  return { characters, warnings };
}

/**
 * Trigger file picker for character import
 * 
 * @param onImport - Callback when file is selected and parsed
 * @param currentUserId - ID of current user
 * @param currentSessionId - ID of current session
 */
export function pickAndImportCharacter(
  onImport: (result: { character: Character; warnings: string[] }) => void,
  onError: (error: Error) => void,
  currentUserId: number,
  currentSessionId: string
): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  
  input.onchange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    
    if (!file) {
      return;
    }

    try {
      const content = await file.text();
      
      // Try single character first
      let result;
      try {
        result = importCharacterFromJSON(content, currentUserId, currentSessionId);
        onImport(result);
      } catch (_singleError) {
        // Try multiple characters
        const multiResult = importMultipleCharactersFromJSON(content, currentUserId, currentSessionId);
        
        // For multiple character import, call onImport for each character
        for (const character of multiResult.characters) {
          onImport({ character, warnings: multiResult.warnings });
        }
      }
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  };

  input.click();
}

/**
 * Clone a character (create a copy with new ID)
 * 
 * @param character - Character to clone
 * @param currentUserId - ID of user cloning the character
 * @returns New character with cloned data
 */
export function cloneCharacter(
  character: Character,
  currentUserId: number
): Character {
  const clonedCharacter: Character = {
    ...character,
    id: `cloned-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    name: `${character.name} (Copy)`,
    ownerId: currentUserId,
    controlledBy: [currentUserId],
    version: 1,
    // Deep clone the data object to prevent shared references
    data: JSON.parse(JSON.stringify(character.data)),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    syncStatus: 'local' as const,
  };

  return clonedCharacter;
}
