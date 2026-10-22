import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetModules(); });

it('is disabled by default and bounds enabled production samples', async () => {
  vi.stubEnv('PROD', true);
  vi.stubEnv('VITE_COMMAND_TIMING_SAMPLE_RATE', '0');
  const beacon = vi.fn(() => true);
  vi.stubGlobal('navigator', { sendBeacon: beacon });
  const { reportCommandTiming } = await import('../commandTelemetry');
  const timing = { message_type: 'sprite_move', message_id: 'id', queue_ms: 30, acknowledgement_ms: 100 };
  reportCommandTiming(timing); expect(beacon).not.toHaveBeenCalled();
  vi.stubEnv('VITE_COMMAND_TIMING_SAMPLE_RATE', '1');
  for (let index = 0; index < 100; index++) reportCommandTiming(timing);
  expect(beacon).toHaveBeenCalledTimes(16);
});

it('contains transport failures so timing cannot interrupt command settlement', async () => {
  vi.stubEnv('PROD', true); vi.stubEnv('VITE_COMMAND_TIMING_SAMPLE_RATE', '1');
  vi.stubGlobal('navigator', { sendBeacon: () => { throw new Error('blocked'); } });
  vi.stubGlobal('fetch', () => { throw new Error('blocked'); });
  const { reportCommandTiming } = await import('../commandTelemetry');
  expect(() => reportCommandTiming({ message_type: 'sprite_move', message_id: 'id',
    queue_ms: 0, acknowledgement_ms: 10 })).not.toThrow();
});
