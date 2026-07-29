import {
  applyUiPreferences,
  DEFAULT_UI_PREFERENCES,
  loadUiPreferences,
  saveUiPreferences,
  type ButtonStyle,
  type ColorScheme,
  type Theme,
  type UiPreferences,
} from '@features/customization/uiPreferences';
import clsx from 'clsx';
import { useState } from 'react';
import { Moon, Paintbrush, Settings, Sliders } from 'lucide-react';
import styles from './CustomizePanel.module.css';

const colorSwatchClass: Record<ColorScheme, string> = {
  blue: styles.blueSwatch,
  purple: styles.purpleSwatch,
  green: styles.greenSwatch,
  red: styles.redSwatch,
  orange: styles.orangeSwatch,
};

export function CustomizePanel() {
  const [preferences, setPreferences] = useState<UiPreferences>(loadUiPreferences);
  const { theme, buttonStyle, colorScheme, accentOpacity, borderRadius } = preferences;

  const updatePreferences = (changes: Partial<UiPreferences>) => {
    setPreferences(current => {
      const next = { ...current, ...changes };
      applyUiPreferences(next);
      saveUiPreferences(next);
      return next;
    });
  };

  const handleThemeChange = (newTheme: Theme) => {
    updatePreferences({ theme: newTheme });
  };

  const handleButtonStyleChange = (newStyle: ButtonStyle) => {
    updatePreferences({ buttonStyle: newStyle });
  };

  const handleColorSchemeChange = (newScheme: ColorScheme) => {
    updatePreferences({ colorScheme: newScheme });
  };

  const handleAccentOpacityChange = (value: number) => {
    updatePreferences({ accentOpacity: value });
  };

  const handleBorderRadiusChange = (value: number) => {
    updatePreferences({ borderRadius: value });
  };

  const resetToDefaults = () => {
    const defaults = { ...DEFAULT_UI_PREFERENCES };
    setPreferences(defaults);
    applyUiPreferences(defaults);
    saveUiPreferences(defaults);
  };

  return (
    <div className={styles.customizePanel}>
      <div className={styles.header}>
        <h2><Paintbrush size={18} aria-hidden /> Customize Interface</h2>
        <p className={styles.subtitle}>Personalize your TTRPG experience</p>
      </div>

      {/* Theme Selection */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}><Moon size={14} aria-hidden /> Theme</h3>
        <div className={styles.themeGrid}>
          <button
            className={`${styles.themeCard} ${theme === 'dark' ? styles.active : ''}`}
            onClick={() => handleThemeChange('dark')}
            aria-pressed={theme === 'dark'}
          >
            <div className={`${styles.themePreview} ${styles.darkPreview}`}></div>
            <span>Dark</span>
          </button>
          <button
            className={`${styles.themeCard} ${theme === 'light' ? styles.active : ''}`}
            onClick={() => handleThemeChange('light')}
            aria-pressed={theme === 'light'}
          >
            <div className={`${styles.themePreview} ${styles.lightPreview}`}></div>
            <span>Light</span>
          </button>
          <button
            className={`${styles.themeCard} ${theme === 'high-contrast' ? styles.active : ''}`}
            onClick={() => handleThemeChange('high-contrast')}
            aria-pressed={theme === 'high-contrast'}
          >
            <div className={`${styles.themePreview} ${styles.highContrastPreview}`}></div>
            <span>High Contrast</span>
          </button>
          <button
            className={`${styles.themeCard} ${theme === 'cyberpunk' ? styles.active : ''}`}
            onClick={() => handleThemeChange('cyberpunk')}
            aria-pressed={theme === 'cyberpunk'}
          >
            <div className={`${styles.themePreview} ${styles.cyberpunkPreview}`}></div>
            <span>Cyberpunk</span>
          </button>
          <button
            className={`${styles.themeCard} ${theme === 'forest' ? styles.active : ''}`}
            onClick={() => handleThemeChange('forest')}
            aria-pressed={theme === 'forest'}
          >
            <div className={`${styles.themePreview} ${styles.forestPreview}`}></div>
            <span>Forest</span>
          </button>
        </div>
      </section>

      {/* Color Scheme */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}><Paintbrush size={14} aria-hidden /> Accent Color</h3>
        <div className={styles.colorGrid}>
          {(['blue', 'purple', 'green', 'red', 'orange'] as ColorScheme[]).map((color) => (
            <button
              key={color}
              className={clsx(styles.colorButton, colorSwatchClass[color], colorScheme === color && styles.active)}
              onClick={() => handleColorSchemeChange(color)}
              aria-label={`${color} accent`}
              aria-pressed={colorScheme === color}
            >
              {colorScheme === color && <span className={styles.checkmark}><Sliders size={12} aria-hidden /></span>}
            </button>
          ))}
        </div>
      </section>

      {/* Button Style */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}><Sliders size={14} aria-hidden /> Button Style</h3>
        <div className={styles.buttonStyleGrid}>
          <button
            className={`${styles.stylePreviewButton} ${buttonStyle === 'rounded' ? styles.active : ''}`}
            aria-pressed={buttonStyle === 'rounded'}
            onClick={() => handleButtonStyleChange('rounded')}
          >
            Rounded
          </button>
          <button
            className={`${styles.stylePreviewButton} ${styles.sharpPreviewButton} ${buttonStyle === 'sharp' ? styles.active : ''}`}
            aria-pressed={buttonStyle === 'sharp'}
            onClick={() => handleButtonStyleChange('sharp')}
          >
            Sharp
          </button>
          <button
            className={`${styles.stylePreviewButton} ${styles.pillPreviewButton} ${buttonStyle === 'pill' ? styles.active : ''}`}
            aria-pressed={buttonStyle === 'pill'}
            onClick={() => handleButtonStyleChange('pill')}
          >
            Pill
          </button>
        </div>
      </section>

      {/* Advanced Settings */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}><Settings size={14} aria-hidden /> Advanced</h3>
        
        <div className={styles.settingRow}>
          <label className={styles.settingLabel} htmlFor="accent-opacity">
            Accent Opacity
            <span className={styles.settingValue}>{accentOpacity}%</span>
          </label>
          <input
            id="accent-opacity"
            type="range"
            min="10"
            max="100"
            step="5"
            value={accentOpacity}
            onChange={(e) => handleAccentOpacityChange(parseInt(e.target.value))}
            className={styles.slider}
          />
        </div>

        <div className={styles.settingRow}>
          <label className={styles.settingLabel} htmlFor="border-radius">
            Border Radius
            <span className={styles.settingValue}>{borderRadius}px</span>
          </label>
          <input
            id="border-radius"
            type="range"
            min="0"
            max="24"
            step="2"
            value={borderRadius}
            onChange={(e) => handleBorderRadiusChange(parseInt(e.target.value))}
            className={styles.slider}
          />
        </div>
      </section>

      {/* Actions */}
      <div className={styles.actions}>
        <button className={styles.resetButton} onClick={resetToDefaults}>
          Reset to Defaults
        </button>
      </div>

      {/* Live Preview Info */}
      <div className={styles.infoBox}>
        <span className={styles.infoIcon}>ℹ️</span>
        <p>Changes apply immediately and are saved automatically</p>
      </div>
    </div>
  );
}
