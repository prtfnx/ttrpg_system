/**
 * Keyboard Shortcuts Display Hook
 * Provides UI for displaying available shortcuts and their status
 */
import { inputManager } from '@features/canvas/services';
import clsx from 'clsx';
import React, { useId, useSyncExternalStore } from 'react';

import type { KeyboardShortcut } from '@features/canvas/services';
import styles from './useKeyboardShortcuts.module.css';

export interface ShortcutsDisplayProps {
  visible?: boolean;
  className?: string;
}

const shortcuts = inputManager.getShortcuts();
const subscribeToInputContext = (onStoreChange: () => void) => (
  inputManager.subscribeContext(onStoreChange)
);
const getInputContextSnapshot = () => inputManager.getContextSnapshot();

// eslint-disable-next-line react-refresh/only-export-components
export const useKeyboardShortcuts = () => {
  const context = useSyncExternalStore(
    subscribeToInputContext,
    getInputContextSnapshot,
    getInputContextSnapshot,
  );

  const getEnabledShortcuts = () => {
    return shortcuts.filter(shortcut => 
      !shortcut.enabled || shortcut.enabled()
    );
  };

  const getDisabledShortcuts = () => {
    return shortcuts.filter(shortcut => 
      shortcut.enabled && !shortcut.enabled()
    );
  };

  return {
    shortcuts,
    context,
    getEnabledShortcuts,
    getDisabledShortcuts,
  };
};

export const KeyboardShortcutsDisplay: React.FC<ShortcutsDisplayProps> = ({ 
  visible = true, 
  className = '' 
}) => {
  const { getEnabledShortcuts, getDisabledShortcuts } = useKeyboardShortcuts();
  const titleId = useId();

  if (!visible) return null;

  const formatShortcut = (shortcut: KeyboardShortcut) => {
    const modifiers = [];
    if (shortcut.ctrl) modifiers.push('Ctrl');
    if (shortcut.shift) modifiers.push('Shift');
    if (shortcut.alt) modifiers.push('Alt');
    
    const keyDisplay = shortcut.key === ' ' ? 'Space' : shortcut.key;
    return modifiers.length ? `${modifiers.join('+')}+${keyDisplay}` : keyDisplay;
  };

  return (
    <aside className={clsx(styles.keyboardShortcuts, className)} aria-labelledby={titleId}>
      <h3 id={titleId}>Keyboard Shortcuts</h3>
      
      <section className={styles.shortcutsSection}>
        <h4>Available</h4>
        <ul className={styles.shortcutsList}>
          {getEnabledShortcuts().map(shortcut => (
            <li key={`${shortcut.action}:${formatShortcut(shortcut)}`} className={styles.shortcutItem}>
              <kbd>{formatShortcut(shortcut)}</kbd>
              <span>{shortcut.description}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.shortcutsSection}>
        <h4>Disabled</h4>
        <ul className={styles.shortcutsList}>
          {getDisabledShortcuts().map(shortcut => (
            <li
              key={`${shortcut.action}:${formatShortcut(shortcut)}`}
              className={clsx(styles.shortcutItem, styles.disabled)}
            >
              <kbd>{formatShortcut(shortcut)}</kbd>
              <span>{shortcut.description}</span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
};
