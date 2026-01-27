import { useState } from 'react';
import styles from './CustomizePanel.module.css';

type Theme = 'dark' | 'light' | 'high-contrast' | 'cyberpunk' | 'forest';
type ButtonStyle = 'rounded' | 'sharp' | 'pill';
type ColorScheme = 'blue' | 'purple' | 'green' | 'red' | 'orange';

export function CustomizePanel() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [buttonStyle, setButtonStyle] = useState<ButtonStyle>('rounded');
  const [colorScheme, setColorScheme] = useState<ColorScheme>('blue');
  const [accentOpacity, setAccentOpacity] = useState(100);
  const [borderRadius, setBorderRadius] = useState(8);

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('app-theme', newTheme);
  };

  const handleButtonStyleChange = (newStyle: ButtonStyle) => {
    setButtonStyle(newStyle);
    document.documentElement.setAttribute('data-button-style', newStyle);
    localStorage.setItem('button-style', newStyle);
  };

  const handleColorSchemeChange = (newScheme: ColorScheme) => {
    setColorScheme(newScheme);
    document.documentElement.setAttribute('data-color-scheme', newScheme);
    localStorage.setItem('color-scheme', newScheme);
  };

  const handleAccentOpacityChange = (value: number) => {
    setAccentOpacity(value);
    document.documentElement.style.setProperty('--accent-opacity', `${value / 100}`);
    localStorage.setItem('accent-opacity', value.toString());
  };

  const handleBorderRadiusChange = (value: number) => {
    setBorderRadius(value);
    document.documentElement.style.setProperty('--custom-radius', `${value}px`);
    localStorage.setItem('border-radius', value.toString());
  };

  const resetToDefaults = () => {
    handleThemeChange('dark');
    handleButtonStyleChange('rounded');
    handleColorSchemeChange('blue');
    handleAccentOpacityChange(100);
    handleBorderRadiusChange(8);
  };

  return (
    <div className={styles.customizePanel}>
      <div className={styles.header}>
        <h2>🎨 Customize Interface</h2>
        <p className={styles.subtitle}>Personalize your TTRPG experience</p>
      </div>

      {/* Theme Selection */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>🌙 Theme</h3>
        <div className={styles.themeGrid}>
          <button
            className={`${styles.themeCard} ${theme === 'dark' ? styles.active : ''}`}
            onClick={() => handleThemeChange('dark')}
          >
            <div className={`${styles.themePreview} ${styles.darkPreview}`}></div>
            <span>Dark</span>
          </button>
          <button
            className={`${styles.themeCard} ${theme === 'light' ? styles.active : ''}`}
            onClick={() => handleThemeChange('light')}
          >
            <div className={`${styles.themePreview} ${styles.lightPreview}`}></div>
            <span>Light</span>
          </button>
          <button
            className={`${styles.themeCard} ${theme === 'high-contrast' ? styles.active : ''}`}
            onClick={() => handleThemeChange('high-contrast')}
          >
            <div className={`${styles.themePreview} ${styles.highContrastPreview}`}></div>
            <span>High Contrast</span>
          </button>
          <button
            className={`${styles.themeCard} ${theme === 'cyberpunk' ? styles.active : ''}`}
            onClick={() => handleThemeChange('cyberpunk')}
          >
            <div className={`${styles.themePreview} ${styles.cyberpunkPreview}`}></div>
            <span>Cyberpunk</span>
          </button>
          <button
            className={`${styles.themeCard} ${theme === 'forest' ? styles.active : ''}`}
            onClick={() => handleThemeChange('forest')}
          >
            <div className={`${styles.themePreview} ${styles.forestPreview}`}></div>
            <span>Forest</span>
          </button>
        </div>
      </section>

      {/* Color Scheme */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>🎨 Accent Color</h3>
        <div className={styles.colorGrid}>
          {(['blue', 'purple', 'green', 'red', 'orange'] as ColorScheme[]).map((color) => (
            <button
              key={color}
              className={`${styles.colorButton} ${colorScheme === color ? styles.active : ''}`}
              style={{ backgroundColor: `var(--${color}-500, #${color === 'blue' ? '3b82f6' : color === 'purple' ? 'a855f7' : color === 'green' ? '22c55e' : color === 'red' ? 'ef4444' : 'f97316'})` }}
              onClick={() => handleColorSchemeChange(color)}
              aria-label={`${color} accent`}
            >
              {colorScheme === color && <span className={styles.checkmark}>✓</span>}
            </button>
          ))}
        </div>
      </section>

      {/* Button Style */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>🔘 Button Style</h3>
        <div className={styles.buttonStyleGrid}>
          <button
            className={`${styles.stylePreviewButton} ${buttonStyle === 'rounded' ? styles.active : ''}`}
            style={{ borderRadius: '8px' }}
            onClick={() => handleButtonStyleChange('rounded')}
          >
            Rounded
          </button>
          <button
            className={`${styles.stylePreviewButton} ${buttonStyle === 'sharp' ? styles.active : ''}`}
            style={{ borderRadius: '2px' }}
            onClick={() => handleButtonStyleChange('sharp')}
          >
            Sharp
          </button>
          <button
            className={`${styles.stylePreviewButton} ${buttonStyle === 'pill' ? styles.active : ''}`}
            style={{ borderRadius: '24px' }}
            onClick={() => handleButtonStyleChange('pill')}
          >
            Pill
          </button>
        </div>
      </section>

      {/* Advanced Settings */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>⚙️ Advanced</h3>
        
        <div className={styles.settingRow}>
          <label className={styles.settingLabel}>
            Accent Opacity
            <span className={styles.settingValue}>{accentOpacity}%</span>
          </label>
          <input
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
          <label className={styles.settingLabel}>
            Border Radius
            <span className={styles.settingValue}>{borderRadius}px</span>
          </label>
          <input
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
