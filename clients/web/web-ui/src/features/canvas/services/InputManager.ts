/**
 * Centralized Input Manager for Canvas Operations
 * Handles keyboard shortcuts and input coordination between React and WASM
 */

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: string;
  description: string;
  enabled?: () => boolean;
}

export interface InputContext {
  selectedSpriteIds: string[];
  hasClipboard: boolean;
  canUndo: boolean;
  canRedo: boolean;
  isCanvasFocused: boolean;
}

type InputListener = (event: KeyboardEvent) => void;

export class InputManager {
  private shortcuts: Map<string, KeyboardShortcut> = new Map();
  private context: InputContext = {
    selectedSpriteIds: [],
    hasClipboard: false,
    canUndo: false,
    canRedo: false,
    isCanvasFocused: false,
  };
  private listeners: Map<string, InputListener[]> = new Map();
  private contextListeners: Set<(context: InputContext) => void> = new Set();

  constructor() {
    this.setupDefaultShortcuts();
  }

  private setupDefaultShortcuts() {
    const shortcuts: KeyboardShortcut[] = [
      // Sprite manipulation
      {
        key: 'Delete',
        action: 'delete_selected',
        description: 'Delete selected sprite(s)',
        enabled: () => this.context.selectedSpriteIds.length > 0
      },
      {
        key: 'c',
        ctrl: true,
        action: 'copy_selected',
        description: 'Copy selected sprite(s)',
        enabled: () => this.context.selectedSpriteIds.length > 0
      },
      {
        key: 'v',
        ctrl: true,
        action: 'paste_sprites',
        description: 'Paste copied sprite(s)',
        enabled: () => this.context.hasClipboard
      },

      // Sprite scaling
      {
        key: 'Equal', // Plus key without shift
        action: 'scale_up',
        description: 'Scale selected sprite(s) up',
        enabled: () => this.context.selectedSpriteIds.length > 0
      },
      {
        key: 'Minus',
        action: 'scale_down', 
        description: 'Scale selected sprite(s) down',
        enabled: () => this.context.selectedSpriteIds.length > 0
      },

      // Undo/Redo
      {
        key: 'z',
        ctrl: true,
        action: 'undo',
        description: 'Undo last action',
        enabled: () => this.context.canUndo
      },
      {
        key: 'y',
        ctrl: true,
        action: 'redo',
        description: 'Redo last undone action',
        enabled: () => this.context.canRedo
      },
      {
        key: 'z',
        ctrl: true,
        shift: true,
        action: 'redo',
        description: 'Redo last undone action (alternative)',
        enabled: () => this.context.canRedo
      },

      // Sprite movement (with grid snap)
      {
        key: 'ArrowUp',
        action: 'move_up',
        description: 'Move selected sprite(s) up',
        enabled: () => this.context.selectedSpriteIds.length > 0
      },
      {
        key: 'ArrowDown', 
        action: 'move_down',
        description: 'Move selected sprite(s) down',
        enabled: () => this.context.selectedSpriteIds.length > 0
      },
      {
        key: 'ArrowLeft',
        action: 'move_left', 
        description: 'Move selected sprite(s) left',
        enabled: () => this.context.selectedSpriteIds.length > 0
      },
      {
        key: 'ArrowRight',
        action: 'move_right',
        description: 'Move selected sprite(s) right', 
        enabled: () => this.context.selectedSpriteIds.length > 0
      },

      // Multi-selection
      {
        key: 'a',
        ctrl: true,
        action: 'select_all',
        description: 'Select all sprites'
      },
      {
        key: 'Escape',
        action: 'clear_selection',
        description: 'Clear current selection'
      },

      // Performance debug
      {
        key: 'F3',
        action: 'toggle_performance',
        description: 'Toggle performance monitor'
      }
    ];

    shortcuts.forEach(shortcut => {
      const key = this.getShortcutKey(shortcut);
      this.shortcuts.set(key, shortcut);
    });
  }

  private getShortcutKey(shortcut: KeyboardShortcut): string {
    const modifiers = [
      shortcut.ctrl ? 'Ctrl' : '',
      shortcut.shift ? 'Shift' : '', 
      shortcut.alt ? 'Alt' : ''
    ].filter(Boolean).join('+');
    
    return modifiers ? `${modifiers}+${shortcut.key}` : shortcut.key;
  }

  handleKeyDown(event: KeyboardEvent): boolean {
    if (!this.context.isCanvasFocused) return false;

    const shortcutKey = this.getShortcutKey({
      key: event.key,
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      alt: event.altKey,
      action: '',
      description: ''
    });

    const shortcut = this.shortcuts.get(shortcutKey);
    if (shortcut && (!shortcut.enabled || shortcut.enabled())) {
      event.preventDefault();
      this.executeAction(shortcut.action, event);
      return true;
    }

    return false;
  }

  private executeAction(action: string, event: KeyboardEvent) {
    const listeners = this.listeners.get(action) || [];
    listeners.forEach(listener => listener(event));
  }

  // Public API
  updateContext(updates: Partial<InputContext>) {
    this.context = { ...this.context, ...updates };
    this.notifyContextListeners();
  }

  private notifyContextListeners() {
    this.contextListeners.forEach(listener => listener(this.context));
  }

  onAction(action: string, callback: InputListener) {
    if (!this.listeners.has(action)) {
      this.listeners.set(action, []);
    }
    this.listeners.get(action)!.push(callback);
  }

  offAction(action: string, callback: InputListener) {
    const listeners = this.listeners.get(action);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  onContextChange(callback: (context: InputContext) => void) {
    this.contextListeners.add(callback);
    return () => this.contextListeners.delete(callback);
  }

  getShortcuts(): KeyboardShortcut[] {
    return Array.from(this.shortcuts.values());
  }

  getContext(): InputContext {
    return { ...this.context };
  }

  destroy() {
    this.listeners.clear();
    this.contextListeners.clear();
  }
}

// Global singleton instance
export const inputManager = new InputManager();