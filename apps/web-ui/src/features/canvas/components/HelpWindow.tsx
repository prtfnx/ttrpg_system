import { FloatingWindow } from '@shared/components/FloatingWindow';
import styles from './HelpWindow.module.css';

interface HelpWindowProps {
  onClose: () => void;
  zIndex: number;
}

interface ShortcutRow {
  keys: string[];
  description: string;
}

const MOUSE_CONTROLS: ShortcutRow[] = [
  { keys: ['LMB drag (Select)'], description: 'Area-select sprites' },
  { keys: ['LMB drag (Move)'], description: 'Pan camera' },
  { keys: ['Ctrl + click'], description: 'Add/remove sprite from selection' },
  { keys: ['Click sprite (Align)'], description: 'Snap sprite to nearest grid cell' },
  { keys: ['Scroll wheel'], description: 'Zoom in / out' },
  { keys: ['Release move/resize'], description: 'Auto-snap to grid cell' },
  { keys: ['Release rotate'], description: 'Snap rotation to 90°' },
  { keys: ['Alt + drag'], description: 'Move/resize without grid snap' },
];

const KEYBOARD_SHORTCUTS: ShortcutRow[] = [
  { keys: ['1'], description: 'Switch to Map layer' },
  { keys: ['2'], description: 'Switch to Tokens layer' },
  { keys: ['3'], description: 'Switch to DM layer' },
  { keys: ['4'], description: 'Switch to Light layer' },
  { keys: ['5'], description: 'Switch to Height layer' },
  { keys: ['6'], description: 'Switch to Obstacles layer' },
  { keys: ['7'], description: 'Switch to Fog of War layer' },
];

const TOOL_DESCRIPTIONS: { name: string; description: string }[] = [
  { name: 'Select', description: 'Drag to area-select. Ctrl+click to multi-select. Auto-switches to Move after selection.' },
  { name: 'Move', description: 'LMB drag pans the camera. Sprites still draggable with click-and-hold.' },
  { name: 'Measure', description: 'Click and drag to measure distance in feet.' },
  { name: 'Align', description: 'Click a sprite to snap it to the nearest grid cell.' },
  { name: 'Draw Shapes', description: 'Draw rectangles, circles, lines, and text on the canvas.' },
  { name: 'Draw Wall', description: 'Draw walls that block line-of-sight.' },
  { name: 'Polygon Obstacle', description: 'Draw filled polygon obstacles.' },
  { name: 'Paint', description: 'Freehand paint brush on the canvas.' },
];

function ShortcutTable({ rows }: { rows: ShortcutRow[] }) {
  return (
    <table className={styles.table}>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <td className={styles.keysCell}>
              {row.keys.map((k, j) => (
                <kbd key={j} className={styles.kbd}>{k}</kbd>
              ))}
            </td>
            <td className={styles.descCell}>{row.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function HelpWindow({ onClose, zIndex }: HelpWindowProps) {
  return (
    <FloatingWindow
      id="help-window"
      title="Controls & Shortcuts"
      initialWidth={480}
      initialHeight={540}
      minWidth={320}
      minHeight={300}
      zIndex={zIndex}
      onClose={onClose}
      onFocus={() => {}}
    >
      <div className={styles.content}>
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Mouse Controls</h3>
          <ShortcutTable rows={MOUSE_CONTROLS} />
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Keyboard Shortcuts</h3>
          <ShortcutTable rows={KEYBOARD_SHORTCUTS} />
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Tools</h3>
          <ul className={styles.toolList}>
            {TOOL_DESCRIPTIONS.map(t => (
              <li key={t.name}>
                <span className={styles.toolName}>{t.name}</span>
                <span className={styles.toolDesc}>{t.description}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </FloatingWindow>
  );
}
