/**
 * Keyboard Shortcuts Display Hook
 * Provides UI for displaying available shortcuts and their status
 */
import { inputManager } from '@features/canvas/services';
import React, { useEffect, useState } from 'react';

import type { KeyboardShortcut } from '@features/canvas/services';

export interface ShortcutsDisplayProps {
  visible?: boolean;
  className?: string;
}

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
    <div className={`keyboard-shortcuts ${className}`}>
      <h3>Keyboard Shortcuts</h3>
      
      <div className="shortcuts-section">
        <h4>Available</h4>
        {getEnabledShortcuts().map(shortcut => (
          <div key={shortcut.action} className="shortcut-item enabled">
            <kbd>{formatShortcut(shortcut)}</kbd>
            <span>{shortcut.description}</span>
          </div>
        ))}
      </div>

      <div className="shortcuts-section">
        <h4>Disabled</h4>
        {getDisabledShortcuts().map(shortcut => (
          <div key={shortcut.action} className="shortcut-item disabled">
            <kbd>{formatShortcut(shortcut)}</kbd>
            <span>{shortcut.description}</span>
          </div>
        ))}
      </div>
      
      <style>{`
        .keyboard-shortcuts {
          position: absolute;
          top: 10px;
          right: 10px;
          background: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 10px;
          border-radius: 5px;
          font-size: 12px;
          max-width: 300px;
          z-index: 1000;
        }
        
        .shortcuts-section {
          margin-bottom: 15px;
        }
        
        .shortcuts-section h4 {
          margin: 0 0 5px 0;
          font-size: 14px;
          color: #ccc;
        }
        
        .shortcut-item {
          display: flex;
          justify-content: space-between;
          padding: 2px 0;
          align-items: center;
        }
        
        .shortcut-item.disabled {
          opacity: 0.5;
        }
        
        .shortcut-item kbd {
          background: #333;
          padding: 2px 6px;
          border-radius: 3px;
          font-family: monospace;
          font-size: 11px;
          min-width: 60px;
          text-align: center;
        }
        
        .shortcut-item span {
          margin-left: 10px;
          flex: 1;
        }
      `}</style>
    </div>
  );
};