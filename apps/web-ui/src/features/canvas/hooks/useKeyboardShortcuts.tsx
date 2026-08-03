/**
 * Keyboard Shortcuts Display Hook
 * Provides UI for displaying available shortcuts and their status
 */
import { inputManager } from '@features/canvas/services';
import clsx from 'clsx';
import React, { useEffect, useId, useState } from 'react';

import type { KeyboardShortcut } from '@features/canvas/services';
import styles from './useKeyboardShortcuts.module.css';

export interface ShortcutsDisplayProps {
  visible?: boolean;
  className?: string;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useKeyboardShortcuts = () => {
  const [shortcuts, setShortcuts] = useState<KeyboardShortcut[]>([]);
  const [context, setContext] = useState<{
    selectedSprites: string[];
    hasClipboard: boolean;
    canUndo: boolean;
    canRedo: boolean;
    isCanvasFocused: boolean;
  }>({
    selectedSprites: [],
    hasClipboard: false,
    canUndo: false,
    canRedo: false,
    isCanvasFocused: false,
  });

  useEffect(() => {
    // Get initial shortcuts
    setShortcuts(inputManager.getShortcuts());

    // Listen for context updates (this would need to be implemented in InputManager)
    const updateContext = () => {
      // This is a placeholder - in real implementation, InputManager would emit events
      setContext({
        selectedSprites: inputManager['context'].selectedSpriteIds || [],
        hasClipboard: inputManager['context'].hasClipboard,
        canUndo: inputManager['context'].canUndo,
        canRedo: inputManager['context'].canRedo,
        isCanvasFocused: inputManager['context'].isCanvasFocused,
      });
    };

    // Update context initially
    updateContext();

    return () => {
      // Cleanup if needed
    };
  }, []);

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
            <li key={shortcut.action} className={styles.shortcutItem}>
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
            <li key={shortcut.action} className={clsx(styles.shortcutItem, styles.disabled)}>
              <kbd>{formatShortcut(shortcut)}</kbd>
              <span>{shortcut.description}</span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
};
