import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'react-toastify';
import { showToast } from '../toast';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('showToast', () => {
  it('calls toast.success with message', () => {
    showToast.success('All good');
    expect(toast.success).toHaveBeenCalledWith('All good', expect.objectContaining({}));
  });

  it('calls toast.error with message', () => {
    showToast.error('Something broke');
    expect(toast.error).toHaveBeenCalledWith('Something broke', expect.objectContaining({}));
  });

  it('calls toast.warning with message', () => {
    showToast.warning('Heads up');
    expect(toast.warning).toHaveBeenCalledWith('Heads up', expect.objectContaining({}));
  });

  it('calls toast.info with message', () => {
    showToast.info('FYI');
    expect(toast.info).toHaveBeenCalledWith('FYI', expect.objectContaining({}));
  });

  it('merges custom options', () => {
    showToast.success('ok', { autoClose: 1000 });
    expect(toast.success).toHaveBeenCalledWith(
      'ok',
      expect.objectContaining({ autoClose: 1000 })
    );
  });

  it('characterSaved calls toast.success', () => {
    showToast.characterSaved('Gandalf');
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Gandalf'));
  });

  it('characterSaveFailed includes reason when provided', () => {
    showToast.characterSaveFailed('Legolas', 'server error');
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('server error'),
      expect.anything()
    );
  });

  it('connectionLost uses autoClose false', () => {
    showToast.connectionLost();
    expect(toast.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ autoClose: false })
    );
  });

  it('characterDeleted calls toast.info', () => {
    showToast.characterDeleted('Aragorn');
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining('Aragorn'));
  });

  it('characterUpdateFailed with reason includes reason', () => {
    showToast.characterUpdateFailed('Frodo', 'network timeout');
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('network timeout'),
      expect.anything()
    );
  });

  it('characterUpdateFailed without reason still calls toast.error', () => {
    showToast.characterUpdateFailed('Frodo');
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('Frodo'),
      expect.anything()
    );
  });

  it('connectionRestored calls toast.success', () => {
    showToast.connectionRestored();
    expect(toast.success).toHaveBeenCalledWith(expect.any(String));
  });

  it('rollbackWarning calls toast.warning with character name', () => {
    showToast.rollbackWarning('Bilbo');
    expect(toast.warning).toHaveBeenCalledWith(
      expect.stringContaining('Bilbo'),
      expect.anything()
    );
  });

  it('versionConflict calls toast.warning with character name', () => {
    showToast.versionConflict('Sauron');
    expect(toast.warning).toHaveBeenCalledWith(
      expect.stringContaining('Sauron'),
      expect.anything()
    );
  });

  it('characterSaveFailed without reason still calls toast.error', () => {
    showToast.characterSaveFailed('Gimli');
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('Gimli'),
      expect.anything()
    );
  });
});
