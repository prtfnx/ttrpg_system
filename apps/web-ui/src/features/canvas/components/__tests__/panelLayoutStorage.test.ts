import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadPanelVisibility,
  loadPanelWidth,
  savePanelVisibility,
  savePanelWidth,
} from '../panelLayoutStorage';

beforeEach(() => localStorage.clear());

describe('panel layout storage', () => {
  it('rejects malformed and out-of-range widths', () => {
    localStorage.setItem('panel_left_width', '300px');
    localStorage.setItem('panel_right_width', '9999');

    expect(loadPanelWidth('left')).toBe(320);
    expect(loadPanelWidth('right')).toBe(400);
  });

  it('restores valid widths and visibility', () => {
    localStorage.setItem('panel_left_width', '250');
    localStorage.setItem('panel_right_visible', 'false');

    expect(loadPanelWidth('left')).toBe(250);
    expect(loadPanelVisibility('right')).toBe(false);
  });

  it('does not throw when storage writes fail', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });

    expect(() => savePanelWidth('left', 300)).not.toThrow();
    expect(() => savePanelVisibility('right', false)).not.toThrow();
  });
});
