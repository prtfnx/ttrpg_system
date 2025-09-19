export type WizardFormData = {
  race: string;
  class: string;
  background: string;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  skills: string[];
  spells?: {
    cantrips: string[];
    knownSpells: string[];
    preparedSpells: string[];
  };
  name: string;
  bio?: string;
  image?: string;
  // Equipment and inventory
  equipment?: {
    items: Array<{
      equipment: {
        name: string;
        weight: number;
        cost: {
          amount: number;
          unit: string;
        };
      };
      quantity: number;
      equipped?: boolean;
    }>;
    currency: {
      cp: number;
      sp: number;
      ep: number;
      gp: number;
      pp: number;
    };
    carrying_capacity: {
      current_weight: number;
      max_weight: number;
      encumbered_at: number;
      heavily_encumbered_at: number;
    };
  };
  // Character advancement tracking
  advancement?: {
    experiencePoints: number;
    currentLevel: number;
    levelHistory: Array<{
      level: number;
      className: string;
      subclassName?: string;
      hitPointIncrease: number;
      abilityScoreImprovements?: Array<{
        ability: string;
        increase: number;
      }>;
      featGained?: string;
      featuresGained: string[];
      spellsLearned?: string[];
    }>;
  };
  // Multiclassing support
  classes?: Array<{
    name: string;
    level: number;
    subclass?: string;
  }>;
};
