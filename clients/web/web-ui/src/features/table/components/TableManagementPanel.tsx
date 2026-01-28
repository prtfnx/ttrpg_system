import clsx from 'clsx';
import type { FC } from 'react';
import styles from './TableManagementPanel.module.css';
import { BulkActionsBar } from './TableManagementPanel/BulkActionsBar';
import { CreateTableForm } from './TableManagementPanel/CreateTableForm';
import { SettingsModal } from './TableManagementPanel/SettingsModal';
import { SyncBadge } from './TableManagementPanel/SyncBadge';
import { TableCard } from './TableManagementPanel/TableCard';
import { useTableManagement } from './TableManagementPanel/useTableManagement';
import { formatRelativeTime } from './TableManagementPanel/utils';

export const TableManagementPanel: FC = () => {
  const {
    tables,
    activeTableId,
    tablesLoading,
    filteredAndSortedTables,
    showCreateForm,
    setShowCreateForm,
    newTableName,
    setNewTableName,
    newTableWidth,
    setNewTableWidth,
    newTableHeight,
    setNewTableHeight,
    deleteConfirmId,
    setDeleteConfirmId,
    settingsTableId,
    settingsName,
    setSettingsName,
    settingsWidth,
    setSettingsWidth,
    settingsHeight,
    setSettingsHeight,
    settingsGridSize,
    setSettingsGridSize,
    settingsGridEnabled,
    setSettingsGridEnabled,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    autoSync,
    setAutoSync,
    showSettings,
    setShowSettings,
    selectedTables,
    bulkMode,
    setBulkMode,
    handleCreateTable,
    confirmDeleteTable,
    handleTableSelect,
    handleDiagnoseThumbnails,
    handleOpenSettings,
    handleCloseSettings,
    handleSaveSettings,
    handleDuplicateTable,
    toggleTableSelection,
    toggleSelectAll,
    handleBulkDelete,
    handleBulkDuplicate,
    handleImportTable,
    applyTemplate,
    requestTableList,
    handleDeleteTable
  } = useTableManagement();

  return (
    <div className={styles.tableManagementPanel}>
      <div className={styles.panelHeader}>
        <h3>Table Management</h3>
        <div className={styles.headerActions}>
          <button 
            onClick={() => setBulkMode(!bulkMode)}
            className={clsx(styles.bulkModeButton, bulkMode && styles.active)}
            title="Bulk select mode"
          >
            {bulkMode ? '☑' : '☐'}
          </button>
          <button 
            onClick={handleImportTable}
            className={styles.importButton}
            title="Import table"
          >
            📥
          </button>
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={clsx(styles.settingsToggleButton, showSettings && styles.active)}
            title="Panel settings"
          >
            ⚙️
          </button>
          <button 
            onClick={requestTableList}
            disabled={tablesLoading}
            className={styles.refreshButton}
            title="Refresh table list"
          >
            {tablesLoading ? '⟳' : '↻'}
          </button>
          <button 
            onClick={handleDiagnoseThumbnails}
            className={styles.debugButton}
            title="Diagnose thumbnail rendering"
          >
            🔍
          </button>
          <button 
            onClick={() => setShowCreateForm(!showCreateForm)}
            className={styles.createButton}
            title="Create new table"
          >
            +
          </button>
        </div>
      </div>

      {bulkMode && selectedTables.size > 0 && (
        <BulkActionsBar
          selectedCount={selectedTables.size}
          onDuplicate={handleBulkDuplicate}
          onDelete={handleBulkDelete}
        />
      )}

      {showSettings && (
        <div className={styles.panelSettings}>
          <div className={styles.settingsRow}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={autoSync}
                onChange={(e) => setAutoSync(e.target.checked)}
              />
              <span>Auto-sync local tables</span>
            </label>
            <span className={styles.helpText}>Automatically sync new tables to server</span>
          </div>
        </div>
      )}

      <div className={styles.searchFilterBar}>
        {bulkMode && (
          <label className={styles.selectAllCheckbox}>
            <input
              type="checkbox"
              checked={selectedTables.size === filteredAndSortedTables.length && filteredAndSortedTables.length > 0}
              onChange={toggleSelectAll}
              title="Select all"
            />
            <span>All</span>
          </label>
        )}
        <div className={styles.searchBox}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tables..."
            className={styles.searchInput}
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className={styles.clearSearch}
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>
        <div className={styles.sortControls}>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'name' | 'date' | 'size')}
            className={styles.sortSelect}
          >
            <option value="name">Name</option>
            <option value="date">Date</option>
            <option value="size">Size</option>
          </select>
          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className={styles.sortOrderButton}
            title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
        <div className={styles.tableCount}>
          {filteredAndSortedTables.length} / {tables.length}
        </div>
      </div>

      {showCreateForm && (
        <CreateTableForm
          tableName={newTableName}
          tableWidth={newTableWidth}
          tableHeight={newTableHeight}
          onNameChange={setNewTableName}
          onWidthChange={setNewTableWidth}
          onHeightChange={setNewTableHeight}
          onApplyTemplate={applyTemplate}
          onCreate={handleCreateTable}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      <div className={styles.tablesList}>
        {tablesLoading && <div className={styles.loadingIndicator}>Loading tables...</div>}
        
        {!tablesLoading && filteredAndSortedTables.length === 0 && tables.length === 0 && (
          <div className={styles.emptyState}>
            <p>No tables available</p>
            <p>Create a new table to get started</p>
          </div>
        )}

        {!tablesLoading && filteredAndSortedTables.length === 0 && tables.length > 0 && (
          <div className={styles.emptyState}>
            <p>No tables match your search</p>
            <p>Try a different search term</p>
          </div>
        )}

        {!tablesLoading && filteredAndSortedTables.map((table) => (
          <TableCard
            key={table.table_id}
            table={table}
            isActive={activeTableId === table.table_id}
            isBulkMode={bulkMode}
            isSelected={selectedTables.has(table.table_id)}
            onSelect={toggleTableSelection}
            onOpen={handleTableSelect}
            onSettings={handleOpenSettings}
            onDuplicate={handleDuplicateTable}
            onDelete={handleDeleteTable}
            syncBadge={
              <SyncBadge
                syncStatus={table.syncStatus}
                lastSyncTime={table.lastSyncTime}
                syncError={table.syncError}
                formatRelativeTime={formatRelativeTime}
              />
            }
          />
        ))}
      </div>

      {deleteConfirmId && (
        <div 
          className={styles.deleteConfirmationModal}
          onClick={() => setDeleteConfirmId(null)}
        >
          <div 
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <h4>Confirm Delete</h4>
            <p>Are you sure you want to delete this table?</p>
            <p className={styles.tableName}>
              {tables.find(t => t.table_id === deleteConfirmId)?.table_name}
            </p>
            <div className={styles.modalActions}>
              <button onClick={confirmDeleteTable} className={styles.confirmDeleteButton}>
                Delete
              </button>
              <button 
                onClick={() => setDeleteConfirmId(null)} 
                className={styles.cancelButton}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {settingsTableId && (
        <SettingsModal
          settingsName={settingsName}
          settingsWidth={settingsWidth}
          settingsHeight={settingsHeight}
          settingsGridSize={settingsGridSize}
          settingsGridEnabled={settingsGridEnabled}
          onNameChange={setSettingsName}
          onWidthChange={setSettingsWidth}
          onHeightChange={setSettingsHeight}
          onGridSizeChange={setSettingsGridSize}
          onGridEnabledChange={setSettingsGridEnabled}
          onSave={handleSaveSettings}
          onCancel={handleCloseSettings}
        />
      )}
    </div>
  );
};
