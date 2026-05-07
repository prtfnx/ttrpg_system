import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('logger', () => {
  let consoleSpy: Record<string, ReturnType<typeof vi.spyOn>>;

  beforeEach(() => {
    consoleSpy = {
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logger.warn always calls console.warn', async () => {
    const { logger } = await import('../logger');
    logger.warn('watch out');
    expect(consoleSpy.warn).toHaveBeenCalledWith('[WARN] watch out');
  });

  it('logger.error always calls console.error', async () => {
    const { logger } = await import('../logger');
    logger.error('boom', new Error('x'));
    expect(consoleSpy.error).toHaveBeenCalledWith('[ERROR] boom', expect.any(Error));
  });

  it('protocolLogger.error always calls console.error', async () => {
    const { protocolLogger } = await import('../logger');
    protocolLogger.error('ctx', new Error('oops'));
    expect(consoleSpy.error).toHaveBeenCalledWith(
      '[PROTOCOL ERROR] ctx',
      expect.any(Error)
    );
  });
});
