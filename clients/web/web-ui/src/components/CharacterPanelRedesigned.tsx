import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { authService } from '../services/auth.service';
import { useProtocol } from '../services/ProtocolContext';
import { useGameStore } from '../store';
import type { Character } from '../types';
import {
  cloneCharacter,
  downloadCharacterAsJSON,
  downloadMultipleCharactersAsJSON,
  pickAndImportCharacter
} from '../utils/characterImportExport';
import { showToast } from '../utils/toast';
import './CharacterPanelRedesigned.css';
import { CharacterSheet } from './CharacterSheet';
import { EnhancedCharacterWizard } from './CharacterWizard/EnhancedCharacterWizard';
import { ShareCharacterDialog } from './ShareCharacterDialog';

function genId(): string {
  return 'temp-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
}

// Sync status icon components
const SyncStatusIcon: React.FC<{ status?: 'local' | 'syncing' | 'synced' | 'error' }> = ({ status }) => {
  if (!status || status === 'synced') return null; // Don't show anything for synced (clean UI)
  
  const statusConfig = {
    local: { icon: '📝', tooltip: 'Not synced - changes are local only', color: '#fbbf24' },
    syncing: { icon: '⟳', tooltip: 'Syncing with server...', color: '#3b82f6' },
    error: { icon: '⚠️', tooltip: 'Sync failed - click retry button to try again', color: '#ef4444' },
  };
  
  const config = statusConfig[status];
  
  return (
    <span 
      className={`sync-status-icon ${status}`} 
      title={config.tooltip}
      style={{ color: config.color, fontSize: '14px', marginLeft: '4px' }}
    >
      {status === 'syncing' ? (
        <span className="sync-spinner">{config.icon}</span>
      ) : (
        config.icon
      )}
    </span>
  );
};


export function CharacterPanelRedesigned() {
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
    sessionId
  } = useGameStore();
  
  const { protocol, isConnected } = useProtocol();
  
  // Get authenticated user ID
  const userInfo = authService.getUserInfo();
  const currentUserId = userInfo?.id || 0;
  
  // Auto-load characters when connected
  useEffect(() => {
    if (protocol && isConnected && currentUserId) {
      console.log('🔄 Loading character list for user:', currentUserId);
      protocol.requestCharacterList(currentUserId);
    }
  }, [protocol, isConnected, currentUserId]);

  // Connection status notifications
  const [prevConnected, setPrevConnected] = useState<boolean | null>(null);
  useEffect(() => {
    if (prevConnected !== null) {
      if (isConnected && !prevConnected) {
        showToast.connectionRestored();
      } else if (!isConnected && prevConnected) {
        showToast.connectionLost();
      }
    }
    setPrevConnected(isConnected ?? false);
  }, [isConnected, prevConnected]);
  
  // Pending operations tracker for rollback
  const pendingOperationsRef = React.useRef<Map<string, {
    type: 'create' | 'update' | 'delete';
    characterId: string;
    originalState?: any;
    timeoutId: ReturnType<typeof setTimeout>;
  }>>(new Map());
  
  // Cleanup pending operations on unmount
  useEffect(() => {
    return () => {
      // Clear all pending timeouts
      pendingOperationsRef.current.forEach(op => clearTimeout(op.timeoutId));
      pendingOperationsRef.current.clear();
    };
  }, []);
  
  // Register a pending operation with automatic rollback after 5 seconds
  const registerPendingOperation = (
    characterId: string,
    type: 'create' | 'update' | 'delete',
    originalState?: any
  ) => {
    // Clear any existing timeout for this character
    const existing = pendingOperationsRef.current.get(characterId);
    if (existing) {
      clearTimeout(existing.timeoutId);
    }
    
    // Set new timeout for rollback
    const timeoutId = setTimeout(() => {
      console.warn(`Operation timeout for character ${characterId}, marking as error...`);
      
      const operation = pendingOperationsRef.current.get(characterId);
      if (!operation) return;
      
      // For CREATE operations, DON'T delete the character - keep it with error status
      if (type === 'create') {
        // Keep the character but mark as error so user can retry
        updateCharacter(characterId, { syncStatus: 'error' });
        console.log(`Character ${characterId} save failed, kept in UI with error status`);
        showToast.error(`Failed to save character "${originalState?.name || 'character'}". Click retry to try again.`);
      } else if (type === 'update' && originalState) {
        // Restore original state for updates
        updateCharacter(characterId, { ...originalState, syncStatus: 'error' });
        console.log(`Rolled back update operation for ${characterId}`);
        showToast.error(`Failed to update character "${originalState?.name || 'character'}". Changes reverted.`);
      } else if (type === 'delete' && originalState) {
        // Re-add the deleted character
        addCharacter({ ...originalState, syncStatus: 'error' });
        console.log(`Rolled back delete operation for ${characterId}`);
        showToast.error(`Failed to delete character "${originalState?.name || 'character'}". Character restored.`);
      }
      
      // Clean up
      pendingOperationsRef.current.delete(characterId);
    }, 5000); // 5 second timeout
    
    // Store the pending operation
    pendingOperationsRef.current.set(characterId, {
      type,
      characterId,
      originalState,
      timeoutId
    });
  };
  
  // Confirm a pending operation (server responded successfully)
  const confirmPendingOperation = (characterId: string) => {
    const operation = pendingOperationsRef.current.get(characterId);
    if (operation) {
      clearTimeout(operation.timeoutId);
      pendingOperationsRef.current.delete(characterId);
      console.log(`Confirmed operation for ${characterId}`);
    }
  };
  
  // Listen for successful server responses to confirm operations
  useEffect(() => {
    const handleCharacterUpdate = (event: CustomEvent) => {
      const { character_id } = event.detail;
      if (character_id) {
        confirmPendingOperation(character_id);
        
        // Also confirm by temp ID if it's a create operation
        const tempChars = characters.filter(c => c.id.startsWith('temp-') && c.syncStatus === 'syncing');
        tempChars.forEach(c => confirmPendingOperation(c.id));
      }
    };
    
    const handleCharacterSaved = (event: CustomEvent) => {
      console.log('🎉 Character saved event received:', event.detail);
      
      // Confirm all pending create operations for temp characters
      const tempChars = characters.filter(c => c.id.startsWith('temp-') && c.syncStatus === 'syncing');
      tempChars.forEach(c => {
        console.log(`✅ Confirming pending operation for temp character: ${c.id}`);
        confirmPendingOperation(c.id);
        
        // Show success toast
        if (event.detail?.success) {
          showToast.success(`Character "${c.name}" saved successfully!`);
        }
      });
      
      // Also confirm by real character_id if provided
      if (event.detail?.character_id) {
        confirmPendingOperation(String(event.detail.character_id));
      }
    };
    
    window.addEventListener('character-update' as any, handleCharacterUpdate);
    window.addEventListener('character-saved' as any, handleCharacterSaved);
    
    return () => {
      window.removeEventListener('character-update' as any, handleCharacterUpdate);
      window.removeEventListener('character-saved' as any, handleCharacterSaved);
    };
  }, [characters, confirmPendingOperation]);
  
  // Drag-and-drop: start drag with character id
  const handleDragStart = (e: React.DragEvent, charId: string) => {
    e.dataTransfer.setData('application/x-character-id', charId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  // ...existing code...
  const [showWizard, setShowWizard] = useState(false);
  const [expandedCharId, setExpandedCharId] = useState<string | null>(null);
  const [wizardKey, setWizardKey] = useState(0);
  const [editingCharId, setEditingCharId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<{
    hp?: number;
    maxHp?: number;
    ac?: number;
    speed?: number;
    newCondition?: string;
  }>({});
  const [shareDialogCharId, setShareDialogCharId] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<Set<string>>(new Set());
  const [bulkSelectMode, setBulkSelectMode] = useState<boolean>(false);
  const [viewSheetCharId, setViewSheetCharId] = useState<string | null>(null);

  const selectedCharacter = characters.find(c => {
    return getSpritesForCharacter(c.id).some(s => selectedSprites.includes(s.id));
  }) || null;

  const handleCharacterClick = (charId: string) => {
    setExpandedCharId(expandedCharId === charId ? null : charId);
    // Select first linked sprite if any
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
      console.error('Cannot create character: No authenticated user');
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
    
    // Optimistic update: Add to UI immediately
    addCharacter(newCharacter);
    setShowWizard(false);
    setExpandedCharId(tempId);
    
    // Send to server if connected
    if (protocol && isConnected) {
      try {
        // Register pending operation - will mark as error if timeout, but won't delete
        registerPendingOperation(tempId, 'create', newCharacter);
        
        console.log('💾 Saving character to server:', newCharacter.name, 'userId:', currentUserId);
        protocol.saveCharacter(newCharacter, currentUserId);
        
        // Server will broadcast CHARACTER_UPDATE with real ID
        // Protocol handlers will update the character with real ID and syncStatus:'synced'
        // The pending operation will be confirmed when server responds
      } catch (error) {
        console.error('Failed to save character:', error);
        // Clear pending operation and mark as error (don't delete)
        confirmPendingOperation(tempId);
        updateCharacter(tempId, { syncStatus: 'error' });
        showToast.error(`Failed to save character "${newCharacter.name}". Click retry to try again.`);
      }
    } else {
      // No connection - mark as local only
      updateCharacter(tempId, { syncStatus: 'local' });
      console.warn('Character created locally - not connected to server');
    }
  };

  // Retry saving a failed character
  const handleRetrySave = async (charId: string) => {
    const char = characters.find(c => c.id === charId);
    if (!char) return;

    if (!protocol || !isConnected) {
      showToast.error('Cannot retry - not connected to server');
      return;
    }

    // Update to syncing status
    updateCharacter(charId, { syncStatus: 'syncing' });

    try {
      // Register pending operation
      registerPendingOperation(charId, 'create', char);
      
      console.log('🔄 Retrying character save:', char.name, 'userId:', currentUserId);
      protocol.saveCharacter(char as unknown as Record<string, unknown>, currentUserId);
      
      showToast.info(`Retrying save for "${char.name}"...`);
    } catch (error) {
      console.error('Failed to retry character save:', error);
      confirmPendingOperation(charId);
      updateCharacter(charId, { syncStatus: 'error' });
      showToast.error(`Retry failed for "${char.name}". Please try again.`);
    }
  };

  const handleAddToken = (charId: string) => {
    // Create a new sprite linked to this character
    const spriteId = genId();
    const character = characters.find(c => c.id === charId);
    const sprite = {
      id: spriteId,
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
    useGameStore.getState().addSprite(sprite);
    linkSpriteToCharacter(spriteId, charId);
  };

  const handleDeleteCharacter = async (charId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Delete this character?')) return;
    
    const character = characters.find(c => c.id === charId);
    if (!character) return;
    
    // Optimistic update: Remove from UI immediately
    removeCharacter(charId);
    if (expandedCharId === charId) setExpandedCharId(null);
    
    // Send to server if connected and not a temp ID
    if (protocol && isConnected && !charId.startsWith('temp-')) {
      try {
        // Register pending delete operation with automatic rollback
        registerPendingOperation(charId, 'delete', character);
        
        protocol.deleteCharacter(charId);
        // Server will broadcast CHARACTER_UPDATE with operation:'delete'
        // Pending operation will be confirmed when server responds
      } catch (error) {
        console.error('Failed to delete character:', error);
        // Clear pending operation and rollback immediately
        confirmPendingOperation(charId);
        addCharacter(character);
        showToast.error(`Failed to delete character "${character.name}". Please try again.`);
      }
    } else if (charId.startsWith('temp-')) {
      // Temp character - just remove locally
      console.log('Removed local-only character');
    }
  };

  // === IMPORT/EXPORT HANDLERS ===
  
  // Export character to JSON file
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
      console.error('Failed to export character:', error);
      showToast.error('Failed to export character. Please try again.');
    }
  };

  // Import character from JSON file
  const handleImportCharacter = () => {
    const currentSessionId = sessionId?.toString() || '';
    
    pickAndImportCharacter(
      ({ character, warnings }) => {
        // Add imported character with optimistic update
        addCharacter(character);
        setExpandedCharId(character.id);
        
        // Show warnings if any
        if (warnings.length > 0) {
          showToast.warning(`Character imported with warnings:\n${warnings.join('\n')}`);
        } else {
          showToast.success(`Character "${character.name}" imported successfully!`);
        }
        
        // Send to server if connected
        if (protocol && isConnected) {
          try {
            registerPendingOperation(character.id, 'create');
            protocol.saveCharacter({
              character_data: character,
              user_id: currentUserId,
              session_code: currentSessionId
            });
          } catch (error) {
            console.error('Failed to save imported character to server:', error);
            confirmPendingOperation(character.id);
            showToast.warning(`Character "${character.name}" imported locally only. Will sync when connected.`);
          }
        }
      },
      (error) => {
        showToast.error(`Import failed: ${error.message}`);
      },
      currentUserId,
      currentSessionId
    );
  };

  // Clone/duplicate character
  const handleCloneCharacter = async (charId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const character = characters.find(c => c.id === charId);
    if (!character) return;
    
    const clonedChar = cloneCharacter(character, currentUserId);
    
    // Add cloned character with optimistic update
    addCharacter(clonedChar);
    setExpandedCharId(clonedChar.id);
    showToast.success(`Character "${character.name}" duplicated!`);
    
    // Send to server if connected
    if (protocol && isConnected) {
      try {
        registerPendingOperation(clonedChar.id, 'create');
        protocol.saveCharacter({
          character_data: clonedChar,
          user_id: currentUserId,
          session_code: sessionId?.toString() || ''
        });
      } catch (error) {
        console.error('Failed to save cloned character to server:', error);
        confirmPendingOperation(clonedChar.id);
        showToast.warning(`Cloned character saved locally only. Will sync when connected.`);
      }
    }
  };

  // Export all characters
  const handleExportAllCharacters = () => {
    if (characters.length === 0) {
      showToast.info('No characters to export.');
      return;
    }
    
    try {
      downloadMultipleCharactersAsJSON(characters, {
        exportedBy: `Session ${sessionId || 'unknown'}`,
        notes: `Bulk export of ${characters.length} characters`
      });
      showToast.success(`Exported ${characters.length} character(s) successfully!`);
    } catch (error) {
      console.error('Failed to export characters:', error);
      showToast.error('Failed to export characters. Please try again.');
    }
  };

  // === BULK SELECTION HANDLERS ===
  const handleToggleBulkMode = () => {
    setBulkSelectMode(!bulkSelectMode);
    if (bulkSelectMode) {
      // Exiting bulk mode, clear selections
      setSelectedCharacterIds(new Set());
    }
  };

  const handleToggleCharacterSelection = (charId: string) => {
    const newSelection = new Set(selectedCharacterIds);
    if (newSelection.has(charId)) {
      newSelection.delete(charId);
    } else {
      newSelection.add(charId);
    }
    setSelectedCharacterIds(newSelection);
  };

  const handleSelectAllCharacters = () => {
    const allCharIds = characters.map(c => c.id);
    setSelectedCharacterIds(new Set(allCharIds));
  };

  const handleDeselectAllCharacters = () => {
    setSelectedCharacterIds(new Set());
  };

  const handleBulkDelete = async () => {
    if (selectedCharacterIds.size === 0) {
      showToast.warning('No characters selected.');
      return;
    }

    const count = selectedCharacterIds.size;
    const confirmed = window.confirm(
      `Are you sure you want to delete ${count} character(s)? This action cannot be undone.`
    );

    if (!confirmed) return;

    let successCount = 0;
    let errorCount = 0;

    for (const charId of selectedCharacterIds) {
      const char = characters.find(c => c.id === charId);
      if (!char) continue;

      // Check permissions
      if (!canEditCharacter(charId, currentUserId)) {
        errorCount++;
        continue;
      }

      try {
        // Optimistic delete
        removeCharacter(charId);

        // Send to server if connected and not a temp ID
        if (isConnected && protocol && !charId.startsWith('temp-')) {
          registerPendingOperation(charId, 'delete', char);
          protocol.deleteCharacter(charId);
        }
        successCount++;
      } catch (error) {
        console.error(`Failed to delete character ${charId}:`, error);
        // Rollback on error
        addCharacter(char);
        errorCount++;
      }
    }

    // Clear selections and exit bulk mode
    setSelectedCharacterIds(new Set());
    setBulkSelectMode(false);

    // Show summary toast
    if (successCount > 0) {
      showToast.success(`Deleted ${successCount} character(s) successfully!`);
    }
    if (errorCount > 0) {
      showToast.error(`Failed to delete ${errorCount} character(s).`);
    }
  };

  const handleBulkExport = () => {
    if (selectedCharacterIds.size === 0) {
      showToast.warning('No characters selected.');
      return;
    }

    const selectedChars = characters.filter(c => selectedCharacterIds.has(c.id));
    
    try {
      downloadMultipleCharactersAsJSON(selectedChars, {
        exportedBy: `Session ${sessionId || 'unknown'}`,
        notes: `Bulk export of ${selectedChars.length} selected characters`
      });
      showToast.success(`Exported ${selectedChars.length} character(s) successfully!`);
      
      // Optionally clear selections
      setSelectedCharacterIds(new Set());
    } catch (error) {
      console.error('Failed to export selected characters:', error);
      showToast.error('Failed to export characters. Please try again.');
    }
  };

  const handleBulkShare = () => {
    if (selectedCharacterIds.size === 0) {
      showToast.warning('No characters selected.');
      return;
    }

    showToast.info('Bulk permission management coming soon!');
    // TODO: Implement bulk permission dialog
  };

  // === EDIT MODE HANDLERS ===
  const handleStartEdit = (char: Character) => {
    setEditingCharId(char.id);
    // Character data is stored in char.data object
    const charData = char.data || {};
    const stats = charData.stats || {};
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

    // Build delta updates for data.stats
    const statsUpdates: Record<string, unknown> = {};

    if (editFormData.hp !== undefined && editFormData.hp !== currentStats.hp) {
      statsUpdates.hp = editFormData.hp;
    }
    if (editFormData.maxHp !== undefined && editFormData.maxHp !== currentStats.maxHp) {
      statsUpdates.maxHp = editFormData.maxHp;
    }
    if (editFormData.ac !== undefined && editFormData.ac !== currentStats.ac) {
      statsUpdates.ac = editFormData.ac;
    }
    if (editFormData.speed !== undefined && editFormData.speed !== currentStats.speed) {
      statsUpdates.speed = editFormData.speed;
    }

    // Only send update if there are changes
    if (Object.keys(statsUpdates).length === 0) {
      handleCancelEdit();
      return;
    }

    // Build updates object with nested data.stats
    const updates = {
      data: {
        ...charData,
        stats: { ...currentStats, ...statsUpdates }
      }
    };

    // Optimistic update locally
    updateCharacter(charId, updates);

    // Send to server if connected
    if (protocol && isConnected) {
      updateCharacter(charId, { syncStatus: 'syncing' });
      protocol.updateCharacter(charId, updates, char.version);

      // Register rollback timer
      const rollbackTimer = setTimeout(() => {
        console.warn(`⏱️ Character update timeout for ${charId}, rolling back...`);
        // Rollback to original values
        updateCharacter(charId, {
          data: charData,
          syncStatus: 'error'
        });
        showToast.characterUpdateFailed(char.name, 'Server timeout');
      }, 5000);

      pendingOperationsRef.current.set(charId, {
        type: 'update',
        characterId: charId,
        originalState: charData,
        timeoutId: rollbackTimer
      });

      // Listen for confirmation
      const handleUpdateConfirm = (e: Event) => {
        const customEvent = e as CustomEvent;
        if (customEvent.detail?.character_id === charId && customEvent.detail?.success) {
          const op = pendingOperationsRef.current.get(charId);
          if (op && op.type === 'update') {
            clearTimeout(op.timeoutId);
            pendingOperationsRef.current.delete(charId);
            console.log(`✅ Character update confirmed: ${charId}`);
          }
        }
      };

      window.addEventListener('character-update-response', handleUpdateConfirm, { once: true });
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
      showToast.warning(`Condition "${newCondition}" already exists on ${char.name}`);
      return;
    }

    const updates = {
      data: {
        ...charData,
        conditions: [...currentConditions, newCondition]
      }
    };

    // Optimistic update
    updateCharacter(charId, updates);

    // Send to server
    if (protocol && isConnected) {
      updateCharacter(charId, { syncStatus: 'syncing' });
      protocol.updateCharacter(charId, updates, char.version);
    }

    // Clear input
    setEditFormData({ ...editFormData, newCondition: '' });
  };

  const handleRemoveCondition = (charId: string, condition: string) => {
    const char = characters.find(c => c.id === charId);
    if (!char) return;

    const charData = char.data || {};
    const currentConditions = charData.conditions || [];

    const updates = {
      data: {
        ...charData,
        conditions: currentConditions.filter((c: string) => c !== condition)
      }
    };

    // Optimistic update
    updateCharacter(charId, updates);

    // Send to server
    if (protocol && isConnected) {
      updateCharacter(charId, { syncStatus: 'syncing' });
      protocol.updateCharacter(charId, updates, char.version);
    }
  };

  // === PERMISSIONS HANDLERS ===
  const handleShareCharacter = (charId: string) => {
    setShareDialogCharId(charId);
  };

  const handleViewSheet = (charId: string) => {
    setViewSheetCharId(charId);
  };

  const handleSavePermissions = (charId: string, controlledBy: number[]) => {
    const char = characters.find(c => c.id === charId);
    if (!char) return;

    const updates = {
      controlledBy
    };

    // Optimistic update
    updateCharacter(charId, updates);

    // Send to server
    if (protocol && isConnected) {
      updateCharacter(charId, { syncStatus: 'syncing' });
      protocol.updateCharacter(charId, updates, char.version);
      showToast.success(`Updated permissions for "${char.name}"`);
    }
  };

  // Mock users list - in real app, this would come from the session/server
  const mockUsers = [
    { id: 1, name: 'Player 1' },
    { id: 2, name: 'Player 2' },
    { id: 3, name: 'DM' },
  ];

  return (
    <div className="character-panel-redesigned">
      {/* Connection status banner */}
      {!isConnected && (
        <div className="connection-banner offline" title="Not connected to server - characters will be saved locally">
          ⚠️ Offline - Changes saved locally only
        </div>
      )}
      
      {/* Header with single create button */}
      <div className="panel-header">
        <h2>Characters</h2>
        {isConnected && (
          <span className="connection-status connected" title="Connected to server">🟢</span>
        )}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            className="action-btn"
            onClick={handleImportCharacter}
            title="Import character from JSON file"
            style={{ fontSize: '12px', padding: '6px 12px' }}
          >
            📤 Import
          </button>
          {characters.length > 0 && (
            <>
              <button
                className="action-btn"
                onClick={handleExportAllCharacters}
                title="Export all characters to JSON file"
                style={{ fontSize: '12px', padding: '6px 12px' }}
              >
                📥 Export All
              </button>
              <button
                className={`action-btn ${bulkSelectMode ? 'active' : ''}`}
                onClick={handleToggleBulkMode}
                title={bulkSelectMode ? "Exit bulk selection mode" : "Enter bulk selection mode"}
                style={{ fontSize: '12px', padding: '6px 12px' }}
              >
                {bulkSelectMode ? '✓ Done' : '☑ Select'}
              </button>
            </>
          )}
          <button
            className="create-btn"
            onClick={handleCreateCharacter}
            title="Create New Character"
            aria-label="Create New Character"
            data-testid="create-character-btn"
          >
            +
          </button>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {bulkSelectMode && (
        <div className="bulk-actions-bar">
          <div className="bulk-actions-left">
            <span className="bulk-selection-count">
              {selectedCharacterIds.size} selected
            </span>
            <button className="bulk-action-link" onClick={handleSelectAllCharacters}>
              Select All
            </button>
            <button className="bulk-action-link" onClick={handleDeselectAllCharacters}>
              Deselect All
            </button>
          </div>
          <div className="bulk-actions-right">
            {selectedCharacterIds.size > 0 && (
              <>
                <button className="bulk-action-btn export" onClick={handleBulkExport}>
                  📥 Export Selected
                </button>
                <button className="bulk-action-btn share" onClick={handleBulkShare}>
                  👥 Share Selected
                </button>
                <button className="bulk-action-btn delete" onClick={handleBulkDelete}>
                  🗑️ Delete Selected
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Search/Filter */}
      {characters.length > 0 && (
        <div className="search-filter" style={{ padding: '12px', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              id="character-search"
              type="text"
              placeholder="Search by name, class, or race..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              aria-label="Search characters"
              style={{
                width: '100%',
                padding: '8px 32px 8px 12px',
                fontSize: '14px',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)'
              }}
            />
            {searchFilter && (
              <button
                onClick={() => setSearchFilter('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '16px',
                  color: 'var(--text-secondary)',
                  padding: '4px'
                }}
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {/* Character List */}
      <div className="character-list">
        {characters.length === 0 && (
          <div className="empty-state">
            No characters yet. Click <strong>+</strong> to create one.
          </div>
        )}

  {(() => {
    const filteredCharacters = characters.filter(char => {
      if (!searchFilter) return true;
      const search = searchFilter.toLowerCase();
      return (
        char.name.toLowerCase().includes(search) ||
        char.data.class?.toLowerCase().includes(search) ||
        char.data.race?.toLowerCase().includes(search)
      );
    });

    if (filteredCharacters.length === 0 && searchFilter) {
      return (
        <div className="empty-state">
          No characters found matching "{searchFilter}".
        </div>
      );
    }

    return filteredCharacters.map(char => {
          const isExpanded = expandedCharId === char.id;
          const isSelected = selectedCharacter?.id === char.id;
          const isBulkSelected = selectedCharacterIds.has(char.id);
          const linkedSprites = getSpritesForCharacter(char.id);
          const canEdit = canEditCharacter(char.id, currentUserId);
          return (
            <div
              key={char.id}
              className={`character-card ${isSelected ? 'selected' : ''} ${isExpanded ? 'expanded' : ''} ${isBulkSelected ? 'bulk-selected' : ''}`}
              draggable={!bulkSelectMode}
              onDragStart={e => handleDragStart(e, char.id)}
            >
              {/* Bulk selection checkbox */}
              {bulkSelectMode && (
                <div className="bulk-checkbox-wrapper">
                  <input
                    type="checkbox"
                    className="bulk-checkbox"
                    checked={isBulkSelected}
                    onChange={() => handleToggleCharacterSelection(char.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              )}
              
              <div
                className="character-header"
                onClick={() => bulkSelectMode ? handleToggleCharacterSelection(char.id) : handleCharacterClick(char.id)}
              >
                <div className="char-avatar">{char.name.charAt(0).toUpperCase()}</div>
                <div className="char-info">
                  <div className="char-name">
                    {char.name}
                    <SyncStatusIcon status={char.syncStatus} />
                    {/* Retry button for failed saves */}
                    {char.syncStatus === 'error' && (
                      <button
                        className="retry-save-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRetrySave(char.id);
                        }}
                        title="Retry saving to server"
                        style={{
                          marginLeft: '8px',
                          padding: '2px 8px',
                          fontSize: '11px',
                          backgroundColor: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer',
                          fontWeight: 'bold'
                        }}
                      >
                        🔄 Retry
                      </button>
                    )}
                  </div>
                  <div className="char-details">Owner: {char.ownerId}</div>
                </div>
                {/* Badges for linked tokens */}
                <div className="char-badges">
                  {linkedSprites.map((s: typeof linkedSprites[0]) => {
                    const canControlToken = canControlSprite(s.id, currentUserId);
                    return (
                      <span key={s.id} className={`token-badge${canControlToken ? '' : ' no-permission'}`} title={canControlToken ? 'You can control this token.' : 'You do not have permission to control this token.'}>
                        Token
                        <SyncStatusIcon status={s.syncStatus} />
                        {!canControlToken && (
                          <span className="permission-warning" title="No control permission">🚫</span>
                        )}
                      </span>
                    );
                  })}
                </div>
                <button
                  className="char-expand-btn"
                  onClick={e => { e.stopPropagation(); handleCharacterClick(char.id); }}
                >
                  {isExpanded ? '▼' : '▶'}
                </button>
              </div>
              {isExpanded && (
                <div className="character-details">
                  {/* Stats Section */}
                  {editingCharId === char.id ? (
                    <div className="details-section edit-mode">
                      <h4>Edit Stats</h4>
                      <div className="stat-row">
                        <label>HP:</label>
                        <input
                          type="number"
                          value={editFormData.hp || 0}
                          onChange={e => setEditFormData({ ...editFormData, hp: parseInt(e.target.value) || 0 })}
                          className="stat-input"
                        />
                        <span>/ {editFormData.maxHp}</span>
                      </div>
                      <div className="stat-row">
                        <label>Max HP:</label>
                        <input
                          type="number"
                          value={editFormData.maxHp || 10}
                          onChange={e => setEditFormData({ ...editFormData, maxHp: parseInt(e.target.value) || 10 })}
                          className="stat-input"
                        />
                      </div>
                      <div className="stat-row">
                        <label>AC:</label>
                        <input
                          type="number"
                          value={editFormData.ac || 10}
                          onChange={e => setEditFormData({ ...editFormData, ac: parseInt(e.target.value) || 10 })}
                          className="stat-input"
                        />
                      </div>
                      <div className="stat-row">
                        <label>Speed:</label>
                        <input
                          type="number"
                          value={editFormData.speed || 30}
                          onChange={e => setEditFormData({ ...editFormData, speed: parseInt(e.target.value) || 30 })}
                          className="stat-input"
                        />
                        <span>ft</span>
                      </div>
                      <div className="edit-actions">
                        <button className="action-btn save" onClick={() => handleSaveEdit(char.id)}>
                          Save
                        </button>
                        <button className="action-btn cancel" onClick={handleCancelEdit}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="details-section">
                      <h4>Stats</h4>
                      <div className="stat-row">
                        <span>HP:</span>
                        <span>{char.data?.stats?.hp || 0} / {char.data?.stats?.maxHp || 10}</span>
                      </div>
                      <div className="stat-row">
                        <span>AC:</span>
                        <span>{char.data?.stats?.ac || 10}</span>
                      </div>
                      <div className="stat-row">
                        <span>Speed:</span>
                        <span>{char.data?.stats?.speed || 30} ft</span>
                      </div>
                      <div className="stat-row">
                        <span>Version:</span>
                        <span>{char.version}</span>
                      </div>
                      {canEdit && (
                        <button className="action-btn edit" onClick={() => handleStartEdit(char)}>
                          Edit Stats
                        </button>
                      )}
                    </div>
                  )}
                  
                  {/* Conditions Section */}
                  <div className="details-section conditions-section">
                    <h4>Conditions</h4>
                    <div className="conditions-list">
                      {(char.data?.conditions || []).length === 0 && (
                        <span className="no-conditions">No active conditions</span>
                      )}
                      {(char.data?.conditions || []).map((cond: string) => (
                        <div key={cond} className="condition-tag">
                          {cond}
                          {canEdit && (
                            <button
                              className="remove-condition"
                              onClick={() => handleRemoveCondition(char.id, cond)}
                              title="Remove condition"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {canEdit && editingCharId !== char.id && (
                      <div className="add-condition-row">
                        <input
                          id={`condition-input-${char.id}`}
                          type="text"
                          placeholder="Add condition..."
                          value={editFormData.newCondition || ''}
                          onChange={e => setEditFormData({ ...editFormData, newCondition: e.target.value })}
                          onKeyPress={e => {
                            if (e.key === 'Enter') {
                              handleAddCondition(char.id);
                            }
                          }}
                          className="condition-input"
                          aria-label="Add condition"
                        />
                        <button
                          className="action-btn add-condition"
                          onClick={() => handleAddCondition(char.id)}
                          aria-label="Add condition"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Actions Section */}
                  <div className="char-actions">
                    <button className="action-btn view-sheet" onClick={() => handleViewSheet(char.id)} title="View full character sheet">
                      📄 View Sheet
                    </button>
                    <button className="action-btn" onClick={() => handleAddToken(char.id)} disabled={!canEdit} title={canEdit ? 'Add a token for this character.' : 'You do not have permission to add tokens for this character.'}>
                      Add Token
                    </button>
                    <button className="action-btn export" onClick={e => handleExportCharacter(char.id, e)} title="Export character to JSON file">
                      📥 Export
                    </button>
                    {canEdit && (
                      <>
                        <button className="action-btn clone" onClick={e => handleCloneCharacter(char.id, e)} title="Create a duplicate of this character">
                          📋 Clone
                        </button>
                        <button className="action-btn share" onClick={() => handleShareCharacter(char.id)} title="Share character with other players">
                          Share
                        </button>
                        <button className="action-btn delete" onClick={e => handleDeleteCharacter(char.id, e)} title="Delete this character.">
                          Delete
                        </button>
                      </>
                    )}
                    {!canEdit && (
                      <button className="action-btn delete" disabled title="You do not have permission to delete this character.">
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        });
  })()}
      </div>

      {/* Character Creation Wizard Modal */}
      {showWizard && (
        <EnhancedCharacterWizard
          key={wizardKey}
          isOpen={showWizard}
          onFinish={handleWizardFinish}
          onCancel={() => setShowWizard(false)}
        />
      )}

      {/* Share Character Dialog */}
      {shareDialogCharId && (() => {
        const char = characters.find(c => c.id === shareDialogCharId);
        if (!char) return null;
        return (
          <ShareCharacterDialog
            characterId={char.id}
            characterName={char.name}
            ownerId={char.ownerId}
            currentControlledBy={char.controlledBy}
            availableUsers={mockUsers}
            onClose={() => setShareDialogCharId(null)}
            onSave={handleSavePermissions}
          />
        );
      })()}

      {/* Character Sheet Modal */}
      {viewSheetCharId && (() => {
        const char = characters.find(c => c.id === viewSheetCharId);
        if (!char) return null;
        
        const handleSheetSave = (updates: Partial<Character>) => {
          updateCharacter(viewSheetCharId, updates);
          
          if (protocol && isConnected) {
            updateCharacter(viewSheetCharId, { syncStatus: 'syncing' });
            protocol.updateCharacter(viewSheetCharId, updates, char.version);
          }
        };
        
        const handleCloseModal = (e: React.MouseEvent) => {
          if (e.target === e.currentTarget) {
            setViewSheetCharId(null);
          }
        };
        
        const modalContent = (
          <div className="modal-overlay" onClick={handleCloseModal}>
            <div 
              className="modal-content character-sheet-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h2>{char.name} - Character Sheet</h2>
                <button 
                  className="modal-close-btn" 
                  onClick={(e) => {
                    e.stopPropagation();
                    setViewSheetCharId(null);
                  }}
                  aria-label="Close character sheet"
                  type="button"
                >
                  ✕
                </button>
              </div>
              <div className="modal-body">
                <CharacterSheet character={char} onSave={handleSheetSave} />
              </div>
            </div>
          </div>
        );
        
        return ReactDOM.createPortal(modalContent, document.body);
      })()}
    </div>
  );
}

export default CharacterPanelRedesigned;
