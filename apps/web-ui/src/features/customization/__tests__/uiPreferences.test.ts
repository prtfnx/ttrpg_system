import {
  applyUiPreferences,
  DEFAULT_UI_PREFERENCES,
  loadUiPreferences,
  saveUiPreferences,
  type UiPreferences,
} from '../uiPreferences';
import { beforeEach, describe, expect, it } from 'vitest';

describe('uiPreferences', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-button-style');
    document.documentElement.removeAttribute('data-color-scheme');
    document.documentElement.removeAttribute('data-custom-radius');
    document.documentElement.style.cssText = '';
  });

  it('loads persisted values and rejects unsupported or out-of-range values', () => {
    localStorage.setItem('app-theme', 'forest');
    localStorage.setItem('button-style', 'triangle');
    localStorage.setItem('color-scheme', 'purple');
    localStorage.setItem('accent-opacity', '0');
    localStorage.setItem('border-radius', '16');

    expect(loadUiPreferences()).toEqual({
      ...DEFAULT_UI_PREFERENCES,
      theme: 'forest',
      colorScheme: 'purple',
      borderRadius: 16,
    });
  });

  it('applies every preference to the token hooks used by CSS', () => {
    const preferences: UiPreferences = {
      theme: 'cyberpunk',
      buttonStyle: 'pill',
      colorScheme: 'orange',
      accentOpacity: 75,
      borderRadius: 12,
    };

    applyUiPreferences(preferences);

    expect(document.documentElement.dataset.theme).toBe('cyberpunk');
    expect(document.documentElement.dataset.buttonStyle).toBe('pill');
    expect(document.documentElement.dataset.colorScheme).toBe('orange');
    expect(document.documentElement.dataset.customRadius).toBe('true');
    expect(document.documentElement.style.getPropertyValue('--accent-opacity')).toBe('0.75');
    expect(document.documentElement.style.getPropertyValue('--accent-overlay-percent')).toBe('7.5%');
    expect(document.documentElement.style.getPropertyValue('--custom-radius')).toBe('12px');
  });

  it('round-trips preferences through storage', () => {
    const preferences: UiPreferences = {
      theme: 'light',
      buttonStyle: 'sharp',
      colorScheme: 'green',
      accentOpacity: 60,
      borderRadius: 4,
    };

    saveUiPreferences(preferences);

    expect(loadUiPreferences()).toEqual(preferences);
  });
});
