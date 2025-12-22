/**
 * Monster Creation & Management Panel
 * Production-ready React UI for creating and managing monsters from compendium data
 * with search, filtering, instance management, and table placement
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    monsterCreationSystem,
    type MonsterInstance,
    type MonsterSearchFilters,
    type MonsterStats,
    type MonsterTemplate
} from '../services/monsterCreation.service';
import '../styles/MonsterCreationPanel.css';
import styles from './MonsterCreationPanel.module.css';

interface MonsterCreationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onMonsterPlaceOnTable?: (instance: MonsterInstance, position?: { x: number; y: number }) => void;
}

type ActiveTab = 'browse' | 'instances' | 'create' | 'encounters';
type SortOption = 'name' | 'cr' | 'type' | 'source';

const MONSTER_TYPES = [
  'aberration', 'beast', 'celestial', 'construct', 'dragon', 'elemental',
  'fey', 'fiend', 'giant', 'humanoid', 'monstrosity', 'ooze', 'plant', 'undead'
];

const MONSTER_SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'];

export const MonsterCreationPanel: React.FC<MonsterCreationPanelProps> = ({
  isOpen,
  onClose,
  onMonsterPlaceOnTable
}) => {
  // State management
  const [activeTab, setActiveTab] = useState<ActiveTab>('browse');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MonsterTemplate[]>([]);
  const [instances, setInstances] = useState<MonsterInstance[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<MonsterTemplate | null>(null);
  const [selectedInstance, setSelectedInstance] = useState<MonsterInstance | null>(null);
  const [filters, setFilters] = useState<MonsterSearchFilters>({});
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [loading, setLoading] = useState(false);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  
  // UI state
  const [showFilters, setShowFilters] = useState(false);
  const [previewMode, setPreviewMode] = useState<'card' | 'list'>('card');
  
  // Refs
  const subscriptionKeyRef = useRef('monster_panel');
  const searchTimeoutRef = useRef<number | null>(null);

  // === Event Handlers ===

  const handleSystemEvent = useCallback(() => {
    setInstances(monsterCreationSystem.getInstances());
    performSearch();
  }, []);

  // === Effects ===

  useEffect(() => {
    if (!isOpen) return;

    // Subscribe to system events
    const events = [
      'instanceCreated', 'instanceUpdated', 'instanceDeleted',
      'templateCreated', 'templateUpdated', 'templateDeleted', 'compendiumLoaded'
    ];

    events.forEach(event => {
      monsterCreationSystem.subscribe(subscriptionKeyRef.current, event, handleSystemEvent);
    });

    // Load initial data
    performSearch();
    setInstances(monsterCreationSystem.getInstances());

    return () => {
      // Cleanup subscriptions
      events.forEach(event => {
        monsterCreationSystem.unsubscribe(subscriptionKeyRef.current, event);
      });
      
      // Clear timeout
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [isOpen, handleSystemEvent]);

  useEffect(() => {
    // Debounced search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = window.setTimeout(() => {
      performSearch();
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, filters, sortBy, sortAsc]);

  // === Search and Filtering ===

  const performSearch = useCallback(() => {
    setLoading(true);
    
    try {
      let results = monsterCreationSystem.searchMonsters(searchQuery, filters);
      
      // Apply sorting
      results.sort((a, b) => {
        let comparison = 0;
        
        switch (sortBy) {
          case 'name':
            comparison = a.name.localeCompare(b.name);
            break;
          case 'cr':
            const crA = parseChallengeRating(a.challengeRating);
            const crB = parseChallengeRating(b.challengeRating);
            comparison = crA - crB;
            break;
          case 'type':
            comparison = a.type.localeCompare(b.type);
            break;
          case 'source':
            comparison = a.source.localeCompare(b.source);
            break;
        }
        
        return sortAsc ? comparison : -comparison;
      });
      
      setSearchResults(results);
      setCurrentPage(1);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, filters, sortBy, sortAsc]);

  const parseChallengeRating = (cr: string): number => {
    if (cr.includes('/')) {
      const [num, den] = cr.split('/').map(n => parseInt(n));
      return num / den;
    }
    return parseInt(cr) || 0;
  };

  const handleFilterChange = useCallback((key: keyof MonsterSearchFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({});
    setSearchQuery('');
  }, []);

  // === Instance Management ===

  const createInstance = useCallback((template: MonsterTemplate, customName?: string) => {
    const instance = monsterCreationSystem.createInstance(template.id, customName);
    if (instance) {
      setSelectedInstance(instance);
      if (activeTab !== 'instances') {
        setActiveTab('instances');
      }
    }
  }, [activeTab]);

  const handlePlaceOnTable = useCallback((instance: MonsterInstance) => {
    if (onMonsterPlaceOnTable) {
      onMonsterPlaceOnTable(instance);
    }
  }, [onMonsterPlaceOnTable]);

  const updateInstanceHP = useCallback((instanceId: string, hp: number) => {
    monsterCreationSystem.updateInstance(instanceId, { 
      currentHitPoints: Math.max(0, hp)
    });
  }, []);



  // === Pagination ===

  const totalPages = Math.ceil(searchResults.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentResults = searchResults.slice(startIndex, endIndex);

  // === Render Helpers ===

  const renderStatBlock = (stats: MonsterStats) => (
    <div className={styles.monsterStatBlock}>
      {Object.entries(stats).map(([stat, value]) => (
        <div key={stat} className={styles.monsterStat}>
          <span className={styles.monsterStatName}>{stat.substring(0, 3).toUpperCase()}</span>
          <span className={styles.monsterStatValue}>{value}</span>
          <span className={styles.monsterStatModifier}>
            {value >= 10 ? `+${Math.floor((value - 10) / 2)}` : `${Math.floor((value - 10) / 2)}`}
          </span>
        </div>
      ))}
    </div>
  );

  const renderMonsterCard = (template: MonsterTemplate) => (
    <div
      key={template.id}
      className={`monster-card ${selectedTemplate?.id === template.id ? 'selected' : ''}`}
      onClick={() => setSelectedTemplate(template)}
    >
      <div className={styles.monsterCardHeader}>
        <h4 className={styles.monsterName}>{template.name}</h4>
        <span className={styles.monsterCr}>CR {template.challengeRating}</span>
      </div>
      
      <div className={styles.monsterBasicInfo}>
        <span className={styles.monsterType}>{template.size} {template.type}</span>
        {template.subtype && <span className={styles.monsterSubtype}>({template.subtype})</span>}
      </div>
      
      <div className={styles.monsterVitalStats}>
        <div className={styles.monsterVitalStat}>
          <span className={styles.label}>AC</span>
          <span className={styles.value}>{template.armorClass}</span>
        </div>
        <div className={styles.monsterVitalStat}>
          <span className={styles.label}>HP</span>
          <span className={styles.value}>{template.hitPoints.average}</span>
        </div>
        <div className={styles.monsterVitalStat}>
          <span className={styles.label}>Speed</span>
          <span className={styles.value}>{template.speed.walk} ft.</span>
        </div>
      </div>
      
      <div className={styles.monsterTags}>
        {template.tags.slice(0, 3).map(tag => (
          <span key={tag} className={styles.monsterTag}>{tag}</span>
        ))}
        {template.tags.length > 3 && <span className={styles.monsterTagMore}>+{template.tags.length - 3}</span>}
      </div>
      
      <div className={styles.monsterCardActions}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            createInstance(template);
          }}
          className="monster-btn monster-btn-primary monster-btn-small"
        >
          Create Instance
        </button>
        {template.spells && (
          <span className={styles.monsterFeatureIcon} title="Spellcaster">🔮</span>
        )}
        {template.legendary && (
          <span className={styles.monsterFeatureIcon} title="Legendary">⭐</span>
        )}
      </div>
    </div>
  );

  const renderInstanceCard = (instance: MonsterInstance) => (
    <div
      key={instance.id}
      className={`monster-instance-card ${selectedInstance?.id === instance.id ? 'selected' : ''} ${instance.isDefeated ? 'defeated' : ''}`}
      onClick={() => setSelectedInstance(instance)}
    >
      <div className={styles.monsterInstanceHeader}>
        <h4 className={styles.monsterInstanceName}>{instance.name}</h4>
        <div className={styles.monsterInstanceActions}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handlePlaceOnTable(instance);
            }}
            className="monster-btn monster-btn-primary monster-btn-small"
            title="Place on Table"
          >
            📍
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              monsterCreationSystem.deleteInstance(instance.id);
            }}
            className="monster-btn monster-btn-danger monster-btn-small"
            title="Delete"
          >
            🗑️
          </button>
        </div>
      </div>
      
      <div className={styles.monsterInstanceInfo}>
        <span className={styles.monsterInstanceTemplate}>{instance.template.name}</span>
        <span className={styles.monsterInstanceCr}>CR {instance.template.challengeRating}</span>
      </div>
      
      <div className={styles.monsterInstanceHealth}>
        <div className={styles.monsterHealthBar}>
          <div 
            className={styles.monsterHealthFill}
            style={{ 
              width: `${(instance.currentHitPoints / instance.maxHitPoints) * 100}%`,
              backgroundColor: instance.currentHitPoints > instance.maxHitPoints * 0.5 ? '#4caf50' :
                             instance.currentHitPoints > instance.maxHitPoints * 0.25 ? '#ff9800' : '#f44336'
            }}
          />
        </div>
        <div className={styles.monsterHealthText}>
          <input
            type="number"
            value={instance.currentHitPoints}
            onChange={(e) => updateInstanceHP(instance.id, parseInt(e.target.value) || 0)}
            className={styles.monsterHpInput}
            min="0"
            max={instance.maxHitPoints + instance.temporaryHitPoints}
          />
          <span>/ {instance.maxHitPoints} HP</span>
        </div>
      </div>
      
      {instance.conditions.length > 0 && (
        <div className={styles.monsterConditions}>
          {instance.conditions.map(condition => (
            <span key={condition} className={styles.monsterCondition}>{condition}</span>
          ))}
        </div>
      )}
    </div>
  );

  const renderFiltersPanel = () => (
    <div className={`monster-filters-panel ${showFilters ? 'visible' : ''}`}>
      <div className={styles.monsterFilterGroup}>
        <label>Monster Type:</label>
        <select
          value={filters.type || ''}
          onChange={(e) => handleFilterChange('type', e.target.value || undefined)}
        >
          <option value="">All Types</option>
          {MONSTER_TYPES.map(type => (
            <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
          ))}
        </select>
      </div>
      
      <div className={styles.monsterFilterGroup}>
        <label>Size:</label>
        <div className={styles.monsterFilterCheckboxes}>
          {MONSTER_SIZES.map(size => (
            <label key={size} className={styles.monsterCheckbox}>
              <input
                type="checkbox"
                checked={filters.size?.includes(size) || false}
                onChange={(e) => {
                  const currentSizes = filters.size || [];
                  const newSizes = e.target.checked
                    ? [...currentSizes, size]
                    : currentSizes.filter(s => s !== size);
                  handleFilterChange('size', newSizes.length > 0 ? newSizes : undefined);
                }}
              />
              <span>{size.charAt(0).toUpperCase() + size.slice(1)}</span>
            </label>
          ))}
        </div>
      </div>
      
      <div className={styles.monsterFilterGroup}>
        <label>Challenge Rating:</label>
        <div className={styles.monsterFilterRange}>
          <input
            type="number"
            placeholder="Min CR"
            value={filters.challengeRating?.min || ''}
            onChange={(e) => {
              const value = e.target.value ? parseFloat(e.target.value) : undefined;
              handleFilterChange('challengeRating', {
                ...filters.challengeRating,
                min: value
              });
            }}
            min="0"
            max="30"
            step="0.125"
          />
          <span>to</span>
          <input
            type="number"
            placeholder="Max CR"
            value={filters.challengeRating?.max || ''}
            onChange={(e) => {
              const value = e.target.value ? parseFloat(e.target.value) : undefined;
              handleFilterChange('challengeRating', {
                ...filters.challengeRating,
                max: value
              });
            }}
            min="0"
            max="30"
            step="0.125"
          />
        </div>
      </div>
      
      <div className={styles.monsterFilterGroup}>
        <label className={styles.monsterCheckbox}>
          <input
            type="checkbox"
            checked={filters.hasSpells || false}
            onChange={(e) => handleFilterChange('hasSpells', e.target.checked || undefined)}
          />
          <span>Spellcasters Only</span>
        </label>
      </div>
      
      <div className={styles.monsterFilterGroup}>
        <label className={styles.monsterCheckbox}>
          <input
            type="checkbox"
            checked={filters.hasLegendaryActions || false}
            onChange={(e) => handleFilterChange('hasLegendaryActions', e.target.checked || undefined)}
          />
          <span>Legendary Creatures Only</span>
        </label>
      </div>
      
      <div className={styles.monsterFilterActions}>
        <button
          onClick={clearFilters}
          className="monster-btn monster-btn-secondary"
        >
          Clear Filters
        </button>
      </div>
    </div>
  );

  const renderBrowseTab = () => (
    <div className={styles.monsterBrowseTab}>
      <div className={styles.monsterSearchHeader}>
        <div className={styles.monsterSearchBar}>
          <input
            type="text"
            placeholder="Search monsters..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.monsterSearchInput}
          />
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`monster-btn monster-btn-secondary ${showFilters ? 'active' : ''}`}
          >
            🔍 Filters
          </button>
        </div>
        
        <div className={styles.monsterSearchControls}>
          <div className={styles.monsterSortControls}>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
            >
              <option value="name">Name</option>
              <option value="cr">Challenge Rating</option>
              <option value="type">Type</option>
              <option value="source">Source</option>
            </select>
            <button
              onClick={() => setSortAsc(!sortAsc)}
              className="monster-btn monster-btn-secondary monster-btn-small"
              title={sortAsc ? 'Sort Descending' : 'Sort Ascending'}
            >
              {sortAsc ? '↑' : '↓'}
            </button>
          </div>
          
          <div className={styles.monsterViewControls}>
            <button
              onClick={() => setPreviewMode('card')}
              className={`monster-btn monster-btn-small ${previewMode === 'card' ? 'active' : ''}`}
            >
              📋
            </button>
            <button
              onClick={() => setPreviewMode('list')}
              className={`monster-btn monster-btn-small ${previewMode === 'list' ? 'active' : ''}`}
            >
              📄
            </button>
          </div>
        </div>
      </div>
      
      {renderFiltersPanel()}
      
      <div className={styles.monsterSearchResults}>
        <div className={styles.monsterResultsInfo}>
          <span>Found {searchResults.length} monsters</span>
          {searchResults.length > itemsPerPage && (
            <span>Showing {startIndex + 1}-{Math.min(endIndex, searchResults.length)}</span>
          )}
        </div>
        
        {loading ? (
          <div className={styles.monsterLoading}>Loading monsters...</div>
        ) : (
          <div className={`monster-results-grid ${previewMode === 'list' ? 'list-view' : 'card-view'}`}>
            {currentResults.map(renderMonsterCard)}
          </div>
        )}
        
        {totalPages > 1 && (
          <div className={styles.monsterPagination}>
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="monster-btn monster-btn-secondary"
            >
              Previous
            </button>
            
            <span className={styles.monsterPageInfo}>
              Page {currentPage} of {totalPages}
            </span>
            
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="monster-btn monster-btn-secondary"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const renderInstancesTab = () => (
    <div className={styles.monsterInstancesTab}>
      <div className={styles.monsterInstancesHeader}>
        <h4>Monster Instances ({instances.length})</h4>
        <div className={styles.monsterInstancesActions}>
          <button
            onClick={() => console.log('Custom instance creation coming soon!')}
            className="monster-btn monster-btn-primary"
          >
            Create Custom Instance
          </button>
        </div>
      </div>
      
      {instances.length === 0 ? (
        <div className={styles.monsterEmptyState}>
          <p>No monster instances created yet.</p>
          <p>Create instances from the Browse tab or create custom ones here.</p>
        </div>
      ) : (
        <div className={styles.monsterInstancesGrid}>
          {instances.map(renderInstanceCard)}
        </div>
      )}
    </div>
  );

  const renderSelectedMonsterDetails = () => {
    if (!selectedTemplate) return null;
    
    return (
      <div className={styles.monsterDetailsPanel}>
        <div className={styles.monsterDetailsHeader}>
          <h3>{selectedTemplate.name}</h3>
          <button
            onClick={() => setSelectedTemplate(null)}
            className="monster-btn monster-btn-secondary monster-btn-small"
          >
            ✕
          </button>
        </div>
        
        <div className={styles.monsterDetailsContent}>
          <div className={styles.monsterDetailsBasic}>
            <p><strong>Type:</strong> {selectedTemplate.size} {selectedTemplate.type}
              {selectedTemplate.subtype && ` (${selectedTemplate.subtype})`}, {selectedTemplate.alignment}
            </p>
            <p><strong>Challenge Rating:</strong> {selectedTemplate.challengeRating} ({selectedTemplate.experiencePoints} XP)</p>
            <p><strong>Armor Class:</strong> {selectedTemplate.armorClass}</p>
            <p><strong>Hit Points:</strong> {selectedTemplate.hitPoints.average} ({selectedTemplate.hitPoints.formula})</p>
            <p><strong>Speed:</strong> {Object.entries(selectedTemplate.speed).map(([type, speed]) => 
              `${type === 'walk' ? '' : type + ' '}${speed} ft.`
            ).join(', ')}</p>
          </div>
          
          {renderStatBlock(selectedTemplate.stats)}
          
          {selectedTemplate.abilities.length > 0 && (
            <div className={styles.monsterAbilities}>
              <h4>Abilities</h4>
              {selectedTemplate.abilities.map(ability => (
                <div key={ability.id} className={styles.monsterAbility}>
                  <h5>{ability.name} <span className={styles.abilityType}>({ability.type.replace('_', ' ')})</span></h5>
                  <p>{ability.description}</p>
                </div>
              ))}
            </div>
          )}
          
          <div className={styles.monsterDetailsActions}>
            <button
              onClick={() => createInstance(selectedTemplate)}
              className="monster-btn monster-btn-primary"
            >
              Create Instance
            </button>
            <button
              onClick={() => {
                const instance = monsterCreationSystem.createInstance(selectedTemplate.id);
                if (instance) {
                  handlePlaceOnTable(instance);
                }
              }}
              className="monster-btn monster-btn-secondary"
            >
              Create & Place on Table
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return createPortal(
    <div className={styles.monsterPanelOverlay} onClick={onClose}>
      <div className={styles.monsterPanel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.monsterPanelHeader}>
          <h3>Monster Creation & Management</h3>
          <button onClick={onClose} className={styles.monsterPanelClose}>×</button>
        </div>

        <div className={styles.monsterPanelTabs}>
          {[
            { id: 'browse', label: 'Browse Monsters', icon: '📚', count: searchResults.length },
            { id: 'instances', label: 'Instances', icon: '⚔️', count: instances.length },
            { id: 'create', label: 'Create Custom', icon: '🛠️' },
            { id: 'encounters', label: 'Encounters', icon: '🎲' }
          ].map(tab => (
            <button
              key={tab.id}
              className={`monster-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id as ActiveTab)}
            >
              <span className={styles.monsterTabIcon}>{tab.icon}</span>
              <span className={styles.monsterTabLabel}>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span className={styles.monsterTabCount}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        <div className={styles.monsterPanelContent}>
          <div className={styles.monsterMainContent}>
            {activeTab === 'browse' && renderBrowseTab()}
            {activeTab === 'instances' && renderInstancesTab()}
            {activeTab === 'create' && (
              <div className={styles.monsterCreateTab}>
                <p>Custom monster creation coming soon!</p>
              </div>
            )}
            {activeTab === 'encounters' && (
              <div className={styles.monsterEncountersTab}>
                <p>Encounter builder coming soon!</p>
              </div>
            )}
          </div>
          
          {selectedTemplate && renderSelectedMonsterDetails()}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default MonsterCreationPanel;


