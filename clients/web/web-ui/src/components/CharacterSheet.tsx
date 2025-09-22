import React, { useState } from "react";
import type { Character } from "./CharacterManager";
import type { WizardFormData } from "./CharacterWizard/WizardFormData";
import "./CharacterSheet.css";

interface CharacterSheetProps {
  character: Character | null;
  fullCharacterData?: WizardFormData | null; // Enhanced character data
  onSave: (character: Partial<Character>) => void;
  onSaveFullData?: (characterData: Partial<WizardFormData>) => void;
  lockedBy?: string | null; // Collaborative editing lock
  presence?: Array<{ username: string; editing: boolean }>;
  onRequestLock?: () => void;
  onReleaseLock?: () => void;
  onSync?: (character: Character) => void;
}

export const CharacterSheet: React.FC<CharacterSheetProps> = ({ 
  character, 
  fullCharacterData,
  onSave, 
  onSaveFullData,
  lockedBy, 
  presence, 
  onRequestLock, 
  onReleaseLock, 
  onSync 
}) => {
  const [form, setForm] = useState<Partial<Character>>(
    character || {
      name: "",
      class: "",
      race: "",
      level: 1,
      stats: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      owner: "",
    }
  );
  const [editing, setEditing] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'basics' | 'equipment' | 'spells' | 'notes'>('basics');


  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (lockedBy && lockedBy !== "me") return;
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setEditing(true);
    if (onRequestLock) onRequestLock();
  };


  const handleStatChange = (stat: string, value: number) => {
    if (lockedBy && lockedBy !== "me") return;
    setForm((prev) => ({
      ...prev,
      stats: { ...prev.stats, [stat]: value },
    }));
    setEditing(true);
    if (onRequestLock) onRequestLock();
  };


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (lockedBy && lockedBy !== "me") return;
    onSave(form);
    setEditing(false);
    if (onReleaseLock) onReleaseLock();
  };

  // Sync updates from other users
  React.useEffect(() => {
    if (character && !editing) {
      setForm(character);
      if (onSync) onSync(character);
    }
  }, [character]);

  // Render tab content functions
  const renderEquipmentTab = () => {
    const equipment = fullCharacterData?.equipment;
    
    if (!equipment) {
      return <div className="no-equipment">No equipment data available.</div>;
    }

    return (
      <div className="equipment-content">
        <div className="equipment-section">
          <h3>Inventory</h3>
          {equipment.items.length === 0 ? (
            <p>No items in inventory.</p>
          ) : (
            <div className="equipment-list">
              {equipment.items.map((item, index) => (
                <div key={index} className="equipment-item">
                  <div className="item-info">
                    <span className="item-name">{item.equipment.name}</span>
                    <span className="item-quantity">×{item.quantity}</span>
                    {item.equipped && <span className="equipped-badge">Equipped</span>}
                  </div>
                  <div className="item-details">
                    <span className="item-weight">{item.equipment.weight} lb</span>
                    <span className="item-cost">
                      {item.equipment.cost.amount} {item.equipment.cost.unit.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="currency-section">
          <h3>Currency</h3>
          <div className="currency-display">
            {Object.entries(equipment.currency).map(([type, amount]) => (
              <div key={type} className="currency-item">
                <span className="currency-type">{type.toUpperCase()}:</span>
                <span className="currency-amount">{amount}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="carrying-capacity">
          <h3>Carrying Capacity</h3>
          <div className="capacity-info">
            <div className="weight-display">
              Current Weight: {equipment.carrying_capacity.current_weight} / 
              {equipment.carrying_capacity.max_weight} lb
            </div>
            <div className="encumbrance-thresholds">
              <div>Encumbered at: {equipment.carrying_capacity.encumbered_at} lb</div>
              <div>Heavily Encumbered at: {equipment.carrying_capacity.heavily_encumbered_at} lb</div>
            </div>
            {equipment.carrying_capacity.current_weight >= equipment.carrying_capacity.heavily_encumbered_at && (
              <div className="encumbrance-warning heavy">Heavily Encumbered</div>
            )}
            {equipment.carrying_capacity.current_weight >= equipment.carrying_capacity.encumbered_at && 
             equipment.carrying_capacity.current_weight < equipment.carrying_capacity.heavily_encumbered_at && (
              <div className="encumbrance-warning">Encumbered</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderSpellsTab = () => {
    const spells = fullCharacterData?.spells;
    
    if (!spells) {
      return <div className="no-spells">No spell data available.</div>;
    }

    return (
      <div className="spells-content">
        <div className="spell-section">
          <h3>Cantrips</h3>
          {spells.cantrips.length === 0 ? (
            <p>No cantrips known.</p>
          ) : (
            <ul className="spell-list">
              {spells.cantrips.map((spell, index) => (
                <li key={index} className="spell-item cantrip">
                  {spell}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="spell-section">
          <h3>Known Spells</h3>
          {spells.knownSpells.length === 0 ? (
            <p>No spells known.</p>
          ) : (
            <ul className="spell-list">
              {spells.knownSpells.map((spell, index) => (
                <li key={index} className="spell-item known">
                  {spell}
                </li>
              ))}
            </ul>
          )}
        </div>

        {spells.preparedSpells && spells.preparedSpells.length > 0 && (
          <div className="spell-section">
            <h3>Prepared Spells</h3>
            <ul className="spell-list">
              {spells.preparedSpells.map((spell, index) => (
                <li key={index} className="spell-item prepared">
                  {spell}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const renderNotesTab = () => {
    const bio = fullCharacterData?.bio;
    
    return (
      <div className="notes-content">
        <div className="notes-section">
          <h3>Character Bio</h3>
          {bio ? (
            <div className="character-bio">
              <p>{bio}</p>
            </div>
          ) : (
            <p>No character bio available.</p>
          )}
        </div>

        {fullCharacterData?.advancement && (
          <div className="advancement-section">
            <h3>Character Advancement</h3>
            <div className="advancement-info">
              <p>Experience Points: {fullCharacterData.advancement.experiencePoints}</p>
              <p>Current Level: {fullCharacterData.advancement.currentLevel}</p>
              
              {fullCharacterData.advancement.levelHistory.length > 0 && (
                <div className="level-history">
                  <h4>Level History</h4>
                  {fullCharacterData.advancement.levelHistory.map((levelUp, index) => (
                    <div key={index} className="level-entry">
                      <span className="level-info">
                        Level {levelUp.level} {levelUp.className}
                        {levelUp.subclassName && ` (${levelUp.subclassName})`}
                      </span>
                      <span className="hp-gain">+{levelUp.hitPointIncrease} HP</span>
                      {levelUp.featuresGained.length > 0 && (
                        <div className="features-gained">
                          Features: {levelUp.featuresGained.join(", ")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {fullCharacterData?.classes && fullCharacterData.classes.length > 1 && (
          <div className="multiclass-section">
            <h3>Multiclass Information</h3>
            <div className="class-list">
              {fullCharacterData.classes.map((cls, index) => (
                <div key={index} className="class-entry">
                  <span className="class-name">{cls.name}</span>
                  <span className="class-level">Level {cls.level}</span>
                  {cls.subclass && <span className="subclass">({cls.subclass})</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="character-sheet">
      {lockedBy && lockedBy !== "me" ? (
        <div className="locked">Locked by {lockedBy}</div>
      ) : null}
      
      <div className="presence">
        {presence && presence.length > 0 && (
          <div>
            Viewing: {presence.map(p => p.username + (p.editing ? " (editing)" : "")).join(", ")}
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="character-sheet-tabs">
        <button 
          className={`tab-button ${activeTab === 'basics' ? 'active' : ''}`}
          onClick={() => setActiveTab('basics')}
        >
          Basic Info
        </button>
        <button 
          className={`tab-button ${activeTab === 'equipment' ? 'active' : ''}`}
          onClick={() => setActiveTab('equipment')}
        >
          Equipment
        </button>
        <button 
          className={`tab-button ${activeTab === 'spells' ? 'active' : ''}`}
          onClick={() => setActiveTab('spells')}
        >
          Spells
        </button>
        <button 
          className={`tab-button ${activeTab === 'notes' ? 'active' : ''}`}
          onClick={() => setActiveTab('notes')}
        >
          Notes
        </button>
      </div>

      {/* Tab Content */}
      <div className="character-sheet-content">
        {activeTab === 'basics' && (
          <form className="basics-tab" onSubmit={handleSubmit}>
            <div className="character-header">
              <label>
                Name: 
                <input 
                  name="name" 
                  value={form.name || ""} 
                  onChange={handleChange} 
                  required 
                  disabled={!!lockedBy && lockedBy !== "me"} 
                />
              </label>
              <label>
                Class: 
                <input 
                  name="class" 
                  value={form.class || ""} 
                  onChange={handleChange} 
                  required 
                  disabled={!!lockedBy && lockedBy !== "me"} 
                />
              </label>
              <label>
                Race: 
                <input 
                  name="race" 
                  value={form.race || ""} 
                  onChange={handleChange} 
                  required 
                  disabled={!!lockedBy && lockedBy !== "me"} 
                />
              </label>
              <label>
                Level: 
                <input 
                  name="level" 
                  type="number" 
                  min={1} 
                  value={form.level || 1} 
                  onChange={handleChange} 
                  required 
                  disabled={!!lockedBy && lockedBy !== "me"} 
                />
              </label>
            </div>

            <fieldset className="ability-scores">
              <legend>Ability Scores</legend>
              <div className="stats-grid">
                {Object.entries(form.stats || {}).map(([stat, value]) => {
                  const modifier = Math.floor((value - 10) / 2);
                  const modifierString = modifier >= 0 ? `+${modifier}` : `${modifier}`;
                  
                  return (
                    <div key={stat} className="ability-score">
                      <label className="ability-name">{stat}</label>
                      <input 
                        type="number" 
                        min={1} 
                        max={30} 
                        value={value} 
                        onChange={e => handleStatChange(stat, Number(e.target.value))} 
                        disabled={!!lockedBy && lockedBy !== "me"}
                        className="ability-value" 
                      />
                      <div className="ability-modifier">{modifierString}</div>
                    </div>
                  );
                })}
              </div>
            </fieldset>

            <button type="submit" disabled={!!lockedBy && lockedBy !== "me"}>
              Save Character
            </button>
          </form>
        )}

        {activeTab === 'equipment' && (
          <div className="equipment-tab">
            {renderEquipmentTab()}
          </div>
        )}

        {activeTab === 'spells' && (
          <div className="spells-tab">
            {renderSpellsTab()}
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="notes-tab">
            {renderNotesTab()}
          </div>
        )}
      </div>
    </div>
  );
};
