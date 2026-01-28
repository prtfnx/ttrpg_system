import { authService } from '@features/auth';
import { useProtocol } from '@lib/api';
import {
  cloneCharacter,
  downloadCharacterAsJSON,
  downloadMultipleCharactersAsJSON,
  pickAndImportCharacter,
  showToast
} from '@shared/utils';
import React, { useEffect, useState } from 'react';
import { useGameStore } from '../../../../store';
import type { Character } from '../../../../types';
import { genId } from './utils';

interface StatsEditForm {
  hp?: number;
  maxHp?: number;
  ac?: number;
  speed?: number;
  newCondition?: string;
}

interface PendingOperation {
  type: 'create' | 'update' | 'delete';
  characterId: string;
  originalState?: any;
  timeoutId: ReturnType<typeof setTimeout>;
}

export function useCharacterPanel() {
  const { protocol, isConnected } = useProtocol();
  const userInfo = authService.getUserInfo();
  const currentUserId = userInfo?.id || 0;
  
  const {
    characters,
    getSpritesForCharacter,
    linkSpriteToCharacter,
    canEditCharacter,
    canControlSprite,
    addCharacter,
    updateCharacter,
    removeCharacter,
    selectSprite,
    selectedSprites,
    sessionId,
    addSprite
  } = useGameStore();

  const [showWizard, setShowWizard] = useState(false);
  const [expandedCharId, setExpandedCharId] = useState<string | null>(null);
  const [wizardKey, setWizardKey] = useState(0);
  const [editingCharId, setEditingCharId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<StatsEditForm>({});
  const [shareDialogCharId, setShareDialogCharId] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<Set<string>>(new Set());
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [viewSheetCharId, setViewSheetCharId] = useState<string | null>(null);
  const [prevConnected, setPrevConnected] = useState<boolean | null>(null);

  const pendingOperationsRef = React.useRef<Map<string, PendingOperation>>(new Map());

  const selectedCharacter = characters.find(c => 
    getSpritesForCharacter(c.id).some(s => selectedSprites.includes(s.id))
  ) || null;

  // Auto-load characters
  useEffect(() => {
    if (protocol && isConnected && currentUserId) {
      protocol.requestCharacterList(currentUserId);
    }
  }, [protocol, isConnected, currentUserId]);

  // Connection notifications
  useEffect(() => {
    if (prevConnected !== null) {
      if (isConnected && !prevConnected) showToast.connectionRestored();
      else if (!isConnected && prevConnected) showToast.connectionLost();
    }
    setPrevConnected(isConnected ?? false);
  }, [isConnected, prevConnected]);

  // Cleanup pending operations
  useEffect(() => {
    return () => {
      pendingOperationsRef.current.forEach(op => clearTimeout(op.timeoutId));
      pendingOperationsRef.current.clear();
    };
  }, []);

  const registerPendingOperation = (characterId: string, type: PendingOperation['type'], originalState?: any) => {
    const existing = pendingOperationsRef.current.get(characterId);
    if (existing) clearTimeout(existing.timeoutId);

    const timeoutId = setTimeout(() => {
      const operation = pendingOperationsRef.current.get(characterId);
      if (!operation) return;

      if (type === 'create') {
        updateCharacter(characterId, { syncStatus: 'error' });
        showToast.error(`Failed to save character "${originalState?.name || 'character'}". Click retry to try again.`);
      } else if (type === 'update' && originalState) {
        updateCharacter(characterId, { ...originalState, syncStatus: 'error' });
        showToast.error(`Failed to update character "${originalState?.name || 'character'}". Changes reverted.`);
      } else if (type === 'delete' && originalState) {
        addCharacter({ ...originalState, syncStatus: 'error' });
        showToast.error(`Failed to delete character "${originalState?.name || 'character'}". Character restored.`);
      }

      pendingOperationsRef.current.delete(characterId);
    }, 5000);

    pendingOperationsRef.current.set(characterId, { type, characterId, originalState, timeoutId });
  };

  const confirmPendingOperation = (characterId: string) => {
    const operation = pendingOperationsRef.current.get(characterId);
    if (operation) {
      clearTimeout(operation.timeoutId);
      pendingOperationsRef.current.delete(characterId);
    }
  };

  // Server response listeners
  useEffect(() => {
    const handleCharacterUpdate = (event: CustomEvent) => {
      const { character_id } = event.detail;
      if (character_id) {
        confirmPendingOperation(character_id);
        const tempChars = characters.filter(c => c.id.startsWith('temp-') && c.syncStatus === 'syncing');
        tempChars.forEach(c => confirmPendingOperation(c.id));
      }
    };

    const handleCharacterSaved = (event: CustomEvent) => {
      const tempChars = characters.filter(c => c.id.startsWith('temp-') && c.syncStatus === 'syncing');
      tempChars.forEach(c => {
        confirmPendingOperation(c.id);
        if (event.detail?.success) showToast.success(`Character "${c.name}" saved successfully!`);
      });
      if (event.detail?.character_id) confirmPendingOperation(String(event.detail.character_id));
    };

    window.addEventListener('character-update' as any, handleCharacterUpdate);
    window.addEventListener('character-saved' as any, handleCharacterSaved);

    return () => {
      window.removeEventListener('character-update' as any, handleCharacterUpdate);
      window.removeEventListener('character-saved' as any, handleCharacterSaved);
    };
  }, [characters]);

  const handleCharacterClick = (charId: string) => {
    setExpandedCharId(expandedCharId === charId ? null : charId);
    const linkedSprites = getSpritesForCharacter(charId);
    if (linkedSprites.length > 0) selectSprite(linkedSprites[0].id, false);
  };

  const handleCreateCharacter = () => {
    setWizardKey(k => k + 1);
    setShowWizard(true);
  };

  const handleWizardFinish = async (data: any) => {
    const tempId = genId();
    
    if (!currentUserId) {
      showToast.error('Please log in to create characters');
      setShowWizard(false);
      return;
    }
    
    const newCharacter = {
      id: tempId,
      sessionId: sessionId?.toString() || '',
      name: data.name || `${data.race} ${data.class}`,
      ownerId: currentUserId,
      controlledBy: [],
      data,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'syncing' as const,
    };
    
    addCharacter(newCharacter);
    setShowWizard(false);
    setExpandedCharId(tempId);
    
    if (protocol && isConnected) {
      try {
        registerPendingOperation(tempId, 'create', newCharacter);
        protocol.saveCharacter(newCharacter, currentUserId);
      } catch (error) {
        confirmPendingOperation(tempId);
        updateCharacter(tempId, { syncStatus: 'error' });
        showToast.error(`Failed to save character "${newCharacter.name}". Click retry to try again.`);
      }
    } else {
      updateCharacter(tempId, { syncStatus: 'local' });
    }
  };

  const handleRetrySave = async (charId: string) => {
    const char = characters.find(c => c.id === charId);
    if (!char || !protocol || !isConnected) {
      showToast.error('Cannot retry - not connected to server');
      return;
    }

    updateCharacter(charId, { syncStatus: 'syncing' });

    try {
      registerPendingOperation(charId, 'create', char);
      protocol.saveCharacter(char as unknown as Record<string, unknown>, currentUserId);
      showToast.info(`Retrying save for "${char.name}"...`);
    } catch (error) {
      confirmPendingOperation(charId);
      updateCharacter(charId, { syncStatus: 'error' });
      showToast.error(`Retry failed for "${char.name}". Please try again.`);
    }
  };

  const handleAddToken = (charId: string) => {
    const character = characters.find(c => c.id === charId);
    const sprite = {
      id: genId(),
      tableId: '',
      characterId: charId,
      controlledBy: [],
      x: 0,
      y: 0,
      layer: 'tokens',
      texture: '',
      scale: { x: 1, y: 1 },
      rotation: 0,
      syncStatus: 'local' as const,
      name: character?.name || 'Unnamed Sprite',
    };
    addSprite(sprite);
    linkSpriteToCharacter(sprite.id, charId);
  };

  const handleDeleteCharacter = async (charId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Delete this character?')) return;
    
    const character = characters.find(c => c.id === charId);
    if (!character) return;
    
    removeCharacter(charId);
    if (expandedCharId === charId) setExpandedCharId(null);
    
    if (protocol && isConnected && !charId.startsWith('temp-')) {
      try {
        registerPendingOperation(charId, 'delete', character);
        protocol.deleteCharacter(charId);
      } catch (error) {
        confirmPendingOperation(charId);
        addCharacter(character);
        showToast.error(`Failed to delete character "${character.name}". Please try again.`);
      }
    }
  };

  const handleExportCharacter = (charId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const character = characters.find(c => c.id === charId);
    if (!character) return;
    
    try {
      downloadCharacterAsJSON(character, {
        exportedBy: `User ${character.ownerId}`,
        notes: `Exported from session ${sessionId || 'unknown'}`
      });
      showToast.success(`Character "${character.name}" exported successfully!`);
    } catch (error) {
      showToast.error('Failed to export character. Please try again.');
    }
  };

  const handleImportCharacter = () => {
    pickAndImportCharacter(
      ({ character, warnings }) => {
        addCharacter(character);
        setExpandedCharId(character.id);
        
        if (warnings.length > 0) {
          showToast.warning(`Character imported with warnings:\n${warnings.join('\n')}`);
        } else {
          showToast.success(`Character "${character.name}" imported successfully!`);
        }
        
        if (protocol && isConnected) {
          try {
            registerPendingOperation(character.id, 'create');
            protocol.saveCharacter({
              character_data: character,
              user_id: currentUserId,
              session_code: sessionId?.toString() || ''
            });
          } catch (error) {
            confirmPendingOperation(character.id);
            showToast.warning(`Character "${character.name}" imported locally only.`);
          }
        }
      },
      (error) => showToast.error(`Import failed: ${error.message}`),
      currentUserId,
      sessionId?.toString() || ''
    );
  };

  const handleCloneCharacter = async (charId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const character = characters.find(c => c.id === charId);
    if (!character) return;
    
    const clonedChar = cloneCharacter(character, currentUserId);
    addCharacter(clonedChar);
    setExpandedCharId(clonedChar.id);
    showToast.success(`Character "${character.name}" duplicated!`);
    
    if (protocol && isConnected) {
      try {
        registerPendingOperation(clonedChar.id, 'create');
        protocol.saveCharacter({
          character_data: clonedChar,
          user_id: currentUserId,
          session_code: sessionId?.toString() || ''
        });
      } catch (error) {
        confirmPendingOperation(clonedChar.id);
        showToast.warning(`Cloned character saved locally only.`);
      }
    }
  };

  const handleExportAllCharacters = () => {
    if (characters.length === 0) return showToast.info('No characters to export.');
    
    try {
      downloadMultipleCharactersAsJSON(characters, {
        exportedBy: `Session ${sessionId || 'unknown'}`,
        notes: `Bulk export of ${characters.length} characters`
      });
      showToast.success(`Exported ${characters.length} character(s) successfully!`);
    } catch (error) {
      showToast.error('Failed to export characters. Please try again.');
    }
  };

  const handleToggleBulkMode = () => {
    setBulkSelectMode(!bulkSelectMode);
    if (bulkSelectMode) setSelectedCharacterIds(new Set());
  };

  const handleToggleCharacterSelection = (charId: string) => {
    const newSelection = new Set(selectedCharacterIds);
    if (newSelection.has(charId)) newSelection.delete(charId);
    else newSelection.add(charId);
    setSelectedCharacterIds(newSelection);
  };

  const handleSelectAllCharacters = () => setSelectedCharacterIds(new Set(characters.map(c => c.id)));
  const handleDeselectAllCharacters = () => setSelectedCharacterIds(new Set());

  const handleBulkDelete = async () => {
    if (selectedCharacterIds.size === 0) return showToast.warning('No characters selected.');

    if (!window.confirm(`Are you sure you want to delete ${selectedCharacterIds.size} character(s)?`)) return;

    let successCount = 0;
    let errorCount = 0;

    for (const charId of selectedCharacterIds) {
      const char = characters.find(c => c.id === charId);
      if (!char || !canEditCharacter(charId, currentUserId)) {
        errorCount++;
        continue;
      }

      try {
        removeCharacter(charId);
        if (isConnected && protocol && !charId.startsWith('temp-')) {
          registerPendingOperation(charId, 'delete', char);
          protocol.deleteCharacter(charId);
        }
        successCount++;
      } catch (error) {
        addCharacter(char);
        errorCount++;
      }
    }

    setSelectedCharacterIds(new Set());
    setBulkSelectMode(false);

    if (successCount > 0) showToast.success(`Deleted ${successCount} character(s) successfully!`);
    if (errorCount > 0) showToast.error(`Failed to delete ${errorCount} character(s).`);
  };

  const handleBulkExport = () => {
    if (selectedCharacterIds.size === 0) return showToast.warning('No characters selected.');

    const selectedChars = characters.filter(c => selectedCharacterIds.has(c.id));
    
    try {
      downloadMultipleCharactersAsJSON(selectedChars, {
        exportedBy: `Session ${sessionId || 'unknown'}`,
        notes: `Bulk export of ${selectedChars.length} selected characters`
      });
      showToast.success(`Exported ${selectedChars.length} character(s) successfully!`);
      setSelectedCharacterIds(new Set());
    } catch (error) {
      showToast.error('Failed to export characters. Please try again.');
    }
  };

  const handleBulkShare = () => {
    if (selectedCharacterIds.size === 0) return showToast.warning('No characters selected.');
    showToast.info('Bulk permission management coming soon!');
  };

  const handleStartEdit = (char: Character) => {
    setEditingCharId(char.id);
    const stats = char.data?.stats || {};
    setEditFormData({
      hp: stats.hp || 0,
      maxHp: stats.maxHp || 10,
      ac: stats.ac || 10,
      speed: stats.speed || 30,
      newCondition: ''
    });
  };

  const handleCancelEdit = () => {
    setEditingCharId(null);
    setEditFormData({});
  };

  const handleSaveEdit = (charId: string) => {
    const char = characters.find(c => c.id === charId);
    if (!char) return;

    const charData = char.data || {};
    const currentStats = charData.stats || {};
    const statsUpdates: Record<string, unknown> = {};

    if (editFormData.hp !== undefined && editFormData.hp !== currentStats.hp) statsUpdates.hp = editFormData.hp;
    if (editFormData.maxHp !== undefined && editFormData.maxHp !== currentStats.maxHp) statsUpdates.maxHp = editFormData.maxHp;
    if (editFormData.ac !== undefined && editFormData.ac !== currentStats.ac) statsUpdates.ac = editFormData.ac;
    if (editFormData.speed !== undefined && editFormData.speed !== currentStats.speed) statsUpdates.speed = editFormData.speed;

    if (Object.keys(statsUpdates).length === 0) {
      handleCancelEdit();
      return;
    }

    const updates = {
      data: {
        ...charData,
        stats: { ...currentStats, ...statsUpdates }
      }
    };

    updateCharacter(charId, updates);

    if (protocol && isConnected) {
      updateCharacter(charId, { syncStatus: 'syncing' });
      protocol.updateCharacter(charId, updates, char.version);
      registerPendingOperation(charId, 'update', charData);
    }

    handleCancelEdit();
  };

  const handleAddCondition = (charId: string) => {
    const char = characters.find(c => c.id === charId);
    if (!char || !editFormData.newCondition?.trim()) return;

    const charData = char.data || {};
    const currentConditions = charData.conditions || [];
    const newCondition = editFormData.newCondition.trim();
    
    if (currentConditions.includes(newCondition)) {
      return showToast.warning(`Condition "${newCondition}" already exists on ${char.name}`);
    }

    const updates = {
      data: {
        ...charData,
        conditions: [...currentConditions, newCondition]
      }
    };

    updateCharacter(charId, updates);

    if (protocol && isConnected) {
      updateCharacter(charId, { syncStatus: 'syncing' });
      protocol.updateCharacter(charId, updates, char.version);
    }

    setEditFormData({ ...editFormData, newCondition: '' });
  };

  const handleRemoveCondition = (charId: string, condition: string) => {
    const char = characters.find(c => c.id === charId);
    if (!char) return;

    const charData = char.data || {};
    const updates = {
      data: {
        ...charData,
        conditions: (charData.conditions || []).filter((c: string) => c !== condition)
      }
    };

    updateCharacter(charId, updates);

    if (protocol && isConnected) {
      updateCharacter(charId, { syncStatus: 'syncing' });
      protocol.updateCharacter(charId, updates, char.version);
    }
  };

  const handleShareCharacter = (charId: string) => setShareDialogCharId(charId);
  const handleViewSheet = (charId: string) => setViewSheetCharId(charId);

  const handleSavePermissions = (charId: string, controlledBy: number[]) => {
    const char = characters.find(c => c.id === charId);
    if (!char) return;

    const updates = { controlledBy };
    updateCharacter(charId, updates);

    if (protocol && isConnected) {
      updateCharacter(charId, { syncStatus: 'syncing' });
      protocol.updateCharacter(charId, updates, char.version);
      showToast.success(`Updated permissions for "${char.name}"`);
    }
  };

  const handleDragStart = (e: React.DragEvent, charId: string) => {
    e.dataTransfer.setData('application/x-character-id', charId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return {
    // State
    characters,
    isConnected,
    currentUserId,
    showWizard,
    expandedCharId,
    wizardKey,
    editingCharId,
    editFormData,
    shareDialogCharId,
    searchFilter,
    selectedCharacterIds,
    bulkSelectMode,
    viewSheetCharId,
    selectedCharacter,

    // Actions
    handleCharacterClick,
    handleCreateCharacter,
    handleWizardFinish,
    handleRetrySave,
    handleAddToken,
    handleDeleteCharacter,
    handleExportCharacter,
    handleImportCharacter,
    handleCloneCharacter,
    handleExportAllCharacters,
    handleToggleBulkMode,
    handleToggleCharacterSelection,
    handleSelectAllCharacters,
    handleDeselectAllCharacters,
    handleBulkDelete,
    handleBulkExport,
    handleBulkShare,
    handleStartEdit,
    handleCancelEdit,
    handleSaveEdit,
    handleAddCondition,
    handleRemoveCondition,
    handleShareCharacter,
    handleViewSheet,
    handleSavePermissions,
    handleDragStart,
    setShowWizard,
    setExpandedCharId,
    setEditFormData,
    setShareDialogCharId,
    setSearchFilter,
    setViewSheetCharId,
    updateCharacter,

    // Utils
    getSpritesForCharacter,
    canEditCharacter,
    canControlSprite,
    protocol,
    sessionId,
  };
}
