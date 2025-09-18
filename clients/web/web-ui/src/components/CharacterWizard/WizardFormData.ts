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
};
