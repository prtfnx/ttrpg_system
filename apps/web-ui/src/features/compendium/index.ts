export { CompendiumPanel } from './components/CompendiumPanel';
export { MonsterCreationPanel } from './components/MonsterCreationPanel';

export {
    useBackgrounds, useClass, useClasses,
    useCompendiumStatus, useRace, useRaces,
    useRacesForCharacterWizard, useSpell, useSpells
} from './hooks/useCompendium';
export type { Spell } from './services/compendiumService';

// Main comprehensive D&D 5e service
export { compendiumService, CompendiumService } from './services/compendiumService';

// Specialized monster creation service
export { MonsterCreationService, monsterCreationSystem } from './services/monsterCreation.service';

