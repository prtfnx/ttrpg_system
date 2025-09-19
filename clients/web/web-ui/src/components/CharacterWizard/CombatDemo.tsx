import React from 'react';
import './CombatDemo.css';
import type { WizardFormData } from './WizardFormData';
import { CombatLauncher } from './CombatLauncher';

// Demo character data for testing combat components
const demoCharacter: WizardFormData = {
  name: 'Aragorn Dragonbane',
  race: 'Human',
  class: 'Fighter',
  background: 'Soldier',
  strength: 16,
  dexterity: 14,
  constitution: 15,
  intelligence: 12,
  wisdom: 13,
  charisma: 11,
  skills: ['Athletics', 'Intimidation', 'Perception', 'Survival'],
  spells: {
    cantrips: [],
    knownSpells: [],
    preparedSpells: []
  },
  bio: 'A seasoned warrior with years of combat experience.',
  image: '',
  equipment: {
    items: [
      {
        equipment: {
          name: 'Longsword',
          weight: 3,
          cost: { amount: 15, unit: 'gp' }
        },
        quantity: 1,
        equipped: true
      },
      {
        equipment: {
          name: 'Chain Mail',
          weight: 55,
          cost: { amount: 75, unit: 'gp' }
        },
        quantity: 1,
        equipped: true
      },
      {
        equipment: {
          name: 'Shield',
          weight: 6,
          cost: { amount: 10, unit: 'gp' }
        },
        quantity: 1,
        equipped: true
      }
    ],
    currency: { cp: 0, sp: 0, ep: 0, gp: 50, pp: 0 },
    carrying_capacity: {
      current_weight: 64,
      max_weight: 240,
      encumbered_at: 160,
      heavily_encumbered_at: 200
    }
  },
  advancement: {
    experiencePoints: 900,
    currentLevel: 3,
    levelHistory: [
      {
        level: 1,
        className: 'Fighter',
        hitPointIncrease: 10,
        featuresGained: ['Fighting Style', 'Second Wind']
      },
      {
        level: 2,
        className: 'Fighter',
        hitPointIncrease: 6,
        featuresGained: ['Action Surge']
      },
      {
        level: 3,
        className: 'Fighter',
        hitPointIncrease: 7,
        featuresGained: ['Martial Archetype']
      }
    ]
  }
};

// Wizard character for spell demo
const wizardCharacter: WizardFormData = {
  ...demoCharacter,
  name: 'Gandalf the Grey',
  race: 'Human',
  class: 'Wizard',
  background: 'Sage',
  strength: 10,
  dexterity: 12,
  constitution: 14,
  intelligence: 17,
  wisdom: 15,
  charisma: 12,
  skills: ['Arcana', 'History', 'Insight', 'Investigation'],
  spells: {
    cantrips: ['Fire Bolt', 'Mage Hand', 'Prestidigitation'],
    knownSpells: ['Magic Missile', 'Shield', 'Burning Hands', 'Detect Magic'],
    preparedSpells: ['Magic Missile', 'Shield', 'Burning Hands']
  },
  equipment: {
    items: [
      {
        equipment: {
          name: 'Staff of Power',
          weight: 4,
          cost: { amount: 500, unit: 'gp' }
        },
        quantity: 1,
        equipped: true
      }
    ],
    currency: { cp: 0, sp: 0, ep: 0, gp: 200, pp: 0 },
    carrying_capacity: {
      current_weight: 4,
      max_weight: 150,
      encumbered_at: 100,
      heavily_encumbered_at: 125
    }
  }
};

interface CombatDemoProps {
  onClose?: () => void;
}

export const CombatDemo: React.FC<CombatDemoProps> = ({ onClose }) => {
  return (
    <div className="combat-demo">
      <div className="demo-header">
        <h2>Combat Integration System Demo</h2>
        <p>Test all combat features with these demo characters</p>
        {onClose && (
          <button className="close-demo" onClick={onClose}>
            ×
          </button>
        )}
      </div>

      <div className="demo-content">
        <div className="demo-section">
          <h3>📋 What's Included</h3>
          <div className="features-grid">
            <div className="feature-card">
              <h4>⚔️ Attack Manager</h4>
              <p>Weapon parsing, attack rolls with advantage/disadvantage, damage calculations, attack history</p>
            </div>
            <div className="feature-card">
              <h4>✨ Spell Manager</h4>
              <p>Spell slot tracking, casting interface, spell library, preparation management</p>
            </div>
            <div className="feature-card">
              <h4>🎯 Combat Tracker</h4>
              <p>Initiative tracking, encounter management, turn-based combat, HP and condition tracking</p>
            </div>
            <div className="feature-card">
              <h4>👤 Character Sheet</h4>
              <p>Tabbed character display with calculated combat stats, abilities, and equipment</p>
            </div>
            <div className="feature-card">
              <h4>🎲 Dice Roller</h4>
              <p>Interactive dice with animations, roll history, attack/damage/saving throw variants</p>
            </div>
            <div className="feature-card">
              <h4>🧮 Combat System</h4>
              <p>D&D 5e calculations: AC, HP, proficiency, spell progression, skill bonuses</p>
            </div>
          </div>
        </div>

        <div className="demo-section">
          <h3>🧪 Try the Combat System</h3>
          <div className="character-demos">
            <div className="character-demo-card">
              <div className="character-summary">
                <h4>{demoCharacter.name}</h4>
                <p>{demoCharacter.race} {demoCharacter.class} - Level {demoCharacter.advancement?.currentLevel}</p>
                <p className="character-description">Martial combat specialist with weapon mastery</p>
              </div>
              <div className="demo-actions">
                <CombatLauncher 
                  character={demoCharacter}
                  buttonText="Launch Fighter Combat"
                  buttonStyle="combat"
                  size="large"
                />
              </div>
            </div>

            <div className="character-demo-card">
              <div className="character-summary">
                <h4>{wizardCharacter.name}</h4>
                <p>{wizardCharacter.race} {wizardCharacter.class} - Level {wizardCharacter.advancement?.currentLevel}</p>
                <p className="character-description">Spellcaster with magical abilities and spell slot management</p>
              </div>
              <div className="demo-actions">
                <CombatLauncher 
                  character={wizardCharacter}
                  buttonText="Launch Wizard Combat"
                  buttonStyle="combat"
                  size="large"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="demo-section">
          <h3>🎮 How to Use</h3>
          <div className="instructions">
            <ol>
              <li>Click a "Launch Combat" button above to open the Combat Manager</li>
              <li>Navigate between tabs to explore different combat features</li>
              <li>Try making attacks, managing spells, and rolling dice</li>
              <li>Test combat tracking with initiative and encounter management</li>
              <li>View calculated character stats in the Character Sheet tab</li>
            </ol>
          </div>
        </div>

        <div className="demo-section">
          <h3>⚙️ Integration</h3>
          <div className="integration-info">
            <p>This Combat Integration System can be:</p>
            <ul>
              <li>Added to existing character creation workflows</li>
              <li>Integrated with character management systems</li>
              <li>Used as a standalone combat interface</li>
              <li>Extended with additional D&D 5e rules and features</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};