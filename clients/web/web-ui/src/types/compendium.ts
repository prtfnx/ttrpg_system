// Production-ready TypeScript types for Compendium data
// Matches server-side Python models

export interface Spell {
  name: string;
  level: number;
  school: string;
  casting_time: string;
  range: string;
  components: string[];
  duration: string;
  description: string;
  ritual?: boolean;
  concentration?: boolean;
  damage_type?: string;
  classes?: string[];
  upcast_info?: {
    base_damage: string;
    upcast_damage?: string;
    upcast_bonus?: string;
    total_damage?: string;
    description?: string;
  };
}

export interface CharacterClass {
  name: string;
  hit_die: number;
  proficiencies: string[];
  saving_throws: string[];
  subclass_level?: number;
  subclasses?: Subclass[];
  features?: ClassFeature[];
}

export interface Subclass {
  name: string;
  description: string;
  features: ClassFeature[];
  spell_list_extension?: string[];
  source?: string;
}

export interface ClassFeature {
  name: string;
  level: number;
  description: string;
}

export interface Equipment {
  name: string;
  type: string;
  rarity?: string;
  requires_attunement?: boolean;
  description?: string;
  cost?: string;
  weight?: number;
  properties?: string[];
  damage?: string;
  damage_type?: string;
  ac?: number;
}

export interface Monster {
  name: string;
  type: string;
  cr: string;
  size: string;
  alignment: string;
  ac: number;
  hp: number;
  speed: string;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  actions?: MonsterAction[];
  legendary_actions?: LegendaryAction[];
  legendary_actions_per_round?: number;
  lair_actions?: LairAction[];
  description?: string;
}

export interface MonsterAction {
  name: string;
  description: string;
  attack_bonus?: number;
  damage_dice?: string;
  damage_type?: string;
}

export interface LegendaryAction {
  name: string;
  description: string;
  cost: number;
}

export interface LairAction {
  description: string;
}

export interface CompendiumSearchResult {
  spells?: Spell[];
  equipment?: Equipment[];
  monsters?: Monster[];
  classes?: CharacterClass[];
}

export interface CompendiumStats {
  total_spells: number;
  total_equipment: number;
  total_monsters: number;
  total_classes: number;
  cantrips: number;
  [key: string]: number;
}
