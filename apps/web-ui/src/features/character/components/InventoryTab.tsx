import { equipmentManagementService } from '@features/character/services/equipmentManagement.service';
import type { Equipment } from '@features/character/services/equipmentManagement.service';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './InventoryTab.module.css';

interface WizardItem {
  equipment: { name: string; weight: number; cost: { amount: number; unit: string } };
  quantity: number;
  equipped?: boolean;
}

interface Currency { cp: number; sp: number; ep: number; gp: number; pp: number }

interface Props {
  data: Record<string, any>;
  onSave: (data: Record<string, any>) => void;
}

export const InventoryTab: React.FC<Props> = ({ data, onSave }) => {
  const items: WizardItem[] = data.equipment?.items ?? [];
  const currency: Currency = data.equipment?.currency ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  const strScore: number = data.abilityScores?.str ?? 10;
  const carryCapacity = strScore * 15;

  const totalWeight = useMemo(
    () => items.reduce((sum, i) => sum + i.equipment.weight * i.quantity, 0),
    [items]
  );

  function saveItems(newItems: WizardItem[]) {
    onSave({ ...data, equipment: { ...data.equipment, items: newItems } });
  }

  function saveCurrency(newCurrency: Currency) {
    onSave({ ...data, equipment: { ...data.equipment, currency: newCurrency } });
  }

  function updateQty(index: number, delta: number) {
    const newItems = items.map((item, i) => {
      if (i !== index) return item;
      return { ...item, quantity: Math.max(1, item.quantity + delta) };
    });
    saveItems(newItems);
  }

  function toggleEquipped(index: number) {
    const newItems = items.map((item, i) =>
      i === index ? { ...item, equipped: !item.equipped } : item
    );
    saveItems(newItems);
  }

  function removeItem(index: number) {
    saveItems(items.filter((_, i) => i !== index));
  }

  function addItem(equipment: Equipment) {
    const existing = items.findIndex(i => i.equipment.name === equipment.name);
    if (existing >= 0) {
      updateQty(existing, 1);
    } else {
      saveItems([
        ...items,
        {
          equipment: {
            name: equipment.name,
            weight: equipment.weight,
            cost: { amount: equipment.cost.quantity, unit: equipment.cost.unit }
          },
          quantity: 1,
          equipped: false
        }
      ]);
    }
  }

  return (
    <div className={styles.tab}>
      <CarryingBar current={totalWeight} max={carryCapacity} />
      <ItemsSection
        items={items}
        onQty={updateQty}
        onEquip={toggleEquipped}
        onRemove={removeItem}
        onAdd={addItem}
      />
      <CurrencySection currency={currency} onSave={saveCurrency} />
    </div>
  );
};

// --- Sub-components ---

function CarryingBar({ current, max }: { current: number; max: number }) {
  const pct = Math.min(100, (current / max) * 100);
  const isHeavy = pct >= 100;
  const isEncumbered = pct >= 67;

  return (
    <div className={styles.carryBar}>
      <div className={styles.carryLabel}>
        <span>Carrying capacity</span>
        <span className={isHeavy ? styles.carryOver : isEncumbered ? styles.carryWarn : undefined}>
          {current.toFixed(1)} / {max} lbs
        </span>
      </div>
      <div className={styles.carryTrack}>
        <div
          className={isHeavy ? styles.carryFillOver : isEncumbered ? styles.carryFillWarn : styles.carryFill}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

interface ItemsSectionProps {
  items: WizardItem[];
  onQty: (index: number, delta: number) => void;
  onEquip: (index: number) => void;
  onRemove: (index: number) => void;
  onAdd: (equipment: Equipment) => void;
}

function ItemsSection({ items, onQty, onEquip, onRemove, onAdd }: ItemsSectionProps) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>Equipment ({items.length})</h3>
        <AddItemSearch onAdd={onAdd} />
      </div>
      {items.length === 0 ? (
        <p className={styles.empty}>No equipment. Search above to add items.</p>
      ) : (
        <div className={styles.itemList}>
          {items.map((item, i) => (
            <div key={`${item.equipment.name}-${i}`} className={styles.itemRow}>
              <div className={styles.itemInfo}>
                <span className={styles.itemName}>{item.equipment.name}</span>
                <span className={styles.itemMeta}>
                  {item.equipment.weight} lb · {item.equipment.cost.amount} {item.equipment.cost.unit}
                </span>
              </div>
              <div className={styles.itemControls}>
                <button className={styles.qtyBtn} onClick={() => onQty(i, -1)}>−</button>
                <span className={styles.qty}>{item.quantity}</span>
                <button className={styles.qtyBtn} onClick={() => onQty(i, 1)}>+</button>
                <button
                  className={item.equipped ? styles.equippedBtn : styles.unequippedBtn}
                  onClick={() => onEquip(i)}
                  title={item.equipped ? 'Unequip' : 'Equip'}
                >
                  {item.equipped ? 'Equipped' : 'Stowed'}
                </button>
                <button className={styles.removeBtn} onClick={() => onRemove(i)} title="Remove">
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddItemSearch({ onAdd }: { onAdd: (eq: Equipment) => void }) {
  const [query, setQuery] = useState('');
  const [allItems, setAllItems] = useState<Equipment[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const loadItems = useCallback(async () => {
    if (allItems.length > 0) return;
    const items = await equipmentManagementService.getAllEquipment();
    setAllItems(items);
  }, [allItems.length]);

  const filtered = useMemo(() => {
    if (!query.trim() || allItems.length === 0) return [];
    const q = query.toLowerCase();
    return allItems.filter(e => e.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, allItems]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className={styles.addSearch} ref={ref}>
      <input
        className={styles.searchInput}
        type="text"
        placeholder="Add item..."
        value={query}
        onFocus={() => { loadItems(); setShowDropdown(true); }}
        onChange={e => { setQuery(e.target.value); setShowDropdown(true); }}
      />
      {showDropdown && filtered.length > 0 && (
        <ul className={styles.dropdown}>
          {filtered.map(eq => (
            <li key={eq.name}>
              <button
                className={styles.dropdownItem}
                onClick={() => { onAdd(eq); setQuery(''); setShowDropdown(false); }}
              >
                <span>{eq.name}</span>
                <span className={styles.dropdownMeta}>{eq.weight} lb</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const CURRENCY_LABELS: Array<{ key: keyof Currency; label: string }> = [
  { key: 'pp', label: 'PP' },
  { key: 'gp', label: 'GP' },
  { key: 'ep', label: 'EP' },
  { key: 'sp', label: 'SP' },
  { key: 'cp', label: 'CP' }
];

function CurrencySection({ currency, onSave }: { currency: Currency; onSave: (c: Currency) => void }) {
  function handleChange(key: keyof Currency, value: string) {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 0) {
      onSave({ ...currency, [key]: num });
    }
  }

  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>Currency</h3>
      <div className={styles.currencyGrid}>
        {CURRENCY_LABELS.map(({ key, label }) => (
          <div key={key} className={styles.currencyItem}>
            <label className={styles.currencyLabel}>{label}</label>
            <input
              className={styles.currencyInput}
              type="number"
              min="0"
              value={currency[key]}
              onChange={e => handleChange(key, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
