import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSelectionPreference, saveSelectionPreference, useSelectionPreferences } from '../selectionPreferences';

const response = (mode: string, ok = true) => ({ ok, json: async () => ({ selection_mode: mode }) }) as Response;

afterEach(() => { loadSelectionPreference(null, null)(); vi.unstubAllGlobals(); });

describe('session membership selection preference', () => {
  it('loads and saves only the authenticated scoped preference', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response('separate')).mockResolvedValueOnce(response('combined'));
    vi.stubGlobal('fetch', fetcher);
    const stop = loadSelectionPreference('SESSION', 7);
    await vi.waitFor(() => expect(useSelectionPreferences.getState().loading).toBe(false));
    await saveSelectionPreference('SESSION', 7, 'combined');
    expect(useSelectionPreferences.getState().mode).toBe('combined');
    expect(fetcher.mock.calls[1][1].body).toBe('{"selection_mode":"combined"}');
    await saveSelectionPreference('OTHER', 7, 'separate');
    expect(fetcher).toHaveBeenCalledTimes(2);
    stop();
    expect(useSelectionPreferences.getState().mode).toBe('separate');
  });

  it('does not apply a late response after changing users or sessions', async () => {
    let resolve!: (value: Response) => void;
    const stale = new Promise<Response>(done => { resolve = done; });
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(stale).mockResolvedValueOnce(response('separate')));
    const first = loadSelectionPreference('FIRST', 7);
    first();
    const second = loadSelectionPreference('SECOND', 9);
    resolve(response('combined'));
    await vi.waitFor(() => expect(useSelectionPreferences.getState().loading).toBe(false));
    expect(useSelectionPreferences.getState()).toMatchObject({ scope: 'SECOND:9', mode: 'separate' });
    second();
  });

  it('keeps the accepted mode and reports a failed save', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response('separate')).mockResolvedValueOnce(response('combined', false)));
    const stop = loadSelectionPreference('SESSION', 7);
    await vi.waitFor(() => expect(useSelectionPreferences.getState().loading).toBe(false));
    await saveSelectionPreference('SESSION', 7, 'combined');
    expect(useSelectionPreferences.getState()).toMatchObject({ mode: 'separate', saving: false });
    expect(useSelectionPreferences.getState().error).toBeTruthy();
    stop();
  });
});
