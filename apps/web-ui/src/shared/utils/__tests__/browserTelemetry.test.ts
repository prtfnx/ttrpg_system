import { afterEach, expect, it, vi } from 'vitest';
import { reportBrowserError } from '../browserTelemetry';

afterEach(() => vi.restoreAllMocks());

it('contains synchronous failures from both telemetry transports', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const beacon = vi.fn(() => {
    throw new Error('Beacon blocked');
  });
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: beacon });
  const fetchMock = vi.fn(() => {
    throw new Error('Fetch blocked');
  });
  vi.stubGlobal('fetch', fetchMock);

  expect(() => reportBrowserError('error', new Error('Original failure'))).not.toThrow();
  expect(beacon).toHaveBeenCalledOnce();
  expect(fetchMock).toHaveBeenCalledOnce();
  Reflect.deleteProperty(navigator, 'sendBeacon');
});
