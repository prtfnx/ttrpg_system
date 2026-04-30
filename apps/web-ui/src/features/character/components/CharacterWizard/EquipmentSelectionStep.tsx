import { useBackgrounds } from '@features/compendium';
import { ErrorBoundary } from '@shared/components';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import {
  equipmentManagementService,
  equipmentToWizardItem,
  type Equipment,
  type WizardEquipmentItem
} from '../../services/equipmentManagement.service';
import styles from './EquipmentSelectionStep.module.css';
import type { WizardFormData } from './WizardFormData';

const CURRENCY_TO_GOLD: Record<string, number> = { cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 10 };

function costToGold(cost: Equipment['cost'] | undefined): number {
  if (!cost) return 0;
  return cost.quantity * (CURRENCY_TO_GOLD[cost.unit] ?? 1);
}

function formatCost(cost: Equipment['cost']): string {
  if (!cost || cost.quantity === 0) return 'Free';
  return `${cost.quantity} ${cost.unit}`;
}

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
  onNext: _onNext,
  onBack,
  onPrevious
}) => {
  const { setValue, getValues } = useFormContext<WizardFormData>();
  
  const formData = getValues();
  const characterClass = propCharacterClass || formData.class || 'fighter';
  const characterBackground = formData.background || '';
  // eslint-disable-next-line react-hooks/exhaustive-deps -- known: abilityScores optional chaining, stable reference
  const abilityScores = propAbilityScores || {
    strength: formData.strength || 10,
    dexterity: formData.dexterity || 10,
    constitution: formData.constitution || 10,
    intelligence: formData.intelligence || 10,
    wisdom: formData.wisdom || 10,
    charisma: formData.charisma || 10
  };
  
  const handleBack = onBack || onPrevious;
  void handleBack;
  
  const initialLoadRef = React.useRef(true);
  const previousItemsRef = React.useRef<string>('');

  const [availableEquipment, setAvailableEquipment] = useState<Equipment[]>([]);
  const [selectedItems, setSelectedItems] = useState<WizardEquipmentItem[]>([]);
  const [filteredEquipment, setFilteredEquipment] = useState<Equipment[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [startingGold, setStartingGold] = useState(0);
  const [currentGold, setCurrentGold] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // Background data for free starting equipment
  const { data: backgrounds } = useBackgrounds();
  const bgData = backgrounds?.find(b => b.name.toLowerCase() === characterBackground.toLowerCase());

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
        const equipment = await equipmentManagementService.getAllEquipment();
        
        // Validate equipment data structure
        const validEquipment = equipment.filter(item => {
          if (!item.name) {
            return false;
          }
          return true;
        });
        setAvailableEquipment(validEquipment);
        
        // Calculate starting gold based on class
        const startingMoney = calculateStartingGold(characterClass);
        setStartingGold(startingMoney);
        setCurrentGold(startingMoney);
        
        // Convert existing equipment items to wizard format
        // Guard against undefined or missing items array
        const existingItems = formData.equipment?.items;
        if (existingItems && Array.isArray(existingItems) && existingItems.length > 0) {
          const wizardItems: WizardEquipmentItem[] = [];
          
          for (const item of existingItems) {
            const itemAny = item as Record<string, unknown>; // Type assertion for old format compatibility
            
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
              // Find the full equipment data from available equipment
              const fullEquipment = validEquipment.find(eq => eq.name === itemAny.name);
              if (fullEquipment) {
                wizardItems.push(equipmentToWizardItem(fullEquipment, (itemAny.quantity as number) || 1, itemAny.equipped as boolean | undefined));
              } // else: skip unrecognized items
            } else {
              // skip items without index or name
            }
          }
          setSelectedItems(wizardItems);
        } else {
          setSelectedItems([]);
        }
        
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load equipment');
        console.error('Error loading equipment:', err);
      } finally {
        setLoading(false);
      }
    };

    loadEquipment();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: re-sync only when characterClass changes
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
      console.error('addItem: Invalid equipment data:', equipment);
      setError('Invalid equipment selected');
      return;
    }
    
    const cost = costToGold(equipment.cost);
    
    if (currentGold < cost) {
      setError(`Not enough gold! Need ${formatCost(equipment.cost)} but only have ${currentGold.toFixed(2)} gp`);
      return;
    }

    const wizardItem = equipmentToWizardItem(equipment, 1);
    
    const existingIndex = selectedItems.findIndex(item => 
      item?.equipment?.name === equipment.name
    );
    
    if (existingIndex >= 0) {
      // Increase quantity of existing item
      const updatedItems = [...selectedItems];
      updatedItems[existingIndex].quantity += 1;
      setSelectedItems(updatedItems);
    } else {
      // Add new item
      setSelectedItems(prev => {
        const newItems = [...prev, wizardItem];
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
    const refund = costToGold(equipment?.cost);
    
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
        return;
      }
      
      previousItemsRef.current = currentItemsStr;
      initialLoadRef.current = false;
      
      // Inline the update logic to avoid dependency issues
      const inventoryItems = selectedItems.map((item) => {
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
      setValue('equipment', equipmentData, { shouldValidate: true });
    }
  }, [selectedItems, currentGold, loading, abilityScores, setValue]); // Don't include updateFormEquipment!

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
      <div className={styles['equipment-selection-step']}>
        <h2>Select Starting Equipment</h2>
        
        {error && (
          <div className={styles['error-message']}>
            <span className={styles['error-icon']}>!</span>
            {error}
          </div>
        )}

        {/* Equipment Summary */}
        <div className={styles['equipment-summary']}>
          <div className={styles['summary-item']}>
            <span className={styles.label}>Starting Gold:</span>
            <span className={styles.value}>{startingGold} gp</span>
          </div>
          <div className={styles['summary-item']}>
            <span className={styles.label}>Remaining Gold:</span>
            <span className={styles.value}>{currentGold} gp</span>
          </div>
          <div className={styles['summary-item']}>
            <span className={styles.label}>Total Weight:</span>
            <span className={`${styles.value} ${isHeavilyEncumbered ? styles['heavily-encumbered'] : isEncumbered ? styles.encumbered : ''}`}>
              {totalWeight.toFixed(1)} lbs
              {isHeavilyEncumbered && ' (Heavily Encumbered)'}
              {isEncumbered && !isHeavilyEncumbered && ' (Encumbered)'}
            </span>
          </div>
        </div>

        {/* Currency Reference */}
        <div className={styles['currency-reference']}>
          <span className={styles['currency-label']}>Currency:</span>
          <span className={styles['currency-rate']}>10 cp = 1 sp</span>
          <span className={styles['currency-sep']}>·</span>
          <span className={styles['currency-rate']}>10 sp = 1 gp</span>
          <span className={styles['currency-sep']}>·</span>
          <span className={styles['currency-rate']}>2 ep = 1 gp</span>
          <span className={styles['currency-sep']}>·</span>
          <span className={styles['currency-rate']}>10 gp = 1 pp</span>
        </div>

        {/* Standard Starting Equipment (Free) */}
        {(() => {
          const startingPack = equipmentManagementService.getStartingEquipment(characterClass);
          const classItems = startingPack.equipment.filter(Boolean);
          const bgItemNames = bgData?.equipment ?? [];
          const bgItems = bgItemNames.map(name => availableEquipment.find(e => e.name === name)).filter(Boolean) as Equipment[];
          const hasAny = classItems.length > 0 || bgItems.length > 0;
          if (!hasAny) return null;
          return (
            <div className={styles['starting-equipment']}>
              <div className={styles['starting-equipment-header']}>
                <span>Starting Equipment — Free Grant</span>
                <button
                  className={styles['take-standard-button']}
                  onClick={() => {
                    const allItems = [
                      ...classItems.map(eq => equipmentToWizardItem(eq, 1)),
                      ...bgItems.map(eq => equipmentToWizardItem(eq, 1))
                    ];
                    setSelectedItems(allItems);
                    // No gold consumption — starting gear is free in D&D 5e
                  }}
                >
                  Take Standard Pack
                </button>
              </div>
              {classItems.length > 0 && (
                <div className={styles['starting-items-list']}>
                  <span className={styles['starting-items-label']}>Class ({characterClass.charAt(0).toUpperCase() + characterClass.slice(1)}):</span>
                  {classItems.map((eq, i) => (
                    <span key={i} className={styles['starting-item-tag']}>{eq.name}</span>
                  ))}
                </div>
              )}
              {bgItems.length > 0 && (
                <div className={styles['starting-items-list']}>
                  <span className={styles['starting-items-label']}>Background ({characterBackground}):</span>
                  {bgItems.map((eq, i) => (
                    <span key={i} className={styles['starting-item-tag']}>{eq.name}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Equipment Filters - Spans both columns */}
        <div className={styles['equipment-filters']}>
          <input
            type="text"
            placeholder="Search equipment..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={styles['search-input']}
          />
          
          <div className={styles['category-filters']}>
            {equipmentCategories.map(category => (
              <button
                key={category}
                className={`${styles['category-button']} ${selectedCategory === category ? styles['active'] : ''}`}
                onClick={() => setSelectedCategory(category)}
              >
                {category.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </button>
            ))}
          </div>
        </div>

        <div className={styles['equipment-content']}>
          {/* Available Equipment - Left side */}
          <div className={styles['available-equipment']}>
            <h3>Available Equipment ({filteredEquipment.length})</h3>
            <div className={styles.equipmentGrid}>
              {filteredEquipment.map((equipment) => {
                const isExpanded = expandedCards.has(equipment.name);
                const canAfford = currentGold >= costToGold(equipment.cost);
                return (
                  <div
                    key={equipment.name}
                    className={`${styles['equipment-card']} ${isExpanded ? styles['equipment-card-expanded'] : ''}`}
                    onClick={() => setExpandedCards(prev => {
                      const next = new Set(prev);
                      if (next.has(equipment.name)) next.delete(equipment.name);
                      else next.add(equipment.name);
                      return next;
                    })}
                  >
                    <div className={styles['equipment-compact-row']}>
                      <span className={styles['equipment-name']}>{equipment.name}</span>
                      <span className={styles['equipment-cost']}>{formatCost(equipment.cost)}</span>
                      {equipment.weight != null && <span className={styles['equipment-weight']}>{equipment.weight}lb</span>}
                      <button
                        className={styles['add-equipment-button']}
                        onClick={e => { e.stopPropagation(); addItem(equipment); }}
                        disabled={!canAfford}
                        title={canAfford ? 'Add to inventory' : 'Not enough gold'}
                      >
                        +
                      </button>
                    </div>
                    {isExpanded && (
                      <div className={styles['equipment-expanded-details']}>
                        {equipment.description && <p className={styles['equipment-description']}>{equipment.description}</p>}
                        {equipment.category && <span className={styles['equipment-category']}>{equipment.category}</span>}
                        <span className={styles['equipment-stats']}>{equipment.weight || 0} lbs</span>
                      </div>
                    )}
                  </div>
                );
              })}
              
              {filteredEquipment.length === 0 && (
                <div className={styles['no-equipment']}>
                  No equipment found matching your criteria.
                </div>
              )}
            </div>
          </div>

          {/* Selected Equipment */}
          <div className={styles['selected-equipment']}>
            <h3>Selected Equipment ({selectedItems.length})</h3>
            {selectedItems.length > 0 ? (
              <div className={styles['selected-items']}>
                {selectedItems.map((item, index) => (
                  <div key={`${item?.equipment?.name || 'item'}-${index}`} className={styles['selected-item']}>
                    <div className={styles['item-info']}>
                      <span className={styles['item-name']}>{item?.equipment?.name || 'Unknown Item'}</span>
                      <span className={styles['item-quantity']}>×{item?.quantity || 1}</span>
                      <span className={styles['item-weight']}>{((item?.equipment?.weight ?? 0) * (item?.quantity ?? 1)).toFixed(1)} lbs</span>
                    </div>
                    <button
                      className={styles['remove-button']}
                      onClick={() => removeItem(index)}
                      title="Remove one"
                    >
                      −
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles['no-selected']}>
                No equipment selected yet.
              </div>
            )}
          </div>
        </div>

      </div>
    </ErrorBoundary>
  );
};