import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import {
  equipmentManagementService,
  equipmentToWizardItem,
  type Equipment,
  type WizardEquipmentItem
} from '../../services/equipmentManagement.service';
import { ErrorBoundary } from '../common/ErrorBoundary';
import './EquipmentSelectionStep.css';
import type { WizardFormData } from './WizardFormData';

interface EquipmentSelectionStepProps {
  characterClass: string;
  abilityScores: Record<string, number>;
  onNext: () => void;
  onBack: () => void;
}

export const EquipmentSelectionStep: React.FC<EquipmentSelectionStepProps> = ({
  characterClass,
  abilityScores,
  onNext,
  onBack
}) => {
  const { setValue, watch } = useFormContext<WizardFormData>();
  
  // Get current equipment from form
  const currentEquipment = watch('equipment') || {
    items: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    carrying_capacity: {
      current_weight: 0,
      max_weight: 0,
      encumbered_at: 0,
      heavily_encumbered_at: 0
    }
  };

  // Local state
  const [availableEquipment, setAvailableEquipment] = useState<Equipment[]>([]);
  const [selectedItems, setSelectedItems] = useState<WizardEquipmentItem[]>([]);
  const [filteredEquipment, setFilteredEquipment] = useState<Equipment[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [startingGold, setStartingGold] = useState(0);
  const [currentGold, setCurrentGold] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Equipment categories for filtering
  const equipmentCategories = useMemo(() => [
    'all',
    'weapons',
    'armor', 
    'adventuring-gear',
    'tools',
    'mounts-vehicles',
    'trade-goods',
    'magic-items'
  ], []);

  // Load available equipment on mount
  useEffect(() => {
    const loadEquipment = async () => {
      try {
        setLoading(true);
        const equipment = await equipmentManagementService.getAllEquipment();
        setAvailableEquipment(equipment);
        
        // Calculate starting gold based on class
        const startingMoney = calculateStartingGold(characterClass);
        setStartingGold(startingMoney);
        setCurrentGold(startingMoney);
        
        // Convert existing equipment items to wizard format
        const wizardItems = currentEquipment.items.map(item => ({
          equipment: item.equipment,
          quantity: item.quantity,
          equipped: item.equipped
        }));
        setSelectedItems(wizardItems);
        
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load equipment');
        console.error('Error loading equipment:', err);
      } finally {
        setLoading(false);
      }
    };

    loadEquipment();
  }, [characterClass, currentEquipment]); // Watch the whole object, not just .items

  // Filter equipment based on search and category
  useEffect(() => {
    let filtered = availableEquipment;

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(item => 
        item.category?.toLowerCase() === selectedCategory
      );
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(term) ||
        item.description?.toLowerCase().includes(term)
      );
    }

    setFilteredEquipment(filtered);
  }, [availableEquipment, selectedCategory, searchTerm]);

  // Calculate starting gold based on character class
  const calculateStartingGold = (className: string): number => {
    const goldByClass: Record<string, number> = {
      barbarian: 80,    // 2d4 × 10 gp
      bard: 125,        // 5d4 × 10 gp
      cleric: 125,      // 5d4 × 10 gp
      druid: 80,        // 2d4 × 10 gp
      fighter: 125,     // 5d4 × 10 gp
      monk: 20,         // 5d4 gp
      paladin: 125,     // 5d4 × 10 gp
      ranger: 125,      // 5d4 × 10 gp
      rogue: 100,       // 4d4 × 10 gp
      sorcerer: 75,     // 3d4 × 10 gp
      warlock: 100,     // 4d4 × 10 gp
      wizard: 100       // 4d4 × 10 gp
    };
    
    return goldByClass[className.toLowerCase()] || 100;
  };

  // Calculate carrying capacity
  const calculateCarryingCapacity = useCallback(() => {
    const strengthScore = abilityScores?.strength || 10;
    const baseCapacity = strengthScore * 15; // Standard D&D rule
    
    return {
      max_weight: baseCapacity,
      encumbered_at: baseCapacity * 0.67, // 2/3 capacity
      heavily_encumbered_at: baseCapacity * 0.83, // 5/6 capacity
      current_weight: selectedItems.reduce((total, item) => 
        total + (item.equipment.weight * item.quantity), 0
      )
    };
  }, [abilityScores, selectedItems]); // Watch the whole abilityScores object, not individual properties

  // Add item to selection
  const addItem = useCallback((equipment: Equipment) => {
    const cost = equipment.cost?.quantity || 0;
    
    if (currentGold < cost) {
      setError(`Not enough gold! Need ${cost} gp but only have ${currentGold} gp`);
      return;
    }

    const wizardItem = equipmentToWizardItem(equipment, 1);
    const existingIndex = selectedItems.findIndex(item => item.equipment.name === equipment.name);
    
    if (existingIndex >= 0) {
      // Increase quantity of existing item
      const updatedItems = [...selectedItems];
      updatedItems[existingIndex].quantity += 1;
      setSelectedItems(updatedItems);
    } else {
      // Add new item
      setSelectedItems(prev => [...prev, wizardItem]);
    }
    
    setCurrentGold(prev => prev - cost);
    setError(null);
  }, [currentGold, selectedItems]);

  // Remove item from selection
  const removeItem = useCallback((index: number) => {
    const item = selectedItems[index];
    const equipment = availableEquipment.find(eq => eq.name === item.equipment.name);
    const refund = equipment?.cost?.quantity || 0;
    
    if (item.quantity > 1) {
      // Decrease quantity
      const updatedItems = [...selectedItems];
      updatedItems[index].quantity -= 1;
      setSelectedItems(updatedItems);
    } else {
      // Remove item completely
      setSelectedItems(prev => prev.filter((_, i) => i !== index));
    }
    
    setCurrentGold(prev => prev + refund);
  }, [selectedItems, availableEquipment]);

  // Update form with selected equipment
  const updateFormEquipment = useCallback(() => {
    const inventoryItems = selectedItems.map(item => {
      const equipment = availableEquipment.find(eq => eq.name === item.equipment.name)!;
      return {
        equipment: {
          name: equipment.name,
          weight: equipment.weight,
          cost: {
            amount: equipment.cost.quantity,
            unit: equipment.cost.unit
          }
        },
        quantity: item.quantity,
        equipped: item.equipped
      };
    });
    const carryingCapacity = calculateCarryingCapacity();
    
    setValue('equipment', {
      items: inventoryItems,
      currency: {
        cp: 0,
        sp: 0, 
        ep: 0,
        gp: currentGold,
        pp: 0
      },
      carrying_capacity: carryingCapacity
    });
  }, [selectedItems, currentGold, calculateCarryingCapacity, setValue]);

  // Handle next step
  const handleNext = useCallback(() => {
    updateFormEquipment();
    onNext();
  }, [updateFormEquipment, onNext]);

  // Calculate total weight and check encumbrance
  const { totalWeight, isEncumbered, isHeavilyEncumbered } = useMemo(() => {
    const weight = selectedItems.reduce((total, item) => total + (item.equipment.weight * item.quantity), 0);
    const capacity = calculateCarryingCapacity();
    
    return {
      totalWeight: weight,
      isEncumbered: weight >= capacity.encumbered_at,
      isHeavilyEncumbered: weight >= capacity.heavily_encumbered_at
    };
  }, [selectedItems, calculateCarryingCapacity]);

  if (loading) {
    return (
      <div className="equipment-selection-step loading">
        <div className="loading-spinner">Loading equipment...</div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="equipment-selection-step">
        <h2>Select Starting Equipment</h2>
        
        {error && (
          <div className="error-message">
            <span className="error-icon">⚠️</span>
            {error}
          </div>
        )}

        {/* Equipment Summary */}
        <div className="equipment-summary">
          <div className="summary-item">
            <span className="label">Starting Gold:</span>
            <span className="value">{startingGold} gp</span>
          </div>
          <div className="summary-item">
            <span className="label">Remaining Gold:</span>
            <span className="value">{currentGold} gp</span>
          </div>
          <div className="summary-item">
            <span className="label">Total Weight:</span>
            <span className={`value ${isHeavilyEncumbered ? 'heavily-encumbered' : isEncumbered ? 'encumbered' : ''}`}>
              {totalWeight.toFixed(1)} lbs
              {isHeavilyEncumbered && ' (Heavily Encumbered)'}
              {isEncumbered && !isHeavilyEncumbered && ' (Encumbered)'}
            </span>
          </div>
        </div>

        <div className="equipment-content">
          {/* Equipment Filters */}
          <div className="equipment-filters">
            <div className="search-container">
              <input
                type="text"
                placeholder="Search equipment..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
            
            <div className="category-filters">
              {equipmentCategories.map(category => (
                <button
                  key={category}
                  className={`category-button ${selectedCategory === category ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(category)}
                >
                  {category.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </button>
              ))}
            </div>
          </div>

          {/* Available Equipment */}
          <div className="available-equipment">
            <h3>Available Equipment ({filteredEquipment.length})</h3>
            <div className="equipment-grid">
              {filteredEquipment.map((equipment) => (
                <div key={equipment.name} className="equipment-card">
                  <div className="equipment-header">
                    <h4>{equipment.name}</h4>
                    <div className="equipment-cost">
                      {equipment.cost?.quantity || 0} {equipment.cost?.unit || 'gp'}
                    </div>
                  </div>
                  
                  {equipment.description && (
                    <p className="equipment-description">
                      {equipment.description}
                    </p>
                  )}
                  
                  <div className="equipment-stats">
                    <span className="weight">Weight: {equipment.weight || 0} lbs</span>
                    {equipment.category && (
                      <span className="category">{equipment.category}</span>
                    )}
                  </div>
                  
                  <button
                    className="add-equipment-button"
                    onClick={() => addItem(equipment)}
                    disabled={currentGold < (equipment.cost?.quantity || 0)}
                  >
                    Add to Inventory
                  </button>
                </div>
              ))}
              
              {filteredEquipment.length === 0 && (
                <div className="no-equipment">
                  No equipment found matching your criteria.
                </div>
              )}
            </div>
          </div>

          {/* Selected Equipment */}
          <div className="selected-equipment">
            <h3>Selected Equipment ({selectedItems.length})</h3>
            {selectedItems.length > 0 ? (
              <div className="selected-items">
                {selectedItems.map((item, index) => (
                  <div key={`${item.equipment.name}-${index}`} className="selected-item">
                    <div className="item-info">
                      <span className="item-name">{item.equipment.name}</span>
                      <span className="item-quantity">x{item.quantity}</span>
                      <span className="item-weight">{(item.equipment.weight * item.quantity).toFixed(1)} lbs</span>
                    </div>
                    <div className="item-actions">
                      <button
                        className="remove-button"
                        onClick={() => removeItem(index)}
                        title="Remove one"
                      >
                        ➖
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-selected">
                No equipment selected yet.
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div className="step-navigation">
          <button
            type="button"
            onClick={onBack}
            className="nav-button back-button"
          >
            ← Back
          </button>
          
          <button
            type="button"
            onClick={handleNext}
            className="nav-button next-button"
            disabled={isHeavilyEncumbered}
            title={isHeavilyEncumbered ? 'Cannot proceed while heavily encumbered' : ''}
          >
            Next →
          </button>
        </div>
      </div>
    </ErrorBoundary>
  );
};