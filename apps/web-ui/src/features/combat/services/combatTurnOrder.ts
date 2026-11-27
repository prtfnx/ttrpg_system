interface TurnOrder<T> {
  combatants: T[];
  current_turn_index: number;
  settings?: { skip_defeated?: boolean };
}

/** Match the encounter's authoritative initiative roster. */
export function getTurnCombatants<T extends { is_defeated?: boolean }>(combat: TurnOrder<T>): T[] {
  return combat.settings?.skip_defeated === false
    ? combat.combatants : combat.combatants.filter(actor => !actor.is_defeated);
}

export function getCurrentTurnCombatant<T extends { is_defeated?: boolean }>(combat: TurnOrder<T> | null): T | null {
  if (!combat || !Number.isInteger(combat.current_turn_index) || combat.current_turn_index < 0) return null;
  const active = getTurnCombatants(combat);
  return active.length ? active[combat.current_turn_index % active.length] ?? null : null;
}
