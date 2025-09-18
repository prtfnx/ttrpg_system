import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { equipmentManagementService, type Equipment, EquipmentCategory, type InventoryItem, type CharacterInventory } from '../../services/equipmentManagement.service';
import { ErrorBoundary } from '../common/ErrorBoundary';
import type { WizardFormData } from './WizardFormData';
import './EquipmentSelectionStep.css';

interface EquipmentSelectionStepProps {
  characterClass: string;
  characterLevel: number;
  abilityScores: Record<string, number>;
  onNext: () => void;
  onBack: () => void;
}

interface EquipmentFilters {
  category: string[];
  search: string;
  priceRange: {
    min: number;
    max: number;
  };
}

export const EquipmentSelectionStep: React.FC<EquipmentSelectionStepProps> = ({
  characterClass,
  abilityScores,
  onNext,
  onBack
}) => {
  const { setValue, watch } = useFormContext<WizardFormData>();
  const currentEquipment = watch('equipment') || {
    items: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    carrying_capacity: { current_weight: 0, max_weight: 0, encumbered_at: 0, heavily_encumbered_at: 0 }
  };

  const [availableEquipment] = useState<Equipment[]>(equipmentManagementService.getAllEquipment());
  const [filters, setFilters] = useState<EquipmentFilters>({
    category: [],
    search: '',
    priceRange: { min: 0, max: 1000 }
  });

  // Get starting equipment for the class
  const startingEquipment = useMemo(() => 
    equipmentManagementService.getStartingEquipment(characterClass),
    [characterClass]
  );

  // Get class proficiencies
  const classProficiencies = useMemo(() =>
    equipmentManagementService.getClassProficiencies(characterClass),
    [characterClass]
  );

  // Calculate carrying capacity
  const carryingCapacity = useMemo(() =>
    equipmentManagementService.getCarryingCapacity(abilityScores.Strength || 10),
    [abilityScores.Strength]
  );

  // Filter equipment based on current filters
  const filteredEquipment = useMemo(() => {
    let equipment = availableEquipment;

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      equipment = equipment.filter(item =>
        item.name.toLowerCase().includes(searchLower) ||
        item.description.toLowerCase().includes(searchLower)
      );
    }

    // Category filter
    if (filters.category.length > 0) {
      equipment = equipment.filter(item => filters.category.includes(item.category));
    }

    // Price range filter
    equipment = equipment.filter(item => {
      const costInGold = equipmentManagementService.convertCostToGold(item.cost);
      return costInGold >= filters.priceRange.min && costInGold <= filters.priceRange.max;
    });

    // Sort by category, then name
    return equipment.sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return a.name.localeCompare(b.name);
    });
  }, [availableEquipment, filters]);

  // Group equipment by category for display
  const equipmentByCategory = useMemo(() => {
    const groups: Record<string, Equipment[]> = {};
    filteredEquipment.forEach(item => {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    });
    return groups;
  }, [filteredEquipment]);

  // Initialize with starting equipment
  useEffect(() => {
    const startingItems: InventoryItem[] = startingEquipment.equipment.map(equipment => ({
      equipment,
      quantity: 1,
      equipped: false
    }));

    // Add starting gold (simplified - using average starting wealth)
    const startingGold = characterClass === 'Fighter' ? 125 : characterClass === 'Wizard' ? 100 : 80;

    setValue('equipment', {
      items: startingItems,
      currency: { cp: 0, sp: 0, ep: 0, gp: startingGold, pp: 0 },
      carrying_capacity: {
        ...carryingCapacity,
        current_weight: equipmentManagementService.calculateTotalWeight(startingItems)
      }
    });
  }, [startingEquipment, characterClass, carryingCapacity, setValue]);

  // Handle adding equipment to inventory
  const handleAddEquipment = useCallback((equipment: Equipment) => {
    const existingItem = currentEquipment.items.find(item => item.equipment.name === equipment.name);
    
    let newItems: InventoryItem[];
    if (existingItem) {
      // Increase quantity
      newItems = currentEquipment.items.map(item =>
        item.equipment.name === equipment.name
          ? { ...item, quantity: item.quantity + 1 }
          : item
      );
    } else {
      // Add new item
      newItems = [...currentEquipment.items, {
        equipment,
        quantity: 1,
        equipped: false
      }];
    }

    const totalWeight = equipmentManagementService.calculateTotalWeight(newItems);

    setValue('equipment', {
      ...currentEquipment,
      items: newItems,
      carrying_capacity: {
        ...carryingCapacity,
        current_weight: totalWeight
      }
    });
  }, [currentEquipment, carryingCapacity, setValue]);

  // Handle removing equipment from inventory
  const handleRemoveEquipment = useCallback((equipmentName: string) => {
    const newItems = currentEquipment.items.reduce((acc: InventoryItem[], item) => {
      if (item.equipment.name === equipmentName) {
        if (item.quantity > 1) {
          acc.push({ ...item, quantity: item.quantity - 1 });
        }
        // If quantity is 1, don't add it back (remove completely)
      } else {
        acc.push(item);
      }
      return acc;
    }, []);

    const totalWeight = equipmentManagementService.calculateTotalWeight(newItems);

    setValue('equipment', {
      ...currentEquipment,
      items: newItems,
      carrying_capacity: {
        ...carryingCapacity,
        current_weight: totalWeight
      }
    });
  }, [currentEquipment, carryingCapacity, setValue]);

  // Handle filter changes
  const handleFilterChange = useCallback((key: keyof EquipmentFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({
      category: [],
      search: '',
      priceRange: { min: 0, max: 1000 }
    });
  }, []);

  // Check if character can afford an item
  const canAfford = useCallback((equipment: Equipment): boolean => {
    return equipmentManagementService.canAfford(equipment.cost, currentEquipment.currency);
  }, [currentEquipment.currency]);

  // Check if adding item would exceed carrying capacity
  const wouldExceedCapacity = useCallback((equipment: Equipment): boolean => {
    return currentEquipment.carrying_capacity.current_weight + equipment.weight > 
           currentEquipment.carrying_capacity.max_weight;
  }, [currentEquipment.carrying_capacity]);

  // Check if character is proficient with equipment
  const isProficient = useCallback((equipment: Equipment): boolean => {
    // This is a simplified check - in a full implementation, we'd check specific proficiencies
    if (equipment.category === EquipmentCategory.WEAPON) {
      const weapon = equipment as any;
      return classProficiencies.weapons.some(prof => 
        weapon.proficiency_required?.includes(prof) || prof.includes(weapon.name)
      );
    }
    if (equipment.category === EquipmentCategory.ARMOR || equipment.category === EquipmentCategory.SHIELD) {
      return classProficiencies.armor.some(prof => 
        equipment.name.includes(prof) || prof.includes('armor')
      );
    }
    return true; // Assume proficient with gear and tools
  }, [classProficiencies]);

  return (
    <ErrorBoundary fallback={<div>Error loading equipment selection</div>}>
      <div className="equipment-selection-step">
        <div className="step-header">
          <h2>Select Starting Equipment</h2>
          <p>Choose your starting equipment for {characterClass}</p>
        </div>

        <div className="equipment-layout">
          {/* Inventory Panel */}
          <div className="inventory-panel">
            <h3>Current Inventory</h3>
            
            {/* Currency Display */}
            <div className="currency-display">
              <h4>Currency</h4>
              <div className="currency-grid">
                <span>CP: {currentEquipment.currency.cp}</span>
                <span>SP: {currentEquipment.currency.sp}</span>
                <span>EP: {currentEquipment.currency.ep}</span>
                <span>GP: {currentEquipment.currency.gp}</span>
                <span>PP: {currentEquipment.currency.pp}</span>
              </div>
            </div>

            {/* Carrying Capacity */}
            <div className="carrying-capacity">
              <h4>Carrying Capacity</h4>
              <div className="capacity-bar">
                <div 
                  className="capacity-fill"
                  style={{ 
                    width: `${Math.min(100, (currentEquipment.carrying_capacity.current_weight / currentEquipment.carrying_capacity.max_weight) * 100)}%`,
                    backgroundColor: currentEquipment.carrying_capacity.current_weight > currentEquipment.carrying_capacity.heavily_encumbered_at 
                      ? '#dc2626' 
                      : currentEquipment.carrying_capacity.current_weight > currentEquipment.carrying_capacity.encumbered_at 
                      ? '#f59e0b' 
                      : '#10b981'
                  }}
                />
              </div>
              <span className="capacity-text">
                {currentEquipment.carrying_capacity.current_weight} / {currentEquipment.carrying_capacity.max_weight} lbs
              </span>
            </div>

            {/* Inventory Items */}
            <div className="inventory-items">
              <h4>Items</h4>
              {currentEquipment.items.length === 0 ? (
                <p className="empty-inventory">No items selected</p>
              ) : (
                <div className="item-list">
                  {currentEquipment.items.map((item, index) => (
                    <div key={`${item.equipment.name}-${index}`} className="inventory-item">
                      <div className="item-info">
                        <span className="item-name">{item.equipment.name}</span>
                        <span className="item-quantity">x{item.quantity}</span>
                      </div>
                      <div className="item-actions">
                        <button 
                          onClick={() => handleRemoveEquipment(item.equipment.name)}
                          className="remove-button"
                          aria-label={`Remove ${item.equipment.name}`}
                        >
                          −
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Equipment Selection Panel */}
          <div className="equipment-selection-panel">
            {/* Filters */}
            <div className="equipment-filters">
              <div className="filter-row">
                <input
                  type="text"
                  placeholder="Search equipment..."
                  value={filters.search}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                  className="search-input"
                />

                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      handleFilterChange('category', [...filters.category, e.target.value]);
                    }
                  }}
                  className="filter-select"
                >
                  <option value="">Filter by Category</option>
                  {Object.values(EquipmentCategory).map(category => (
                    <option
                      key={category}
                      value={category}
                      disabled={filters.category.includes(category)}
                    >
                      {category.charAt(0).toUpperCase() + category.slice(1)}
                    </option>
                  ))}
                </select>

                <button onClick={clearFilters} className="clear-filters">
                  Clear Filters
                </button>
              </div>

              {/* Active filters */}
              {filters.category.length > 0 && (
                <div className="active-filters">
                  {filters.category.map(category => (
                    <span key={category} className="filter-tag">
                      {category.charAt(0).toUpperCase() + category.slice(1)}
                      <button
                        onClick={() => handleFilterChange('category', filters.category.filter(c => c !== category))}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Equipment List */}
            <div className="equipment-list">
              {Object.keys(equipmentByCategory)
                .sort()
                .map(category => {
                  const items = equipmentByCategory[category];
                  const categoryName = category.charAt(0).toUpperCase() + category.slice(1);

                  return (
                    <div key={category} className="equipment-category">
                      <h3 className="category-header">{categoryName}</h3>
                      <div className="equipment-grid">
                        {items.map(equipment => {
                          const affordable = canAfford(equipment);
                          const fitsCapacity = !wouldExceedCapacity(equipment);
                          const proficient = isProficient(equipment);
                          const canAdd = affordable && fitsCapacity;

                          return (
                            <div
                              key={equipment.name}
                              className={`equipment-card ${!canAdd ? 'disabled' : ''} ${!proficient ? 'not-proficient' : ''}`}
                            >
                              <div className="equipment-header">
                                <h4 className="equipment-name">{equipment.name}</h4>
                                <div className="equipment-meta">
                                  <span className="equipment-cost">
                                    {equipment.cost.quantity} {equipment.cost.unit.toUpperCase()}
                                  </span>
                                  <span className="equipment-weight">{equipment.weight} lb</span>
                                </div>
                              </div>

                              <div className="equipment-description">
                                <p>{equipment.description}</p>
                              </div>

                              <div className="equipment-actions">
                                <button
                                  onClick={() => canAdd ? handleAddEquipment(equipment) : null}
                                  className={`add-button ${!canAdd ? 'disabled' : ''}`}
                                  disabled={!canAdd}
                                >
                                  Add to Inventory
                                </button>
                              </div>

                              {/* Status indicators */}
                              <div className="equipment-status">
                                {!affordable && <span className="status-tag unaffordable">Can't afford</span>}
                                {!fitsCapacity && <span className="status-tag overweight">Too heavy</span>}
                                {!proficient && <span className="status-tag not-proficient">Not proficient</span>}
                                {proficient && <span className="status-tag proficient">Proficient</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Step Navigation */}
        <div className="step-navigation">
          <button onClick={onBack} className="nav-button secondary">
            ← Back
          </button>
          
          <button onClick={onNext} className="nav-button primary">
            Next →
          </button>
        </div>
      </div>
    </ErrorBoundary>
  );
};