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

  it('logger.debug calls console.debug in dev mode', async () => {
    const { logger } = await import('../logger');
    logger.debug('verbose');
    expect(consoleSpy.debug).toHaveBeenCalledWith('[DEBUG] verbose');
  });

  it('logger.info calls console.info in dev mode', async () => {
    const { logger } = await import('../logger');
    logger.info('hello');
    expect(consoleSpy.info).toHaveBeenCalledWith('[INFO] hello');
  });

  it('logger.log calls console.log in dev mode', async () => {
    const { logger } = await import('../logger');
    logger.log('raw message');
    expect(consoleSpy.log).toHaveBeenCalledWith('raw message');
  });

  it('protocolLogger.error always calls console.error', async () => {
    const { protocolLogger } = await import('../logger');
    protocolLogger.error('ctx', new Error('oops'));
    expect(consoleSpy.error).toHaveBeenCalledWith(
      '[PROTOCOL ERROR] ctx',
      expect.any(Error)
    );
  });

  it('protocolLogger.message calls console.log in dev mode', async () => {
    const { protocolLogger } = await import('../logger');
    protocolLogger.message('sent', { type: 'PING' });
    expect(consoleSpy.log).toHaveBeenCalledWith('[PROTOCOL SENT]', { type: 'PING' });
  });

  it('protocolLogger.connection calls console.log in dev mode', async () => {
    const { protocolLogger } = await import('../logger');
    protocolLogger.connection('connected', { host: 'localhost' });
    expect(consoleSpy.log).toHaveBeenCalledWith('[CONNECTION] connected', { host: 'localhost' });
  });
});
