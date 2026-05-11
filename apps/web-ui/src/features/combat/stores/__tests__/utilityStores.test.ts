import { describe, it, expect, beforeEach } from 'vitest';
import { useCoverStore, type CoverZone } from '../coverStore';
import { useEncounterStore, type EncounterState } from '../encounterStore';
import { useOAStore } from '../oaStore';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeZone(id: string): CoverZone {
  return { zone_id: id, shape_type: 'rect', coords: [0, 0, 10, 10], cover_tier: 'half', label: '' };
}

function makeEncounter(id = 'enc-1'): EncounterState {
  return { encounter_id: id, title: 'Test', description: 'desc', phase: 'idle', choices: [] };
}

// ─── coverStore ─────────────────────────────────────────────────────────────

describe('useCoverStore', () => {
  beforeEach(() => useCoverStore.setState({ zones: [] }));

  it('starts with empty zones', () => {
    expect(useCoverStore.getState().zones).toHaveLength(0);
  });

  it('setZones replaces all zones', () => {
    useCoverStore.getState().setZones([makeZone('a'), makeZone('b')]);
    expect(useCoverStore.getState().zones).toHaveLength(2);
  });

  it('addZone appends a new zone', () => {
    useCoverStore.getState().addZone(makeZone('x'));
    expect(useCoverStore.getState().zones).toHaveLength(1);
  });

  it('addZone replaces zone with same id', () => {
    useCoverStore.getState().addZone(makeZone('dup'));
    useCoverStore.getState().addZone({ ...makeZone('dup'), cover_tier: 'full' });
    const zones = useCoverStore.getState().zones;
    expect(zones).toHaveLength(1);
    expect(zones[0].cover_tier).toBe('full');
  });

  it('removeZone deletes by id', () => {
    useCoverStore.getState().setZones([makeZone('keep'), makeZone('del')]);
    useCoverStore.getState().removeZone('del');
    const ids = useCoverStore.getState().zones.map((z) => z.zone_id);
    expect(ids).toEqual(['keep']);
  });

  it('removeZone with unknown id is a no-op', () => {
    useCoverStore.getState().addZone(makeZone('a'));
    useCoverStore.getState().removeZone('ghost');
    expect(useCoverStore.getState().zones).toHaveLength(1);
  });
});

// ─── encounterStore ──────────────────────────────────────────────────────────

describe('useEncounterStore', () => {
  beforeEach(() => useEncounterStore.setState({ encounter: null }));

  it('starts with null encounter', () => {
    expect(useEncounterStore.getState().encounter).toBeNull();
  });

  it('setEncounter stores encounter', () => {
    useEncounterStore.getState().setEncounter(makeEncounter());
    expect(useEncounterStore.getState().encounter?.encounter_id).toBe('enc-1');
  });

  it('setEncounter with null clears it', () => {
    useEncounterStore.getState().setEncounter(makeEncounter());
    useEncounterStore.getState().setEncounter(null);
    expect(useEncounterStore.getState().encounter).toBeNull();
  });

  it('setEncounter replaces previous encounter', () => {
    useEncounterStore.getState().setEncounter(makeEncounter('e1'));
    useEncounterStore.getState().setEncounter(makeEncounter('e2'));
    expect(useEncounterStore.getState().encounter?.encounter_id).toBe('e2');
  });
});

// ─── oaStore ─────────────────────────────────────────────────────────────────

describe('useOAStore', () => {
  beforeEach(() => useOAStore.setState({ warningEntityId: null, warningTriggers: [], prompt: null }));

  it('starts clean', () => {
    const s = useOAStore.getState();
    expect(s.warningEntityId).toBeNull();
    expect(s.warningTriggers).toHaveLength(0);
    expect(s.prompt).toBeNull();
  });

  it('setWarning sets entity id and triggers', () => {
    useOAStore.getState().setWarning('entity-1', [{ combatant_id: 'c1', name: 'Goblin' }]);
    const s = useOAStore.getState();
    expect(s.warningEntityId).toBe('entity-1');
    expect(s.warningTriggers).toHaveLength(1);
  });

  it('setPrompt stores prompt data', () => {
    useOAStore.getState().setPrompt({
      target_combatant_id: 't1',
      target_name: 'Orc',
      attacker_combatant_id: 'a1',
    });
    expect(useOAStore.getState().prompt?.target_name).toBe('Orc');
  });

  it('clearAll resets everything', () => {
    useOAStore.getState().setWarning('e1', [{ combatant_id: 'c1', name: 'X' }]);
    useOAStore.getState().setPrompt({ target_combatant_id: 't1', target_name: 'Y', attacker_combatant_id: 'a1' });
    useOAStore.getState().clearAll();
    const s = useOAStore.getState();
    expect(s.warningEntityId).toBeNull();
    expect(s.warningTriggers).toHaveLength(0);
    expect(s.prompt).toBeNull();
  });
});
