import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import {
    equipmentManagementService,
    equipmentToWizardItem,
    type Equipment,
    type WizardEquipmentItem
} from '../../services/equipmentManagement.service';
import { ErrorBoundary } from '../common/ErrorBoundary';
import styles from './EquipmentSelectionStep.module.css';
import type { WizardFormData } from './WizardFormData';

interface EquipmentSelectionStepProps {
  characterClass?: string;
  abilityScores?: Record<string, number>;
  onNext: () => void;
  onBack?: () => void;
  onPrevious?: () => void;
}

export const EquipmentSelectionStep: React.FC<EquipmentSelectionStepProps> = ({
  characterClass: propCharacterClass,
  abilityScores: propAbilityScores,
  onNext,
  onBack,
  onPrevious
}) => {
  const { setValue, getValues } = useFormContext<WizardFormData>();
  
  // Get data from form context if not provided as props
  const formData = getValues();
  const characterClass = propCharacterClass || formData.class || 'fighter';
  const abilityScores = propAbilityScores || {
    strength: formData.strength || 10,
    dexterity: formData.dexterity || 10,
    constitution: formData.constitution || 10,
    intelligence: formData.intelligence || 10,
    wisdom: formData.wisdom || 10,
    charisma: formData.charisma || 10
  };
  
  const handleBack = onBack || onPrevious;
  
  // Use ref to track if we're in initial load to prevent infinite loop
  const initialLoadRef = React.useRef(true);
  const previousItemsRef = React.useRef<string>('');
  
  console.log('🎒 EquipmentSelectionStep - RENDERING');
  console.log('🎒 EquipmentSelectionStep - characterClass:', characterClass);

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
    'weapon',
    'armor',
    'shield', 
    'gear',
    'tool'
  ], []);

  // Load available equipment on mount - only once!
  useEffect(() => {
    const loadEquipment = async () => {
      try {
        setLoading(true);
        console.log('🎒 Loading equipment for class:', characterClass);
        const equipment = await equipmentManagementService.getAllEquipment();
        console.log('🎒 Loaded equipment count:', equipment.length);
        console.log('🎒 First 3 equipment items:', equipment.slice(0, 3));
        
        // Validate equipment data structure
        const validEquipment = equipment.filter(item => {
          if (!item.name) {
            console.warn('🎒 Equipment item missing name:', item);
            return false;
          }
          return true;
        });
        
        console.log('🎒 Valid equipment count:', validEquipment.length);
        setAvailableEquipment(validEquipment);
        
        // Calculate starting gold based on class
        const startingMoney = calculateStartingGold(characterClass);
        setStartingGold(startingMoney);
        setCurrentGold(startingMoney);
        
        // Convert existing equipment items to wizard format
        // Guard against undefined or missing items array
        const existingItems = formData.equipment?.items;
        if (existingItems && Array.isArray(existingItems) && existingItems.length > 0) {
          console.log('🎒 Loading existing equipment items:', existingItems);
          const wizardItems: WizardEquipmentItem[] = [];
          
          for (const item of existingItems) {
            const itemAny = item as any; // Type assertion for old format compatibility
            
            // Check if item is in new wizard format: {equipment: {...}, quantity, equipped}
            if (item.equipment && typeof item.equipment === 'object' && 'name' in item.equipment) {
              wizardItems.push({
                equipment: item.equipment,
                quantity: item.quantity || 1,
                equipped: item.equipped
              } as WizardEquipmentItem);
            }
            // Check if item is in old format: {name, quantity, equipped, weight}
            else if (itemAny.name && typeof itemAny.name === 'string') {
              console.log('🎒 Converting old format item:', itemAny);
              // Find the full equipment data from available equipment
              const fullEquipment = validEquipment.find(eq => eq.name === itemAny.name);
              if (fullEquipment) {
                wizardItems.push(equipmentToWizardItem(fullEquipment, itemAny.quantity || 1, itemAny.equipped));
              } else {
                console.warn('🎒 Could not find equipment data for:', itemAny.name);
              }
            } else {
              console.warn('🎒 Item has unexpected structure:', itemAny);
            }
          }
          
          console.log('🎒 Converted wizard items:', wizardItems);
          setSelectedItems(wizardItems);
        } else {
          console.log('🎒 No existing equipment items to load');
          setSelectedItems([]);
        }
        
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load equipment');
        console.error('🎒 Error loading equipment:', err);
      } finally {
        setLoading(false);
      }
    };

    loadEquipment();
  }, [characterClass]); // Only run when class changes, NOT when currentEquipment changes!

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
      filtered = filtered.filter(item => {
        // Guard against items without name property
        if (!item.name) {
          console.warn('🎒 Filtering: Equipment item missing name:', item);
          return false;
        }
        return item.name.toLowerCase().includes(term) ||
               item.description?.toLowerCase().includes(term);
      });
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
    
    // Guard against undefined className
    if (!className) {
      console.warn('🎒 calculateStartingGold: className is undefined, defaulting to 100 gp');
      return 100;
    }
    
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
      current_weight: selectedItems.reduce((total, item) => {
        const itemWeight = item?.equipment?.weight ?? 0;
        const quantity = item?.quantity ?? 1;
        return total + (itemWeight * quantity);
      }, 0)
    };
  }, [abilityScores, selectedItems]); // Watch the whole abilityScores object, not individual properties

  // Add item to selection
  const addItem = useCallback((equipment: Equipment) => {
    // Guard against missing equipment data
    if (!equipment || !equipment.name) {
      console.error('🎒 addItem: Invalid equipment data:', equipment);
      setError('Invalid equipment selected');
      return;
    }
    
    console.log('🎒 addItem called with:', equipment);
    
    const cost = equipment.cost?.quantity || 0;
    
    if (currentGold < cost) {
      setError(`Not enough gold! Need ${cost} gp but only have ${currentGold} gp`);
      return;
    }

    const wizardItem = equipmentToWizardItem(equipment, 1);
    console.log('🎒 Created wizard item:', wizardItem);
    
    const existingIndex = selectedItems.findIndex(item => 
      item?.equipment?.name === equipment.name
    );
    
    if (existingIndex >= 0) {
      // Increase quantity of existing item
      const updatedItems = [...selectedItems];
      updatedItems[existingIndex].quantity += 1;
      console.log('🎒 Updated quantity for existing item, new items:', updatedItems);
      setSelectedItems(updatedItems);
    } else {
      // Add new item
      console.log('🎒 Adding new item to selection');
      setSelectedItems(prev => {
        const newItems = [...prev, wizardItem];
        console.log('🎒 New selected items:', newItems);
        return newItems;
      });
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
    console.log('🎒 updateFormEquipment called, selectedItems:', selectedItems);
    
    const inventoryItems = selectedItems.map((item, index) => {
      console.log(`🎒 Processing item ${index}:`, item);
      
      // Use the equipment data already in the item
      // It's already in the correct format from equipmentToWizardItem
      const result = {
        equipment: item.equipment, // Already has name, weight, cost
        quantity: item.quantity,
        equipped: item.equipped
      };
      
      console.log(`🎒 Mapped item ${index} result:`, result);
      return result;
    });
    
    const carryingCapacity = calculateCarryingCapacity();
    
    const equipmentData = {
      items: inventoryItems,
      currency: {
        cp: 0,
        sp: 0, 
        ep: 0,
        gp: currentGold,
        pp: 0
      },
      carrying_capacity: carryingCapacity
    };
    
    console.log('🎒 Setting equipment form value:', equipmentData);
    setValue('equipment', equipmentData, { shouldValidate: true });
  }, [selectedItems, currentGold, calculateCarryingCapacity, setValue, availableEquipment]);

  // Auto-save equipment to form whenever selectedItems changes
  useEffect(() => {
    if (!loading) {
      // Create a stable string representation to detect actual changes
      const currentItemsStr = JSON.stringify(selectedItems.map(i => ({ 
        name: i.equipment.name, 
        qty: i.quantity, 
        eq: i.equipped 
      })));
      
      // Skip if items haven't actually changed
      if (previousItemsRef.current === currentItemsStr && !initialLoadRef.current) {
        console.log('🎒 Skipping auto-save - items unchanged');
        return;
      }
      
      previousItemsRef.current = currentItemsStr;
      initialLoadRef.current = false;
      
      console.log('🎒 Auto-saving equipment, selectedItems changed:', selectedItems);
      
      // Inline the update logic to avoid dependency issues
      const inventoryItems = selectedItems.map((item, index) => {
        console.log(`🎒 Processing item ${index}:`, item);
        return {
          equipment: item.equipment,
          quantity: item.quantity,
          equipped: item.equipped
        };
      });
      
      const strengthScore = abilityScores?.strength || 10;
      const baseCapacity = strengthScore * 15;
      const currentWeight = selectedItems.reduce((total, item) => {
        const itemWeight = item?.equipment?.weight ?? 0;
        const quantity = item?.quantity ?? 1;
        return total + (itemWeight * quantity);
      }, 0);
      
      const equipmentData = {
        items: inventoryItems,
        currency: {
          cp: 0,
          sp: 0,
          ep: 0,
          gp: currentGold,
          pp: 0
        },
        carrying_capacity: {
          max_weight: baseCapacity,
          encumbered_at: baseCapacity * 0.67,
          heavily_encumbered_at: baseCapacity * 0.83,
          current_weight: currentWeight
        }
      };
      
      console.log('🎒 Setting equipment form value:', equipmentData);
      setValue('equipment', equipmentData, { shouldValidate: true });
    }
  }, [selectedItems, currentGold, loading, abilityScores, setValue]); // Don't include updateFormEquipment!

  // Handle next step
  const handleNext = useCallback(() => {
    updateFormEquipment();
    onNext();
  }, [updateFormEquipment, onNext]);

  // Calculate total weight and check encumbrance
  const { totalWeight, isEncumbered, isHeavilyEncumbered } = useMemo(() => {
    const weight = selectedItems.reduce((total, item) => {
      // Safely access weight with fallback to 0
      const itemWeight = item?.equipment?.weight ?? 0;
      const quantity = item?.quantity ?? 1;
      return total + (itemWeight * quantity);
    }, 0);
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

        {/* Equipment Filters - Spans both columns */}
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

        <div className="equipment-content">
          {/* Available Equipment - Left side */}
          <div className="available-equipment">
            <h3>Available Equipment ({filteredEquipment.length})</h3>
            <div className={styles.equipmentGrid}>
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
                  <div key={`${item?.equipment?.name || 'item'}-${index}`} className="selected-item">
                    <div className="item-info">
                      <span className="item-name">{item?.equipment?.name || 'Unknown Item'}</span>
                      <span className="item-quantity">x{item?.quantity || 1}</span>
                      <span className="item-weight">{((item?.equipment?.weight ?? 0) * (item?.quantity ?? 1)).toFixed(1)} lbs</span>
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
            onClick={handleBack}
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