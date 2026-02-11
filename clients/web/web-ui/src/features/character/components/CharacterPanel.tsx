import clsx from 'clsx';
import ReactDOM from 'react-dom';
import type { Character } from '@/types';
import styles from './CharacterPanel.module.css';
import { BulkActionsBar } from './CharacterPanel/BulkActionsBar';
import { CharacterStats } from './CharacterPanel/CharacterStats';
import { SyncStatusIcon } from './CharacterPanel/SyncStatusIcon';
import { useCharacterPanel } from './CharacterPanel/useCharacterPanel';
import { CharacterSheet } from './CharacterSheetNew';
import { EnhancedCharacterWizard } from './CharacterWizard/EnhancedCharacterWizard';
import { ShareCharacterDialog } from './ShareCharacterDialog';

function CharacterPanel() {
  const {
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
    setShareDialogCharId,
    setSearchFilter,
    setViewSheetCharId,
    setEditFormData,
    updateCharacter,
    getSpritesForCharacter,
    canEditCharacter,
    canControlSprite,
    protocol,
  } = useCharacterPanel();

  const mockUsers = [
    { id: 1, name: 'Player 1' },
    { id: 2, name: 'Player 2' },
    { id: 3, name: 'DM' },
  ];

  const filteredCharacters = characters.filter(char => {
    if (!searchFilter) return true;
    const search = searchFilter.toLowerCase();
    return (
      char.name.toLowerCase().includes(search) ||
      char.data.class?.toLowerCase().includes(search) ||
      char.data.race?.toLowerCase().includes(search)
    );
  });

  return (
    <div className={styles.characterPanelRedesigned}>
      {!isConnected && (
        <div className={clsx(styles.connectionBanner, 'offline')} title="Not connected to server">
          ⚠️ Offline - Changes saved locally only
        </div>
      )}
      
      <div className={styles.panelHeader}>
        <div className={styles.headerTitle}>
          <h2>Characters</h2>
          {isConnected && <span className={styles.connectionStatus} title="Connected to server">●</span>}
        </div>
        <div className={styles.headerActions}>
          <button className={styles.compactBtn} onClick={handleImportCharacter} title="Import character">
            📤 Import
          </button>
          {characters.length > 0 && (
            <>
              <button className={styles.compactBtn} onClick={handleExportAllCharacters} title="Export all">
                📥 Export All
              </button>
              <button className={clsx(styles.compactBtn, bulkSelectMode && styles.active)} onClick={handleToggleBulkMode}>
                {bulkSelectMode ? '✓ Select' : '☑ Select'}
              </button>
            </>
          )}
          <button 
            className={styles.primaryBtn} 
            onClick={handleCreateCharacter} 
            aria-label="Create New Character"
            data-testid="create-character-btn"
          >
            +
          </button>
        </div>
      </div>

      {bulkSelectMode && (
        <BulkActionsBar
          selectedCount={selectedCharacterIds.size}
          onSelectAll={handleSelectAllCharacters}
          onDeselectAll={handleDeselectAllCharacters}
          onBulkExport={handleBulkExport}
          onBulkShare={handleBulkShare}
          onBulkDelete={handleBulkDelete}
        />
      )}

      {characters.length > 0 && (
        <div className={styles.searchContainer}>
          <div className={styles.searchInput}>
            <input
              type="text"
              placeholder="Search by name, class, or race..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className={styles.searchField}
            />
            {searchFilter && (
              <button 
                onClick={() => setSearchFilter('')} 
                className={styles.searchClear}
                aria-label="Clear search"
                type="button"
                title="Clear"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      <div className={styles.characterList} role="list" aria-label="Character list">
        {characters.length === 0 && (
          <div className={styles.emptyState}>No characters yet. Click <strong>+</strong> to create one.</div>
        )}

        {filteredCharacters.length === 0 && searchFilter && (
          <div className={styles.emptyState}>No characters found matching "{searchFilter}".</div>
        )}

        {filteredCharacters.map(char => {
          const isExpanded = expandedCharId === char.id;
          const isSelected = selectedCharacter?.id === char.id;
          const isBulkSelected = selectedCharacterIds.has(char.id);
          const linkedSprites = getSpritesForCharacter(char.id);
          const canEdit = canEditCharacter(char.id, currentUserId);

          return (
            <article
              key={char.id}
              role="listitem"
              aria-expanded={isExpanded}
              aria-label={`Character: ${char.name}`}
              className={clsx(styles.characterCard, {
                [styles.selected]: isSelected,
                [styles.expanded]: isExpanded,
                [styles.bulkSelected]: isBulkSelected
              })}
              draggable={!bulkSelectMode}
              onDragStart={e => handleDragStart(e, char.id)}
            >
              <div className={styles.cardContent}>
                {bulkSelectMode && (
                  <div className={styles.bulkCheckbox}>
                    <input
                      type="checkbox"
                      checked={isBulkSelected}
                      onChange={() => handleToggleCharacterSelection(char.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                )}
              </div>
                
                <button 
                  className={styles.cardHeader} 
                  onClick={() => bulkSelectMode ? handleToggleCharacterSelection(char.id) : handleCharacterClick(char.id)}
                  aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${char.name}`}
                  aria-expanded={isExpanded}
                  type="button"
                >
                  <div className={styles.cardLeft}>
                    <div className={styles.avatar}>{char.name.charAt(0).toUpperCase()}</div>
                    <div className={styles.charInfo}>
                      <div className={styles.charName}>
                        {char.name}
                        <SyncStatusIcon status={char.syncStatus} />
                        {char.syncStatus === 'error' && (
                          <button
                            className={styles.retryBtn}
                            onClick={(e) => { e.stopPropagation(); handleRetrySave(char.id); }}
                            title="Retry"
                          >
                            🔄
                          </button>
                        )}
                      </div>
                      <div className={styles.charMeta}>Owner: {char.ownerId}</div>
                    </div>
                  </div>
                  
                  <div className={styles.cardRight}>
                    <div className={styles.tokenBadges}>
                      {linkedSprites.map((s: typeof linkedSprites[0]) => {
                        const canControlToken = canControlSprite(s.id, currentUserId);
                        return (
                          <span 
                            key={s.id} 
                            className={clsx(styles.tokenBadge, !canControlToken && styles.noPermission)} 
                            title={canControlToken ? 'Can control' : 'No permission'}
                          >
                            🎭
                            <SyncStatusIcon status={s.syncStatus} />
                            {!canControlToken && <span className={styles.permissionIcon}>🚫</span>}
                          </span>
                        );
                      })}
                    </div>
                    <span className={styles.expandIcon} aria-hidden="true">
                      {isExpanded ? '▼' : '▶'}
                    </span>
                  </div>
                </button>

              {isExpanded && (
                <div className={styles.characterDetails}>
                  <CharacterStats
                    character={char}
                    isEditing={editingCharId === char.id}
                    canEdit={canEdit}
                    editFormData={editFormData}
                    onStartEdit={() => handleStartEdit(char)}
                    onCancelEdit={handleCancelEdit}
                    onSaveEdit={() => handleSaveEdit(char.id)}
                    onFormChange={setEditFormData}
                    onAddCondition={() => handleAddCondition(char.id)}
                    onRemoveCondition={(cond) => handleRemoveCondition(char.id, cond)}
                  />

                  <div className={styles.cardActions}>
                    <button className={styles.actionBtn} onClick={() => handleViewSheet(char.id)} title="View sheet">
                      <span className={styles.actionIcon}>📄</span>
                      <span className={styles.actionLabel}>Sheet</span>
                    </button>
                    <button className={styles.actionBtn} onClick={() => handleAddToken(char.id)} disabled={!canEdit} title={canEdit ? 'Add token' : 'No permission'}>
                      <span className={styles.actionIcon}>🎭</span>
                      <span className={styles.actionLabel}>Token</span>
                    </button>
                    <button className={styles.actionBtn} onClick={e => handleExportCharacter(char.id, e)} title="Export">
                      <span className={styles.actionIcon}>📥</span>
                      <span className={styles.actionLabel}>Export</span>
                    </button>
                    {canEdit && (
                      <>
                        <button className={styles.actionBtn} onClick={e => handleCloneCharacter(char.id, e)} title="Clone">
                          <span className={styles.actionIcon}>📋</span>
                          <span className={styles.actionLabel}>Clone</span>
                        </button>
                        <button className={styles.actionBtn} onClick={() => handleShareCharacter(char.id)} title="Share">
                          <span className={styles.actionIcon}>🔗</span>
                          <span className={styles.actionLabel}>Share</span>
                        </button>
                        <button className={clsx(styles.actionBtn, styles.dangerBtn)} onClick={e => handleDeleteCharacter(char.id, e)} title="Delete">
                          <span className={styles.actionIcon}>🗑</span>
                          <span className={styles.actionLabel}>Delete</span>
                        </button>
                      </>
                    )}
                    {!canEdit && (
                      <button className={clsx(styles.actionBtn, styles.disabledBtn)} disabled title="No permission">
                        <span className={styles.actionIcon}>🗑</span>
                        <span className={styles.actionLabel}>Delete</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {showWizard && (
        <EnhancedCharacterWizard
          key={wizardKey}
          isOpen={showWizard}
          onFinish={handleWizardFinish}
          onCancel={() => setShowWizard(false)}
        />
      )}

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
        
        const modalContent = (
          <div className={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) setViewSheetCharId(null); }}>
            <div className={clsx(styles.modalContent, "characterSheetModal")} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h2>{char.name} - Character Sheet</h2>
                <button className={styles.modalCloseBtn} onClick={() => setViewSheetCharId(null)} type="button">✕</button>
              </div>
              <div className={styles.modalBody}>
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

export { CharacterPanel };
export default CharacterPanel;
