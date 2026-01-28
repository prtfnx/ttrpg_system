import { useEffect, useMemo, useState } from 'react';
import type { TableInfo } from '../../../../store';
import { useGameStore } from '../../../../store';
import { tableThumbnailService } from '../../services/tableThumbnail.service';
import { TABLE_TEMPLATES } from './utils';

export const useTableManagement = () => {
  const {
    tables,
    activeTableId,
    tablesLoading,
    setTables,
    setTablesLoading,
    requestTableList,
    createNewTable,
    deleteTable,
    switchToTable
  } = useGameStore();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [newTableWidth, setNewTableWidth] = useState(2000);
  const [newTableHeight, setNewTableHeight] = useState(2000);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  const [settingsTableId, setSettingsTableId] = useState<string | null>(null);
  const [settingsName, setSettingsName] = useState('');
  const [settingsWidth, setSettingsWidth] = useState(2000);
  const [settingsHeight, setSettingsHeight] = useState(2000);
  const [settingsGridSize, setSettingsGridSize] = useState(50);
  const [settingsGridEnabled, setSettingsGridEnabled] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  const [autoSync, setAutoSync] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);

  useEffect(() => {
    const handleTableListUpdate = (event: Event) => {
      const customEvent = event as CustomEvent;
      const data = customEvent.detail;
      
      if (data.tables) {
        const serverTables = Object.entries(data.tables).map(([id, tableData]: [string, any]) => ({
          table_id: id,
          ...tableData,
          syncStatus: 'synced' as const,
          lastSyncTime: Date.now()
        }));
        
        const currentTables = useGameStore.getState().tables;
        const localTables = currentTables.filter((t: TableInfo) => {
          const isInServerList = serverTables.some(st => st.table_id === t.table_id);
          const isLocal = t.syncStatus === 'local' || t.syncStatus === 'syncing';
          return !isInServerList && isLocal;
        });
        
        const mergedTables = [...serverTables, ...localTables];
        setTables(mergedTables);
      }
      setTablesLoading(false);
    };

    const handleTableCreated = (event: Event) => {
      const customEvent = event as CustomEvent;
      const responseData = customEvent.detail;
      
      const localTableId = responseData.local_table_id;
      const serverTableData = responseData.table_data;
      
      if (localTableId && serverTableData) {
        const currentTables = useGameStore.getState().tables;
        const updated: TableInfo[] = currentTables.map((t: TableInfo): TableInfo => {
          if (t.table_id === localTableId) {
            return {
              ...t,
              table_id: serverTableData.id || serverTableData.table_id || t.table_id,
              table_name: serverTableData.table_name || t.table_name,
              width: serverTableData.width || t.width,
              height: serverTableData.height || t.height,
              syncStatus: 'synced' as const,
              lastSyncTime: Date.now(),
              syncError: undefined
            } as TableInfo;
          }
          return t;
        });
        setTables(updated);
      } else {
        requestTableList();
      }
      
      setShowCreateForm(false);
      setNewTableName('');
    };

    const handleTableDeleted = (event: Event) => {
      requestTableList();
      setDeleteConfirmId(null);
    };

    const handleProtocolConnected = () => {
      requestTableList();
    };

    window.addEventListener('table-list-updated', handleTableListUpdate);
    window.addEventListener('new-table-response', handleTableCreated);
    window.addEventListener('table-deleted', handleTableDeleted);
    window.addEventListener('protocol-connected', handleProtocolConnected);

    return () => {
      window.removeEventListener('table-list-updated', handleTableListUpdate);
      window.removeEventListener('new-table-response', handleTableCreated);
      window.removeEventListener('table-deleted', handleTableDeleted);
      window.removeEventListener('protocol-connected', handleProtocolConnected);
    };
  }, [setTables, setTablesLoading, requestTableList]);

  const handleCreateTable = () => {
    if (!newTableName.trim()) {
      alert('Table name is required');
      return;
    }
    createNewTable(newTableName.trim(), newTableWidth, newTableHeight);
  };

  const handleDeleteTable = (tableId: string) => {
    setDeleteConfirmId(tableId);
  };

  const confirmDeleteTable = () => {
    if (deleteConfirmId) {
      deleteTable(deleteConfirmId);
    }
  };

  const handleTableSelect = (tableId: string) => {
    switchToTable(tableId);
  };

  const handleDiagnoseThumbnails = async () => {
    console.group('🔍 Thumbnail Diagnostic Report');
    
    const wasmReady = (window as any).wasmInitialized;
    console.log('1. WASM Status:', wasmReady ? '✅ Initialized' : '❌ Not Initialized');
    
    const mainCanvas = document.querySelector('[data-testid="game-canvas"]') as HTMLCanvasElement;
    console.log('2. Main Canvas:', mainCanvas ? {
      found: '✅ Yes',
      dimensions: `${mainCanvas.width}x${mainCanvas.height}`,
      inDOM: mainCanvas.parentElement ? '✅ In DOM' : '❌ Not in DOM'
    } : '❌ Not Found');
    
    const renderEngine = tableThumbnailService.getRenderEngine();
    console.log('3. Active Table:', tables[0]?.table_name || '❌ None');
    console.log('5. Render Engine:', renderEngine ? '✅ Available' : '❌ Not Available');
    
    if (mainCanvas) {
      const ctx = mainCanvas.getContext('2d');
      if (ctx) {
        const centerPixel = ctx.getImageData(
          Math.floor(mainCanvas.width / 2),
          Math.floor(mainCanvas.height / 2),
          1, 1
        ).data;
        const isBlack = centerPixel[0] === 0 && centerPixel[1] === 0 && centerPixel[2] === 0;
        console.log('6. Canvas Content (center pixel):', isBlack ? '⚠️ Black (empty?)' : '✅ Has Content', centerPixel);
      }
    }
    
    if (activeTableId) {
      const table = tables.find(t => t.table_id === activeTableId);
      if (table) {
        console.log('7. Attempting to regenerate thumbnail for active table:', table.table_name);
        try {
          const imageData = await tableThumbnailService.generateThumbnail(
            table.table_id,
            table.width,
            table.height,
            160,
            120,
            true
          );
          console.log('   Result:', imageData ? `✅ Generated ${imageData.width}x${imageData.height}` : '❌ Returned null');
        } catch (error) {
          console.error('   ❌ Error:', error);
        }
      }
    }
    
    const cacheStats = tableThumbnailService.getCacheStats();
    console.log('8. Cache Statistics:', {
      totalCached: cacheStats.size,
      tablesWithCache: cacheStats.tables
    });
    
    console.groupEnd();
    
    alert(`Thumbnail Diagnostic Complete\n\nCheck browser console (F12) for detailed report.\n\nQuick Summary:\n- WASM: ${wasmReady ? '✅' : '❌'}\n- Canvas: ${mainCanvas ? '✅' : '❌'}\n- Active Table: ${activeTableId ? '✅' : '❌'}\n- Cached: ${cacheStats.size} thumbnails`);
  };

  const handleOpenSettings = (tableId: string) => {
    const table = tables.find(t => t.table_id === tableId);
    if (table) {
      setSettingsTableId(tableId);
      setSettingsName(table.table_name);
      setSettingsWidth(table.width);
      setSettingsHeight(table.height);
      setSettingsGridSize(50);
      setSettingsGridEnabled(true);
    }
  };

  const handleCloseSettings = () => {
    setSettingsTableId(null);
  };

  const handleSaveSettings = () => {
    if (!settingsTableId) return;
    
    window.dispatchEvent(new CustomEvent('protocol-send-message', {
      detail: {
        type: 'table_update',
        data: {
          category: 'table',
          type: 'table_update',
          data: {
            table_id: settingsTableId,
            table_name: settingsName,
            width: settingsWidth,
            height: settingsHeight,
            grid_size: settingsGridSize,
            grid_enabled: settingsGridEnabled
          }
        }
      }
    }));

    setTables(tables.map(t => 
      t.table_id === settingsTableId 
        ? { ...t, table_name: settingsName, width: settingsWidth, height: settingsHeight }
        : t
    ));

    if (activeTableId === settingsTableId) {
      const updatedTableDataForWasm = {
        table_data: {
          table_id: settingsTableId,
          table_name: settingsName,
          width: settingsWidth,
          height: settingsHeight,
          grid_size: settingsGridSize,
          grid_enabled: settingsGridEnabled,
          grid_snapping: false,
          layers: {
            map: [],
            tokens: [],
            dungeon_master: [],
            light: [],
            height: [],
            obstacles: [],
            fog_of_war: []
          }
        }
      };
      
      window.dispatchEvent(new CustomEvent('table-data-received', {
        detail: updatedTableDataForWasm
      }));
      
      window.dispatchEvent(new CustomEvent('protocol-send-message', {
        detail: {
          type: 'table_request',
          data: {
            table_id: settingsTableId
          }
        }
      }));
    }

    setTimeout(() => {
      requestTableList();
    }, 500);

    setSettingsTableId(null);
  };

  const filteredAndSortedTables = useMemo(() => {
    let filtered = tables;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(t => 
        (t.table_name || '').toLowerCase().includes(query) ||
        (t.table_id || '').toLowerCase().includes(query)
      );
    }

    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = (a.table_name || '').localeCompare(b.table_name || '');
          break;
        case 'date':
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          comparison = dateB - dateA;
          break;
        case 'size':
          const sizeA = (a.width || 0) * (a.height || 0);
          const sizeB = (b.width || 0) * (b.height || 0);
          comparison = sizeA - sizeB;
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [tables, searchQuery, sortBy, sortOrder]);

  const handleDuplicateTable = (tableId: string) => {
    const table = tables.find(t => t.table_id === tableId);
    if (table) {
      createNewTable(`${table.table_name} (Copy)`, table.width, table.height);
    }
  };

  const toggleTableSelection = (tableId: string) => {
    const newSelection = new Set(selectedTables);
    if (newSelection.has(tableId)) {
      newSelection.delete(tableId);
    } else {
      newSelection.add(tableId);
    }
    setSelectedTables(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedTables.size === filteredAndSortedTables.length) {
      setSelectedTables(new Set());
    } else {
      setSelectedTables(new Set(filteredAndSortedTables.map(t => t.table_id)));
    }
  };

  const handleBulkDelete = () => {
    if (selectedTables.size === 0) return;
    if (!confirm(`Delete ${selectedTables.size} table(s)?`)) return;
    
    selectedTables.forEach(tableId => {
      deleteTable(tableId);
    });
    setSelectedTables(new Set());
    setBulkMode(false);
  };

  const handleBulkDuplicate = () => {
    if (selectedTables.size === 0) return;
    
    selectedTables.forEach(tableId => {
      handleDuplicateTable(tableId);
    });
    setSelectedTables(new Set());
  };

  const handleImportTable = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (!data.table_name || !data.width || !data.height) {
          alert('Invalid table export file');
          return;
        }

        createNewTable(
          `${data.table_name} (Imported)`,
          data.width,
          data.height
        );
      } catch (err) {
        alert('Failed to import table: ' + err);
      }
    };
    input.click();
  };

  const applyTemplate = (templateKey: keyof typeof TABLE_TEMPLATES) => {
    const template = TABLE_TEMPLATES[templateKey];
    setNewTableWidth(template.width);
    setNewTableHeight(template.height);
  };

  return {
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
    handleDeleteTable,
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
    requestTableList
  };
};
