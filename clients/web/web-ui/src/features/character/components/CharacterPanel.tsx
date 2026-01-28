import clsx from 'clsx';
import ReactDOM from 'react-dom';
import type { Character } from '../../../types';
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
        <h2>Characters</h2>
        {isConnected && <span className={clsx(styles.connectionStatus, 'connected')} title="Connected to server">🟢</span>}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className={styles.actionBtn} onClick={handleImportCharacter} title="Import character" style={{ fontSize: '12px', padding: '6px 12px' }}>
            📤 Import
          </button>
          {characters.length > 0 && (
            <>
              <button className={styles.actionBtn} onClick={handleExportAllCharacters} title="Export all" style={{ fontSize: '12px', padding: '6px 12px' }}>
                📥 Export All
              </button>
              <button className={clsx(styles.actionBtn, bulkSelectMode && 'active')} onClick={handleToggleBulkMode} style={{ fontSize: '12px', padding: '6px 12px' }}>
                {bulkSelectMode ? '✓ Done' : '☑ Select'}
              </button>
            </>
          )}
          <button className={styles.createBtn} onClick={handleCreateCharacter} title="Create New Character" data-testid="create-character-btn">+</button>
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
        <div className={styles.searchFilter} style={{ padding: '12px', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Search by name, class, or race..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
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
              <button onClick={() => setSearchFilter('')} style={{ position: 'absolute', right: '8px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--text-secondary)', padding: '4px' }} title="Clear">
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      <div className={styles.characterList}>
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
            <div
              key={char.id}
              className={clsx(styles.characterCard, isSelected && "selected", isExpanded && "expanded", isBulkSelected && "bulkSelected")}
              draggable={!bulkSelectMode}
              onDragStart={e => handleDragStart(e, char.id)}
            >
              {bulkSelectMode && (
                <div className={styles.bulkCheckboxWrapper}>
                  <input
                    type="checkbox"
                    className={styles.bulkCheckbox}
                    checked={isBulkSelected}
                    onChange={() => handleToggleCharacterSelection(char.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              )}
              
              <div className={styles.characterHeader} onClick={() => bulkSelectMode ? handleToggleCharacterSelection(char.id) : handleCharacterClick(char.id)}>
                <div className={styles.charAvatar}>{char.name.charAt(0).toUpperCase()}</div>
                <div className={styles.charInfo}>
                  <div className={styles.charName}>
                    {char.name}
                    <SyncStatusIcon status={char.syncStatus} />
                    {char.syncStatus === 'error' && (
                      <button
                        className={styles.retrySaveBtn}
                        onClick={(e) => { e.stopPropagation(); handleRetrySave(char.id); }}
                        title="Retry"
                        style={{ marginLeft: '8px', padding: '2px 8px', fontSize: '11px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        🔄 Retry
                      </button>
                    )}
                  </div>
                  <div className={styles.charDetails}>Owner: {char.ownerId}</div>
                </div>
                <div className="char-badges">
                  {linkedSprites.map((s: typeof linkedSprites[0]) => {
                    const canControlToken = canControlSprite(s.id, currentUserId);
                    return (
                      <span key={s.id} className={`token-badge${canControlToken ? '' : ' no-permission'}`} title={canControlToken ? 'Can control' : 'No permission'}>
                        Token
                        <SyncStatusIcon status={s.syncStatus} />
                        {!canControlToken && <span className="permission-warning">🚫</span>}
                      </span>
                    );
                  })}
                </div>
                <button className={styles.charExpandBtn} onClick={e => { e.stopPropagation(); handleCharacterClick(char.id); }}>
                  {isExpanded ? '▼' : '▶'}
                </button>
              </div>

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

                  <div className={styles.charActions}>
                    <button className={clsx(styles.actionBtn, "viewSheet")} onClick={() => handleViewSheet(char.id)} title="View sheet">📄 View Sheet</button>
                    <button className={styles.actionBtn} onClick={() => handleAddToken(char.id)} disabled={!canEdit} title={canEdit ? 'Add token' : 'No permission'}>Add Token</button>
                    <button className={clsx(styles.actionBtn, "export")} onClick={e => handleExportCharacter(char.id, e)} title="Export">📥 Export</button>
                    {canEdit && (
                      <>
                        <button className={clsx(styles.actionBtn, "clone")} onClick={e => handleCloneCharacter(char.id, e)} title="Clone">📋 Clone</button>
                        <button className={clsx(styles.actionBtn, "share")} onClick={() => handleShareCharacter(char.id)} title="Share">Share</button>
                        <button className={clsx(styles.actionBtn, "delete")} onClick={e => handleDeleteCharacter(char.id, e)} title="Delete">Delete</button>
                      </>
                    )}
                    {!canEdit && <button className={clsx(styles.actionBtn, "delete")} disabled title="No permission">Delete</button>}
                  </div>
                </div>
              )}
            </div>
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
