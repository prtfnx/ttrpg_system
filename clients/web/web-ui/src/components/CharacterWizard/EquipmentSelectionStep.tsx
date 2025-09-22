import React, { useCallback, useEffect, useMemo, useState } from 'react';import React, { useCallback, useEffect, useMemo, useState } from 'react';import React, { useCallback, useEffect, useMemo, useState } from 'react';import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useFormContext } from 'react-hook-form';

import { ErrorBoundary } from '../common/ErrorBoundary';import { useFormContext } from 'react-hook-form';

import type { WizardFormData } from './WizardFormData';

import './EquipmentSelectionStep.css';import { import { useFormContext } from 'react-hook-form';import { useFormContext } from 'react-hook-form';



// Import types and functions from equipment service  equipmentManagementService, 

import {

  equipmentManagementService,  type Equipment, import { equipmentManagementService, type Equipment, type InventoryItem, inventoryItemToWizardItem, wizardItemToInventoryItem } from '../../services/equipmentManagement.service';import { EquipmentCategory, equipmentManagementService, type Equipment, type EquipmentCategoryType, type InventoryItem, equipmentToWizardItem, inventoryItemToWizardItem, wizardItemToInventoryItem, type WizardEquipmentItem } from '../../services/equipmentManagement.service';

  type Equipment,

  type InventoryItem,  type InventoryItem, 

  inventoryItemToWizardItem,

  wizardItemToInventoryItem  inventoryItemToWizardItem, import { ErrorBoundary } from '../common/ErrorBoundary';import { ErrorBoundary } from '../common/ErrorBoundary';

} from '../../services/equipmentManagement.service';

  wizardItemToInventoryItem 

interface EquipmentSelectionStepProps {

  characterClass: string;} from '../../services/equipmentManagement.service';import './EquipmentSelectionStep.css';import './EquipmentSelectionStep.css';

  characterLevel: number;

  abilityScores: Record<string, number>;import { ErrorBoundary } from '../common/ErrorBoundary';

  onNext: () => void;

  onBack: () => void;import './EquipmentSelectionStep.css';import type { WizardFormData } from './WizardFormData';import type { WizardFormData } from './WizardFormData';

}

import type { WizardFormData } from './WizardFormData';

export const EquipmentSelectionStep: React.FC<EquipmentSelectionStepProps> = ({

  characterClass,

  abilityScores,

  onNext,interface EquipmentSelectionStepProps {

  onBack

}) => {  characterClass: string;interface EquipmentSelectionStepProps {interface EquipmentSelectionStepProps {

  const { setValue, watch } = useFormContext<WizardFormData>();

    characterLevel: number;

  // Watch current equipment state

  const currentEquipment = watch('equipment') || {  abilityScores: Record<string, number>;  characterClass: string;  characterClass: string;

    items: [],

    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },  onNext: () => void;

    carrying_capacity: { current_weight: 0, max_weight: 0, encumbered_at: 0, heavily_encumbered_at: 0 }

  };  onBack: () => void;  characterLevel: number;  characterLevel: number;



  // Get all available equipment}

  const [availableEquipment] = useState<Equipment[]>(

    equipmentManagementService.getAllEquipment()  abilityScores: Record<string, number>;  abilityScores: Record<string, number>;

  );

  export const EquipmentSelectionStep: React.FC<EquipmentSelectionStepProps> = ({

  // Get starting equipment for the class

  const startingEquipment = useMemo(() =>   characterClass,  onNext: () => void;  onNext: () => void;

    equipmentManagementService.getStartingEquipment(characterClass),

    [characterClass]  abilityScores,

  );

  onNext,  onBack: () => void;  onBack: () => void;

  // Calculate carrying capacity based on Strength

  const carryingCapacity = useMemo(() =>  onBack

    equipmentManagementService.getCarryingCapacity(abilityScores.Strength || 10),

    [abilityScores.Strength]}) => {}}

  );

  const { setValue, watch } = useFormContext<WizardFormData>();

  // Initialize with starting equipment on mount

  useEffect(() => {  const currentEquipment = watch('equipment') || {

    const startingItems: InventoryItem[] = startingEquipment.equipment.map(equipment => ({

      equipment,    items: [],

      quantity: 1,

      equipped: false    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },export const EquipmentSelectionStep: React.FC<EquipmentSelectionStepProps> = ({interface EquipmentFilters {

    }));

    carrying_capacity: { current_weight: 0, max_weight: 0, encumbered_at: 0, heavily_encumbered_at: 0 }

    // Set starting gold based on class

    const startingGold = characterClass === 'Fighter' ? 125 :   };  characterClass,  category: string[];

                        characterClass === 'Wizard' ? 100 : 80;

    

    // Convert to wizard format

    const convertedItems = startingItems.map(inventoryItemToWizardItem);  const [availableEquipment] = useState<Equipment[]>(equipmentManagementService.getAllEquipment());  abilityScores,  search: string;



    setValue('equipment', {  

      items: convertedItems,

      currency: { cp: 0, sp: 0, ep: 0, gp: startingGold, pp: 0 },  // Get starting equipment for the class  onNext,  priceRange: {

      carrying_capacity: {

        ...carryingCapacity,  const startingEquipment = useMemo(() => 

        current_weight: equipmentManagementService.calculateTotalWeight(startingItems)

      }    equipmentManagementService.getStartingEquipment(characterClass),  onBack    min: number;

    });

  }, [startingEquipment, characterClass, carryingCapacity, setValue]);    [characterClass]



  // Equipment lookup function for conversions  );}) => {    max: number;

  const equipmentLookup = useCallback((name: string) => {

    const found = availableEquipment.find(e => e.name === name);

    if (!found) {

      throw new Error(`Equipment not found: ${name}`);  // Calculate carrying capacity  const { setValue, watch } = useFormContext<WizardFormData>();  };

    }

    return found;  const carryingCapacity = useMemo(() =>

  }, [availableEquipment]);

    equipmentManagementService.getCarryingCapacity(abilityScores.Strength || 10),  const currentEquipment = watch('equipment') || {}

  // Handle adding equipment to inventory

  const handleAddEquipment = useCallback((equipment: Equipment) => {    [abilityScores.Strength]

    const inventoryItems: InventoryItem[] = currentEquipment.items.map(item =>

      wizardItemToInventoryItem(item, equipmentLookup)  );    items: [],

    );

    

    const existingItemIndex = inventoryItems.findIndex(

      item => item.equipment.name === equipment.name  // Initialize with starting equipment    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },export const EquipmentSelectionStep: React.FC<EquipmentSelectionStepProps> = ({

    );

      useEffect(() => {

    let newItems: InventoryItem[];

        const startingItems: InventoryItem[] = startingEquipment.equipment.map(equipment => ({    carrying_capacity: { current_weight: 0, max_weight: 0, encumbered_at: 0, heavily_encumbered_at: 0 }  characterClass,

    if (existingItemIndex >= 0) {

      // Increment quantity of existing item      equipment,

      newItems = inventoryItems.map((item, index) =>

        index === existingItemIndex      quantity: 1,  };  abilityScores,

          ? { ...item, quantity: item.quantity + 1 }

          : item      equipped: false

      );

    } else {    }));  onNext,

      // Add new item

      newItems = [...inventoryItems, { equipment, quantity: 1, equipped: false }];

    }

        const startingGold = characterClass === 'Fighter' ? 125 : characterClass === 'Wizard' ? 100 : 80;  const [availableEquipment] = useState<Equipment[]>(equipmentManagementService.getAllEquipment());  onBack

    const totalWeight = equipmentManagementService.calculateTotalWeight(newItems);

        const convertedItems = startingItems.map(inventoryItemToWizardItem);

    setValue('equipment', {

      ...currentEquipment,  }) => {

      items: newItems.map(inventoryItemToWizardItem),

      carrying_capacity: {    setValue('equipment', {

        ...carryingCapacity,

        current_weight: totalWeight      items: convertedItems,  // Get starting equipment for the class  const { setValue, watch } = useFormContext<WizardFormData>();

      }

    });      currency: { cp: 0, sp: 0, ep: 0, gp: startingGold, pp: 0 },

  }, [currentEquipment, carryingCapacity, setValue, equipmentLookup]);

      carrying_capacity: {  const startingEquipment = useMemo(() =>   const currentEquipment = watch('equipment') || {

  // Handle removing equipment from inventory

  const handleRemoveEquipment = useCallback((equipmentName: string) => {        ...carryingCapacity,

    const inventoryItems: InventoryItem[] = currentEquipment.items.map(item =>

      wizardItemToInventoryItem(item, equipmentLookup)        current_weight: equipmentManagementService.calculateTotalWeight(startingItems)    equipmentManagementService.getStartingEquipment(characterClass),    items: [],

    );

          }

    const newItems = inventoryItems.reduce<InventoryItem[]>((acc, item) => {

      if (item.equipment.name === equipmentName) {    });    [characterClass]    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },

        if (item.quantity > 1) {

          acc.push({ ...item, quantity: item.quantity - 1 });  }, [startingEquipment, characterClass, carryingCapacity, setValue]);

        }

        // If quantity is 1, we don't add it to acc (removes it)  );    carrying_capacity: { current_weight: 0, max_weight: 0, encumbered_at: 0, heavily_encumbered_at: 0 }

      } else {

        acc.push(item);  // Equipment lookup function for conversions

      }

      return acc;  const equipmentLookup = useCallback((name: string) => {  };

    }, []);

        const found = availableEquipment.find(e => e.name === name);

    const totalWeight = equipmentManagementService.calculateTotalWeight(newItems);

        if (!found) throw new Error(`Equipment not found: ${name}`);  // Calculate carrying capacity

    setValue('equipment', {

      ...currentEquipment,    return found;

      items: newItems.map(inventoryItemToWizardItem),

      carrying_capacity: {  }, [availableEquipment]);  const carryingCapacity = useMemo(() =>  const [availableEquipment] = useState<Equipment[]>(equipmentManagementService.getAllEquipment());

        ...carryingCapacity,

        current_weight: totalWeight

      }

    });  // Handle adding equipment to inventory    equipmentManagementService.getCarryingCapacity(abilityScores.Strength || 10),  const [filters, setFilters] = useState<EquipmentFilters>({

  }, [currentEquipment, carryingCapacity, setValue, equipmentLookup]);

  const handleAddEquipment = useCallback((equipment: Equipment) => {

  // Validation functions

  const canAfford = useCallback((equipment: Equipment) => {    const inventoryItems: InventoryItem[] = currentEquipment.items.map(item =>    [abilityScores.Strength]    category: [],

    const totalGold = equipmentManagementService.convertToGold(currentEquipment.currency);

    const equipmentCost = equipmentManagementService.convertCostToGold(equipment.cost);      wizardItemToInventoryItem(item, equipmentLookup)

    return totalGold >= equipmentCost;

  }, [currentEquipment.currency]);    );  );    search: '',



  const wouldExceedCapacity = useCallback((equipment: Equipment) => {    

    return (carryingCapacity.current_weight + equipment.weight) > carryingCapacity.max_weight;

  }, [carryingCapacity]);    const existingItem = inventoryItems.find(item => item.equipment.name === equipment.name);    priceRange: { min: 0, max: 1000 }



  const isProficient = useCallback((equipment: Equipment) => {    let newItems: InventoryItem[];

    const classProficiencies = equipmentManagementService.getClassProficiencies(characterClass);

    return classProficiencies.some(prof =>       // Initialize with starting equipment  });

      prof.toLowerCase().includes(equipment.category.toLowerCase()) ||

      prof.toLowerCase().includes(equipment.name.toLowerCase())    if (existingItem) {

    );

  }, [characterClass]);      newItems = inventoryItems.map(item =>  useEffect(() => {



  return (        item.equipment.name === equipment.name

    <ErrorBoundary>

      <div className="equipment-selection-step">          ? { ...item, quantity: item.quantity + 1 }    const startingItems: InventoryItem[] = startingEquipment.equipment.map(equipment => ({  // Get starting equipment for the class

        <h2>Equipment Selection</h2>

        <p>Select your starting equipment and manage your inventory.</p>          : item



        {/* Current Equipment Summary */}      );      equipment,  const startingEquipment = useMemo(() => 

        <div className="equipment-summary">

          <h3>Current Equipment</h3>    } else {

          <div className="current-items">

            {currentEquipment.items.length === 0 ? (      newItems = [...inventoryItems, { equipment, quantity: 1, equipped: false }];      quantity: 1,    equipmentManagementService.getStartingEquipment(characterClass),

              <p>No equipment selected yet.</p>

            ) : (    }

              currentEquipment.items.map((item, index) => (

                <div key={`${item.equipment.name}-${index}`} className="item-summary">          equipped: false    [characterClass]

                  <span>{item.equipment.name} x{item.quantity}</span>

                  <button     const totalWeight = equipmentManagementService.calculateTotalWeight(newItems);

                    onClick={() => handleRemoveEquipment(item.equipment.name)}

                    className="remove-button"        }));  );

                  >

                    Remove    setValue('equipment', {

                  </button>

                </div>      ...currentEquipment,

              ))

            )}      items: newItems.map(inventoryItemToWizardItem),

          </div>

          <div className="currency-display">      carrying_capacity: {    const startingGold = characterClass === 'Fighter' ? 125 : characterClass === 'Wizard' ? 100 : 80;  // Get class proficiencies

            <p>Gold: {currentEquipment.currency.gp} gp</p>

            <p>        ...carryingCapacity,

              Weight: {carryingCapacity.current_weight}/{carryingCapacity.max_weight} lb

              {carryingCapacity.current_weight >= carryingCapacity.heavily_encumbered_at && (        current_weight: totalWeight    const convertedItems = startingItems.map(inventoryItemToWizardItem);  const classProficiencies = useMemo(() =>

                <span className="encumbrance-warning"> (Heavily Encumbered)</span>

              )}      }

              {carryingCapacity.current_weight >= carryingCapacity.encumbered_at && 

               carryingCapacity.current_weight < carryingCapacity.heavily_encumbered_at && (    });    equipmentManagementService.getClassProficiencies(characterClass),

                <span className="encumbrance-warning"> (Encumbered)</span>

              )}  }, [currentEquipment, carryingCapacity, setValue, equipmentLookup]);

            </p>

          </div>    setValue('equipment', {    [characterClass]

        </div>

  // Handle removing equipment from inventory

        {/* Available Equipment */}

        <div className="available-equipment">  const handleRemoveEquipment = useCallback((equipmentName: string) => {      items: convertedItems,  );

          <h3>Available Equipment</h3>

          <div className="equipment-list">    const inventoryItems: InventoryItem[] = currentEquipment.items.map(item =>

            {availableEquipment.slice(0, 20).map(equipment => {

              const affordable = canAfford(equipment);      wizardItemToInventoryItem(item, equipmentLookup)      currency: { cp: 0, sp: 0, ep: 0, gp: startingGold, pp: 0 },

              const fitsCapacity = !wouldExceedCapacity(equipment);

              const proficient = isProficient(equipment);    );

              const canAdd = affordable && fitsCapacity;

          carrying_capacity: {  // Calculate carrying capacity

              return (

                <div key={equipment.name} className={`equipment-card ${!canAdd ? 'disabled' : ''}`}>    const newItems = inventoryItems.reduce((acc: InventoryItem[], item) => {

                  <h4>{equipment.name}</h4>

                  <p className="equipment-description">{equipment.description}</p>      if (item.equipment.name === equipmentName) {        ...carryingCapacity,  const carryingCapacity = useMemo(() =>

                  <div className="equipment-stats">

                    <p>Cost: {equipment.cost.quantity} {equipment.cost.unit.toUpperCase()}</p>        if (item.quantity > 1) {

                    <p>Weight: {equipment.weight} lb</p>

                    <p>Category: {equipment.category}</p>          acc.push({ ...item, quantity: item.quantity - 1 });        current_weight: equipmentManagementService.calculateTotalWeight(startingItems)    equipmentManagementService.getCarryingCapacity(abilityScores.Strength || 10),

                  </div>

                  <div className="equipment-status">        }

                    {!affordable && <span className="status-tag cant-afford">Can't afford</span>}

                    {!fitsCapacity && <span className="status-tag too-heavy">Too heavy</span>}      } else {      }    [abilityScores.Strength]

                    {!proficient && <span className="status-tag not-proficient">Not proficient</span>}

                    {proficient && <span className="status-tag proficient">Proficient</span>}        acc.push(item);

                  </div>

                  <button       }    });  );

                    onClick={() => handleAddEquipment(equipment)}

                    disabled={!canAdd}      return acc;

                    className="add-equipment-button"

                  >    }, []);  }, [startingEquipment, characterClass, carryingCapacity, setValue]);

                    Add to Inventory

                  </button>    

                </div>

              );    const totalWeight = equipmentManagementService.calculateTotalWeight(newItems);  // Filter equipment based on current filters

            })}

          </div>    

        </div>

    setValue('equipment', {  // Equipment lookup function for conversions  const filteredEquipment = useMemo(() => {

        {/* Navigation */}

        <div className="step-navigation">      ...currentEquipment,

          <button onClick={onBack} className="nav-button secondary">

            ← Back      items: newItems.map(inventoryItemToWizardItem),  const equipmentLookup = useCallback((name: string) => {    let equipment = availableEquipment;

          </button>

          <button onClick={onNext} className="nav-button primary">      carrying_capacity: {

            Next →

          </button>        ...carryingCapacity,    const found = availableEquipment.find(e => e.name === name);

        </div>

      </div>        current_weight: totalWeight

    </ErrorBoundary>

  );      }    if (!found) throw new Error(`Equipment not found: ${name}`);    // Search filter

};
    });

  }, [currentEquipment, carryingCapacity, setValue, equipmentLookup]);    return found;    if (filters.search) {



  // Utility functions for equipment validation  }, [availableEquipment]);      const searchLower = filters.search.toLowerCase();

  const canAfford = useCallback((equipment: Equipment) => {

    const totalGold = equipmentManagementService.convertToGold(currentEquipment.currency);      equipment = equipment.filter(item =>

    const equipmentCost = equipmentManagementService.convertCostToGold(equipment.cost);

    return totalGold >= equipmentCost;  // Handle adding equipment to inventory        item.name.toLowerCase().includes(searchLower) ||

  }, [currentEquipment.currency]);

  const handleAddEquipment = useCallback((equipment: Equipment) => {        item.description.toLowerCase().includes(searchLower)

  const wouldExceedCapacity = useCallback((equipment: Equipment) => {

    return (carryingCapacity.current_weight + equipment.weight) > carryingCapacity.max_weight;    const inventoryItems: InventoryItem[] = currentEquipment.items.map(item =>      );

  }, [carryingCapacity]);

      wizardItemToInventoryItem(item, equipmentLookup)    }

  const isProficient = useCallback((equipment: Equipment) => {

    const classProficiencies = equipmentManagementService.getClassProficiencies(characterClass);    );

    return classProficiencies.some(prof => 

      prof.toLowerCase().includes(equipment.category.toLowerCase()) ||    const existingItem = inventoryItems.find(item => item.equipment.name === equipment.name);    // Category filter

      prof.toLowerCase().includes(equipment.name.toLowerCase())

    );    let newItems: InventoryItem[];    if (filters.category.length > 0) {

  }, [characterClass]);

    if (existingItem) {      equipment = equipment.filter(item => filters.category.includes(item.category));

  return (

    <ErrorBoundary>      newItems = inventoryItems.map(item =>    }

      <div className="equipment-selection-step">

        <h2>Equipment Selection</h2>        item.equipment.name === equipment.name

        <p>Select your starting equipment and manage your inventory.</p>

          ? { ...item, quantity: item.quantity + 1 }    // Price range filter

        <div className="equipment-summary">

          <h3>Current Equipment</h3>          : item    equipment = equipment.filter(item => {

          <div className="current-items">

            {currentEquipment.items.map((item, index) => (      );      const costInGold = equipmentManagementService.convertCostToGold(item.cost);

              <div key={index} className="item-summary">

                <span>{item.equipment.name} x{item.quantity}</span>    } else {      return costInGold >= filters.priceRange.min && costInGold <= filters.priceRange.max;

                <button onClick={() => handleRemoveEquipment(item.equipment.name)}>

                  Remove      newItems = [...inventoryItems, { equipment, quantity: 1, equipped: false }];    });

                </button>

              </div>    }

            ))}

          </div>    const totalWeight = equipmentManagementService.calculateTotalWeight(newItems);    // Sort by category, then name

          <div className="currency-display">

            <p>Gold: {currentEquipment.currency.gp} gp</p>    setValue('equipment', {    return equipment.sort((a, b) => {

            <p>Weight: {carryingCapacity.current_weight}/{carryingCapacity.max_weight} lb</p>

          </div>      ...currentEquipment,      if (a.category !== b.category) return a.category.localeCompare(b.category);

        </div>

      items: newItems.map(inventoryItemToWizardItem),      return a.name.localeCompare(b.name);

        <div className="available-equipment">

          <h3>Available Equipment</h3>      carrying_capacity: {    });

          <div className="equipment-list">

            {availableEquipment.slice(0, 20).map(equipment => {        ...carryingCapacity,  }, [availableEquipment, filters]);

              const affordable = canAfford(equipment);

              const fitsCapacity = !wouldExceedCapacity(equipment);        current_weight: totalWeight

              const proficient = isProficient(equipment);

              const canAdd = affordable && fitsCapacity;      }



              return (    });

                <div key={equipment.name} className={`equipment-card ${!canAdd ? 'disabled' : ''}`}>

                  <h4>{equipment.name}</h4>  }, [currentEquipment, carryingCapacity, setValue, equipmentLookup]);  // Group equipment by category for display

                  <p>{equipment.description}</p>

                  <p>Cost: {equipment.cost.quantity} {equipment.cost.unit.toUpperCase()}</p>  const equipmentByCategory = useMemo(() => {

                  <p>Weight: {equipment.weight} lb</p>

                  {!affordable && <span className="status-tag">Can't afford</span>}  // Handle removing equipment from inventory    const groups: Record<string, Equipment[]> = {};

                  {!fitsCapacity && <span className="status-tag">Too heavy</span>}

                  {!proficient && <span className="status-tag">Not proficient</span>}  const handleRemoveEquipment = useCallback((equipmentName: string) => {    filteredEquipment.forEach(item => {

                  <button 

                    onClick={() => handleAddEquipment(equipment)}    const inventoryItems: InventoryItem[] = currentEquipment.items.map(item =>      if (!groups[item.category]) groups[item.category] = [];

                    disabled={!canAdd}

                  >      wizardItemToInventoryItem(item, equipmentLookup)      groups[item.category].push(item);

                    Add to Inventory

                  </button>    );    });

                </div>

              );    const newItems = inventoryItems.reduce((acc: InventoryItem[], item) => {    return groups;

            })}

          </div>      if (item.equipment.name === equipmentName) {  }, [filteredEquipment]);

        </div>

        if (item.quantity > 1) {

        <div className="step-navigation">

          <button onClick={onBack} className="nav-button secondary">          acc.push({ ...item, quantity: item.quantity - 1 });  // Initialize with starting equipment

            ← Back

          </button>        }  useEffect(() => {

          <button onClick={onNext} className="nav-button primary">

            Next →      } else {    const startingItems: InventoryItem[] = startingEquipment.equipment.map(equipment => ({

          </button>

        </div>        acc.push(item);      equipment,

      </div>

    </ErrorBoundary>      }      quantity: 1,

  );

};      return acc;      equipped: false

    }, []);    }));

    const totalWeight = equipmentManagementService.calculateTotalWeight(newItems);

    setValue('equipment', {    // Add starting gold (simplified - using average starting wealth)

      ...currentEquipment,    const startingGold = characterClass === 'Fighter' ? 125 : characterClass === 'Wizard' ? 100 : 80;

      items: newItems.map(inventoryItemToWizardItem),

      carrying_capacity: {    // Convert starting items to WizardFormData format using utility

        ...carryingCapacity,    const convertedItems = startingItems.map(inventoryItemToWizardItem);

        current_weight: totalWeight

      }    setValue('equipment', {

    });      items: convertedItems,

  }, [currentEquipment, carryingCapacity, setValue, equipmentLookup]);      currency: { cp: 0, sp: 0, ep: 0, gp: startingGold, pp: 0 },

      carrying_capacity: {

  // Utility functions for equipment validation        ...carryingCapacity,

  const canAfford = useCallback((equipment: Equipment) => {        current_weight: equipmentManagementService.calculateTotalWeight(startingItems)

    const totalGold = equipmentManagementService.convertToGold(currentEquipment.currency);      }

    const equipmentCost = equipmentManagementService.convertCostToGold(equipment.cost);    });

    return totalGold >= equipmentCost;  }, [startingEquipment, characterClass, carryingCapacity, setValue]);

  }, [currentEquipment.currency]);

  // Handle adding equipment to inventory

  const wouldExceedCapacity = useCallback((equipment: Equipment) => {  const handleAddEquipment = useCallback((equipment: Equipment) => {

    return (carryingCapacity.current_weight + equipment.weight) > carryingCapacity.max_weight;    // Convert wizard items to InventoryItem for processing

  }, [carryingCapacity]);    const inventoryItems: InventoryItem[] = currentEquipment.items.map(item =>

      wizardItemToInventoryItem(item, (name: string) => equipmentManagementService.getAllEquipment().find(e => e.name === name) as Equipment)

  const isProficient = useCallback((equipment: Equipment) => {    );

    const classProficiencies = equipmentManagementService.getClassProficiencies(characterClass);    const existingItem = inventoryItems.find(item => item.equipment.name === equipment.name);

    return classProficiencies.some(prof =>     let newItems: InventoryItem[];

      prof.toLowerCase().includes(equipment.category.toLowerCase()) ||    if (existingItem) {

      prof.toLowerCase().includes(equipment.name.toLowerCase())      newItems = inventoryItems.map(item =>

    );        item.equipment.name === equipment.name

  }, [characterClass]);          ? { ...item, quantity: item.quantity + 1 }

          : item

  return (      );

    <ErrorBoundary>    } else {

      <div className="equipment-selection-step">      newItems = [...inventoryItems, { equipment, quantity: 1, equipped: false }];

        <h2>Equipment Selection</h2>    }

        <p>Select your starting equipment and manage your inventory.</p>    const totalWeight = equipmentManagementService.calculateTotalWeight(newItems);

    setValue('equipment', {

        <div className="equipment-summary">      ...currentEquipment,

          <h3>Current Equipment</h3>      items: newItems.map(inventoryItemToWizardItem),

          <div className="current-items">      carrying_capacity: {

            {currentEquipment.items.map((item, index) => (        ...carryingCapacity,

              <div key={index} className="item-summary">        current_weight: totalWeight

                <span>{item.equipment.name} x{item.quantity}</span>      }

                <button onClick={() => handleRemoveEquipment(item.equipment.name)}>    });

                  Remove  }, [currentEquipment, carryingCapacity, setValue]);

                </button>  const handleAddEquipment = useCallback((equipment: Equipment) => {

              </div>    // Convert wizard items to InventoryItem for processing

            ))}    const inventoryItems: InventoryItem[] = currentEquipment.items.map(item =>

          </div>      wizardItemToInventoryItem(item, equipmentManagementService.getEquipmentByName)

          <div className="currency-display">    );

            <p>Gold: {currentEquipment.currency.gp} gp</p>    const existingItem = inventoryItems.find(item => item.equipment.name === equipment.name);

            <p>Weight: {carryingCapacity.current_weight}/{carryingCapacity.max_weight} lb</p>    let newItems: InventoryItem[];

          </div>    if (existingItem) {

        </div>      newItems = inventoryItems.map(item =>

        item.equipment.name === equipment.name

        <div className="available-equipment">          ? { ...item, quantity: item.quantity + 1 }

          <h3>Available Equipment</h3>          : item

          <div className="equipment-list">      );

            {availableEquipment.slice(0, 20).map(equipment => {    } else {

              const affordable = canAfford(equipment);      newItems = [...inventoryItems, { equipment, quantity: 1, equipped: false }];

              const fitsCapacity = !wouldExceedCapacity(equipment);    }

              const proficient = isProficient(equipment);    const totalWeight = equipmentManagementService.calculateTotalWeight(newItems);

              const canAdd = affordable && fitsCapacity;    setValue('equipment', {

      ...currentEquipment,

              return (      items: newItems.map(inventoryItemToWizardItem),

                <div key={equipment.name} className={`equipment-card ${!canAdd ? 'disabled' : ''}`}>      carrying_capacity: {

                  <h4>{equipment.name}</h4>        ...carryingCapacity,

                  <p>{equipment.description}</p>        current_weight: totalWeight

                  <p>Cost: {equipment.cost.quantity} {equipment.cost.unit.toUpperCase()}</p>      }

                  <p>Weight: {equipment.weight} lb</p>    });

                  {!affordable && <span className="status-tag">Can't afford</span>}  }, [currentEquipment, carryingCapacity, setValue]);

                  {!fitsCapacity && <span className="status-tag">Too heavy</span>}

                  {!proficient && <span className="status-tag">Not proficient</span>}  // Handle removing equipment from inventory

                  <button   const handleRemoveEquipment = useCallback((equipmentName: string) => {

                    onClick={() => handleAddEquipment(equipment)}    // Convert current items back to InventoryItem format for processing

                    disabled={!canAdd}    const currentInventoryItems: InventoryItem[] = currentEquipment.items.map(item => ({

                  >      equipment: {

                    Add to Inventory        name: item.equipment.name,

                  </button>        weight: item.equipment.weight,

                </div>        cost: {

              );          quantity: item.equipment.cost.amount,

            })}          unit: item.equipment.cost.unit as 'cp' | 'sp' | 'ep' | 'gp' | 'pp'

          </div>        },

        </div>        category: 'gear' as EquipmentCategoryType, // Default category for calculation purposes

        description: '' // Default description

        <div className="step-navigation">      } as Equipment,

          <button onClick={onBack} className="nav-button secondary">      quantity: item.quantity,

            ← Back      equipped: item.equipped

          </button>    }));

          <button onClick={onNext} className="nav-button primary">

            Next →    const newItems = currentInventoryItems.reduce((acc: InventoryItem[], item) => {

          </button>      if (item.equipment.name === equipmentName) {

        </div>        if (item.quantity > 1) {

      </div>          acc.push({ ...item, quantity: item.quantity - 1 });

    </ErrorBoundary>        }

  );        // If quantity is 1, don't add it back (remove completely)

};      } else {
        acc.push(item);
      }
      return acc;
    }, []);

    const totalWeight = equipmentManagementService.calculateTotalWeight(newItems);

    setValue('equipment', {
      ...currentEquipment,
      items: newItems.map(convertInventoryItemToWizardFormat),
      carrying_capacity: {
        ...carryingCapacity,
        current_weight: totalWeight
      }
    });
  }, [currentEquipment, carryingCapacity, setValue]);
  const handleRemoveEquipment = useCallback((equipmentName: string) => {
    // Convert wizard items to InventoryItem for processing
    const inventoryItems: InventoryItem[] = currentEquipment.items.map(item =>
      wizardItemToInventoryItem(item, equipmentManagementService.getEquipmentByName)
    );
    const newItems = inventoryItems.reduce((acc: InventoryItem[], item) => {
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
      items: newItems.map(inventoryItemToWizardItem),
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


    </ErrorBoundary>
  );
