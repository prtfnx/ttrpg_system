import { create } from 'zustand';

export interface EncounterChoice {
  choice_id: string;
  text: string;
  requires_roll?: boolean;
  roll_ability?: string;
  roll_skill?: string;
  roll_dc?: number;
  visible_to?: string[];
}

export interface EncounterPendingRoll {
  choice_id: string;
  roll_ability?: string;
  roll_skill?: string;
  roll_dc?: number;
}

export interface EncounterState {
  encounter_id: string;
  session_id?: string;
  table_id?: string;
  title: string;
  description: string;
  phase: string;
  choices: EncounterChoice[];
  result?: string;
  participants?: string[];
  player_choices?: Record<string, string>;
  pending_rolls?: Record<string, EncounterPendingRoll>;
  roll_results?: Array<Record<string, unknown>>;
  version?: number;
}

interface EncounterStore {
  encounter: EncounterState | null;
  setEncounter: (e: EncounterState | null) => void;
  applyEncounterMessage: (data: unknown) => void;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function normalizeChoice(value: unknown): EncounterChoice {
  const raw = asRecord(value);
  const dc = raw.roll_dc ?? raw.dc;
  return {
    choice_id: String(raw.choice_id ?? raw.id ?? ''),
    text: String(raw.text ?? ''),
    requires_roll: Boolean(raw.requires_roll),
    roll_ability: typeof raw.roll_ability === 'string' ? raw.roll_ability : undefined,
    roll_skill: typeof raw.roll_skill === 'string'
      ? raw.roll_skill
      : typeof raw.skill === 'string' ? raw.skill : undefined,
    roll_dc: typeof dc === 'number' ? dc : dc != null ? Number(dc) : undefined,
    visible_to: stringArray(raw.visible_to),
  };
}

function normalizePendingRoll(value: unknown): EncounterPendingRoll {
  const raw = asRecord(value);
  const dc = raw.roll_dc ?? raw.dc;
  return {
    choice_id: String(raw.choice_id ?? ''),
    roll_ability: typeof raw.roll_ability === 'string' ? raw.roll_ability : undefined,
    roll_skill: typeof raw.roll_skill === 'string'
      ? raw.roll_skill
      : typeof raw.skill === 'string' ? raw.skill : undefined,
    roll_dc: typeof dc === 'number' ? dc : dc != null ? Number(dc) : undefined,
  };
}

export function normalizeEncounterPayload(data: unknown): EncounterState | null {
  const envelope = asRecord(data);
  const raw = asRecord('encounter' in envelope ? envelope.encounter : data);
  if (!raw.encounter_id) return null;

  const pendingRollsRaw = asRecord(raw.pending_rolls);
  const pending_rolls = Object.fromEntries(
    Object.entries(pendingRollsRaw).map(([playerId, roll]) => [playerId, normalizePendingRoll(roll)])
  );

  return {
    encounter_id: String(raw.encounter_id),
    session_id: typeof raw.session_id === 'string' ? raw.session_id : undefined,
    table_id: typeof raw.table_id === 'string' ? raw.table_id : undefined,
    title: String(raw.title ?? 'Encounter'),
    description: String(raw.description ?? ''),
    phase: String(raw.phase ?? 'presenting'),
    choices: Array.isArray(raw.choices) ? raw.choices.map(normalizeChoice) : [],
    participants: stringArray(raw.participants),
    player_choices: asRecord(raw.player_choices) as Record<string, string>,
    pending_rolls,
    roll_results: Array.isArray(raw.roll_results)
      ? raw.roll_results.map((result) => asRecord(result))
      : [],
    version: typeof raw.version === 'number' ? raw.version : Number(raw.version ?? 0),
  };
}

export const useEncounterStore = create<EncounterStore>((set) => ({
  encounter: null,
  setEncounter: (encounter) => set({ encounter }),
  applyEncounterMessage: (data) => {
    const raw = asRecord(data);
    const encounter = normalizeEncounterPayload(data);
    if (encounter) {
      set({ encounter });
      return;
    }
    if (raw.ended === true) {
      set({ encounter: null });
    }
  },
}));
