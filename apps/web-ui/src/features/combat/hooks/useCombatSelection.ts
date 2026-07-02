import { useCallback, useMemo, useState } from 'react';
import { useCombatStore, type Combatant } from '../stores/combatStore';

export interface CombatSelection {
  selectedCombatant: Combatant | null;
  selectedCombatantId: string;
  selectCombatant: (combatantId: string) => void;
}

export function useCombatSelection(): CombatSelection {
  const combat = useCombatStore((state) => state.combat);
  const [requestedId, setRequestedId] = useState('');

  const visibleCombatants = useMemo(
    () => combat?.combatants.filter((combatant) => !combatant.is_hidden) ?? [],
    [combat?.combatants],
  );
  const activeCombatants = useMemo(
    () => visibleCombatants.filter((combatant) => !combatant.is_defeated),
    [visibleCombatants],
  );
  const current = combat && activeCombatants.length > 0
    ? activeCombatants[combat.current_turn_index % activeCombatants.length]
    : null;
  const selectedCombatant = visibleCombatants.find(
    (combatant) => combatant.combatant_id === requestedId,
  ) ?? current ?? visibleCombatants[0] ?? null;

  const selectCombatant = useCallback((combatantId: string) => {
    if (visibleCombatants.some((combatant) => combatant.combatant_id === combatantId)) {
      setRequestedId(combatantId);
    }
  }, [visibleCombatants]);

  return {
    selectedCombatant,
    selectedCombatantId: selectedCombatant?.combatant_id ?? '',
    selectCombatant,
  };
}
