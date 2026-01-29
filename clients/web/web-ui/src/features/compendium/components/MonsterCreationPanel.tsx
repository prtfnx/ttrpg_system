/**
 * Monster Creation & Management Panel
 * Production-ready React UI for creating and managing monsters from compendium data
 * with search, filtering, instance management, and table placement
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import '../../../styles/MonsterCreationPanel.css';
import {
  monsterCreationSystem,
  type MonsterInstance,
  type MonsterSearchFilters,
  type MonsterStats,
  type MonsterTemplate
} from '../services/monsterCreation.service';

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
    <div className="monster-stat-block">
      {Object.entries(stats).map(([stat, value]) => (
        <div key={stat} className="monster-stat">
          <span className="monster-stat-name">{stat.substring(0, 3).toUpperCase()}</span>
          <span className="monster-stat-value">{value}</span>
          <span className="monster-stat-modifier">
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
      <div className="monster-card-header">
        <h4 className="monster-name">{template.name}</h4>
        <span className="monster-cr">CR {template.challengeRating}</span>
      </div>
      
      <div className="monster-basic-info">
        <span className="monster-type">{template.size} {template.type}</span>
        {template.subtype && <span className="monster-subtype">({template.subtype})</span>}
      </div>
      
      <div className="monster-vital-stats">
        <div className="monster-vital-stat">
          <span className="label">AC</span>
          <span className="value">{template.armorClass}</span>
        </div>
        <div className="monster-vital-stat">
          <span className="label">HP</span>
          <span className="value">{template.hitPoints.average}</span>
        </div>
        <div className="monster-vital-stat">
          <span className="label">Speed</span>
          <span className="value">{template.speed.walk} ft.</span>
        </div>
      </div>
      
      <div className="monster-tags">
        {template.tags.slice(0, 3).map(tag => (
          <span key={tag} className="monster-tag">{tag}</span>
        ))}
        {template.tags.length > 3 && <span className="monster-tag-more">+{template.tags.length - 3}</span>}
      </div>
      
      <div className="monster-card-actions">
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
          <span className="monster-feature-icon" title="Spellcaster">🔮</span>
        )}
        {template.legendary && (
          <span className="monster-feature-icon" title="Legendary">⭐</span>
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
      <div className="monster-instance-header">
        <h4 className="monster-instance-name">{instance.name}</h4>
        <div className="monster-instance-actions">
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
      
      <div className="monster-instance-info">
        <span className="monster-instance-template">{instance.template.name}</span>
        <span className="monster-instance-cr">CR {instance.template.challengeRating}</span>
      </div>
      
      <div className="monster-instance-health">
        <div className="monster-health-bar">
          <div 
            className="monster-health-fill"
            style={{ 
              width: `${(instance.currentHitPoints / instance.maxHitPoints) * 100}%`,
              backgroundColor: instance.currentHitPoints > instance.maxHitPoints * 0.5 ? '#4caf50' :
                             instance.currentHitPoints > instance.maxHitPoints * 0.25 ? '#ff9800' : '#f44336'
            }}
          />
        </div>
        <div className="monster-health-text">
          <input
            type="number"
            value={instance.currentHitPoints}
            onChange={(e) => updateInstanceHP(instance.id, parseInt(e.target.value) || 0)}
            className="monster-hp-input"
            min="0"
            max={instance.maxHitPoints + instance.temporaryHitPoints}
          />
          <span>/ {instance.maxHitPoints} HP</span>
        </div>
      </div>
      
      {instance.conditions.length > 0 && (
        <div className="monster-conditions">
          {instance.conditions.map(condition => (
            <span key={condition} className="monster-condition">{condition}</span>
          ))}
        </div>
      )}
    </div>
  );

  const renderFiltersPanel = () => (
    <div className={`monster-filters-panel ${showFilters ? 'visible' : ''}`}>
      <div className="monster-filter-group">
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
      
      <div className="monster-filter-group">
        <label>Size:</label>
        <div className="monster-filter-checkboxes">
          {MONSTER_SIZES.map(size => (
            <label key={size} className="monster-checkbox">
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
      
      <div className="monster-filter-group">
        <label>Challenge Rating:</label>
        <div className="monster-filter-range">
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
      
      <div className="monster-filter-group">
        <label className="monster-checkbox">
          <input
            type="checkbox"
            checked={filters.hasSpells || false}
            onChange={(e) => handleFilterChange('hasSpells', e.target.checked || undefined)}
          />
          <span>Spellcasters Only</span>
        </label>
      </div>
      
      <div className="monster-filter-group">
        <label className="monster-checkbox">
          <input
            type="checkbox"
            checked={filters.hasLegendaryActions || false}
            onChange={(e) => handleFilterChange('hasLegendaryActions', e.target.checked || undefined)}
          />
          <span>Legendary Creatures Only</span>
        </label>
      </div>
      
      <div className="monster-filter-actions">
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
    <div className="monster-browse-tab">
      <div className="monster-search-header">
        <div className="monster-search-bar">
          <input
            type="text"
            placeholder="Search monsters..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="monster-search-input"
          />
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`monster-btn monster-btn-secondary ${showFilters ? 'active' : ''}`}
          >
            🔍 Filters
          </button>
        </div>
        
        <div className="monster-search-controls">
          <div className="monster-sort-controls">
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
          
          <div className="monster-view-controls">
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
      
      <div className="monster-search-results">
        <div className="monster-results-info">
          <span>Found {searchResults.length} monsters</span>
          {searchResults.length > itemsPerPage && (
            <span>Showing {startIndex + 1}-{Math.min(endIndex, searchResults.length)}</span>
          )}
        </div>
        
        {loading ? (
          <div className="monster-loading">Loading monsters...</div>
        ) : (
          <div className={`monster-results-grid ${previewMode === 'list' ? 'list-view' : 'card-view'}`}>
            {currentResults.map(renderMonsterCard)}
          </div>
        )}
        
        {totalPages > 1 && (
          <div className="monster-pagination">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="monster-btn monster-btn-secondary"
            >
              Previous
            </button>
            
            <span className="monster-page-info">
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
    <div className="monster-instances-tab">
      <div className="monster-instances-header">
        <h4>Monster Instances ({instances.length})</h4>
        <div className="monster-instances-actions">
          <button
            onClick={() => console.log('Custom instance creation coming soon!')}
            className="monster-btn monster-btn-primary"
          >
            Create Custom Instance
          </button>
        </div>
      </div>
      
      {instances.length === 0 ? (
        <div className="monster-empty-state">
          <p>No monster instances created yet.</p>
          <p>Create instances from the Browse tab or create custom ones here.</p>
        </div>
      ) : (
        <div className="monster-instances-grid">
          {instances.map(renderInstanceCard)}
        </div>
      )}
    </div>
  );

  const renderSelectedMonsterDetails = () => {
    if (!selectedTemplate) return null;
    
    return (
      <div className="monster-details-panel">
        <div className="monster-details-header">
          <h3>{selectedTemplate.name}</h3>
          <button
            onClick={() => setSelectedTemplate(null)}
            className="monster-btn monster-btn-secondary monster-btn-small"
          >
            ✕
          </button>
        </div>
        
        <div className="monster-details-content">
          <div className="monster-details-basic">
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
            <div className="monster-abilities">
              <h4>Abilities</h4>
              {selectedTemplate.abilities.map(ability => (
                <div key={ability.id} className="monster-ability">
                  <h5>{ability.name} <span className="ability-type">({ability.type.replace('_', ' ')})</span></h5>
                  <p>{ability.description}</p>
                </div>
              ))}
            </div>
          )}
          
          <div className="monster-details-actions">
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
    <div className="monster-panel-overlay" onClick={onClose}>
      <div className="monster-panel" onClick={(e) => e.stopPropagation()}>
        <div className="monster-panel-header">
          <h3>Monster Creation & Management</h3>
          <button onClick={onClose} className="monster-panel-close">×</button>
        </div>

        <div className="monster-panel-tabs">
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
              <span className="monster-tab-icon">{tab.icon}</span>
              <span className="monster-tab-label">{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span className="monster-tab-count">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        <div className="monster-panel-content">
          <div className="monster-main-content">
            {activeTab === 'browse' && renderBrowseTab()}
            {activeTab === 'instances' && renderInstancesTab()}
            {activeTab === 'create' && (
              <div className="monster-create-tab">
                <p>Custom monster creation coming soon!</p>
              </div>
            )}
            {activeTab === 'encounters' && (
              <div className="monster-encounters-tab">
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