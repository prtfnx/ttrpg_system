import { create } from 'zustand';
import type { SelectionMode } from './SelectionManager';

interface PreferenceState {
  scope: string | null;
  mode: SelectionMode;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

export const useSelectionPreferences = create<PreferenceState>(() => ({
  scope: null, mode: 'separate', loading: false, saving: false, error: null,
}));

let generation = 0;

function endpoint(sessionCode: string): string {
  return `/game/api/sessions/${encodeURIComponent(sessionCode)}/selection-preference`;
}

async function readMode(response: Response): Promise<SelectionMode> {
  if (!response.ok) throw new Error('Selection preference could not be saved or loaded.');
  const value: unknown = await response.json();
  if (!value || typeof value !== 'object' || !('selection_mode' in value)
    || (value.selection_mode !== 'separate' && value.selection_mode !== 'combined')) {
    throw new Error('Invalid selection preference response.');
  }
  return value.selection_mode;
}

export function loadSelectionPreference(sessionCode: string | null, userId: number | null): () => void {
  const epoch = ++generation;
  const scope = sessionCode && userId !== null ? `${sessionCode}:${userId}` : null;
  useSelectionPreferences.setState({ scope, mode: 'separate', loading: scope !== null, saving: false, error: null });
  const abort = new AbortController();
  if (scope && sessionCode) {
    void fetch(endpoint(sessionCode), { credentials: 'same-origin', signal: abort.signal, cache: 'no-store' })
      .then(readMode)
      .then(mode => {
        if (epoch === generation) useSelectionPreferences.setState({ mode, loading: false });
      }).catch((error: unknown) => {
        if (epoch === generation && !abort.signal.aborted) {
          useSelectionPreferences.setState({ loading: false, error: error instanceof Error ? error.message : 'Selection preference unavailable.' });
        }
      });
  }
  return () => {
    if (epoch === generation) {
      generation += 1;
      useSelectionPreferences.setState({ scope: null, mode: 'separate', loading: false, saving: false, error: null });
    }
    abort.abort();
  };
}

export async function saveSelectionPreference(sessionCode: string, userId: number, mode: SelectionMode): Promise<void> {
  const state = useSelectionPreferences.getState();
  if (state.scope !== `${sessionCode}:${userId}` || state.loading || state.saving) return;
  const epoch = generation;
  useSelectionPreferences.setState({ saving: true, error: null });
  try {
    const response = await fetch(endpoint(sessionCode), {
      method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selection_mode: mode }),
    });
    const accepted = await readMode(response);
    if (epoch === generation) useSelectionPreferences.setState({ mode: accepted, saving: false });
  } catch (error) {
    if (epoch === generation) useSelectionPreferences.setState({ saving: false, error: error instanceof Error ? error.message : 'Selection preference unavailable.' });
  }
}
