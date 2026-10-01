import { useOptionalPaintController } from '../controller/PaintControllerProvider';
import type { PaintStyle } from '../model/paintObject';
import type { PaintTool } from '../controller/paintGeometry';
import styles from './PaintPanel.module.css';

interface PaintPanelProps {
  isVisible?: boolean;
  onToggle?: () => void;
  onClose?: () => void;
}

const TOOLS: ReadonlyArray<{ tool: PaintTool; label: string }> = [
  { tool: 'draw', label: 'Draw' },
  { tool: 'line', label: 'Line' },
  { tool: 'rectangle', label: 'Rectangle' },
  { tool: 'square', label: 'Square' },
  { tool: 'ellipse', label: 'Ellipse' },
  { tool: 'circle', label: 'Circle' },
  { tool: 'select', label: 'Select/Edit' },
  { tool: 'delete', label: 'Delete' },
];

function channelHex(value: number): string {
  return Math.round(Math.max(0, Math.min(1, value)) * 255)
    .toString(16)
    .padStart(2, '0');
}

function rgbaToHex(value: PaintStyle['stroke_rgba']): string {
  return `#${channelHex(value[0])}${channelHex(value[1])}${channelHex(value[2])}`;
}

function hexToRgba(hex: string, alpha: number): PaintStyle['stroke_rgba'] {
  const value = hex.replace('#', '');
  return [
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255,
    alpha,
  ];
}

export function PaintPanel({ isVisible = true, onToggle, onClose }: PaintPanelProps) {
  const paint = useOptionalPaintController();
  const interaction = paint?.interaction ?? null;
  const interactionState = paint?.interactionState ?? null;
  const scene = paint?.state ?? null;

  if (!isVisible) return null;

  const style: PaintStyle = interactionState?.style ?? {
    stroke_rgba: [1, 0, 0, 1],
    width: 4,
    fill_rgba: null,
  };
  const strokeHex = rgbaToHex(style.stroke_rgba);
  const fillHex = rgbaToHex(style.fill_rgba ?? style.stroke_rgba);
  const available = interaction !== null && interactionState?.enabled === true;

  const updateStyle = (next: PaintStyle) => interaction?.setStyle(next);
  const updateStroke = (hex: string) => updateStyle({
    ...style,
    stroke_rgba: hexToRgba(hex, style.stroke_rgba[3]),
  });
  const updateFill = (enabled: boolean, hex = fillHex) => updateStyle({
    ...style,
    fill_rgba: enabled ? hexToRgba(hex, style.fill_rgba?.[3] ?? 0.25) : null,
  });

  return (
    <section className={styles.paintPanel} aria-label="Paint object tools">
      <header className={styles.header}>
        <div>
          <h3>Paint</h3>
          <p>{scene?.hydrating ? 'Loading objects…' : `${scene?.committed.length ?? 0} objects`}</p>
        </div>
        <div className={styles.headerActions}>
          {onToggle && (
            <button type="button" onClick={onToggle} aria-label="Toggle paint panel">−</button>
          )}
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close paint panel">×</button>
          )}
        </div>
      </header>

      {!available && (
        <p className={styles.notice} role="status">
          Paint is waiting for the active table connection.
        </p>
      )}
      {scene?.lastError && <p className={styles.error} role="alert">{scene.lastError}</p>}

      <fieldset className={styles.section} disabled={!available}>
        <legend>Tool</legend>
        <div className={styles.toolGrid}>
          {TOOLS.map(({ tool, label }) => (
            <button
              key={tool}
              type="button"
              className={interactionState?.tool === tool ? styles.activeTool : undefined}
              aria-pressed={interactionState?.tool === tool}
              onClick={() => interaction?.setTool(tool)}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.section} disabled={!available}>
        <legend>Style</legend>
        <label className={styles.controlRow}>
          <span>Stroke</span>
          <input
            type="color"
            aria-label="Stroke color"
            value={strokeHex}
            onChange={event => updateStroke(event.target.value)}
          />
        </label>
        <label className={styles.controlRow}>
          <span>Width</span>
          <input
            type="range"
            aria-label="Stroke width"
            min="0.125"
            max="64"
            step="0.125"
            value={style.width}
            onChange={event => updateStyle({ ...style, width: Number(event.target.value) })}
          />
          <output>{style.width.toFixed(2)}</output>
        </label>
        <label className={styles.controlRow}>
          <input
            type="checkbox"
            aria-label="Fill"
            checked={style.fill_rgba !== null}
            onChange={event => updateFill(event.target.checked)}
          />
          <span>Fill</span>
          <input
            type="color"
            aria-label="Fill color"
            value={fillHex}
            disabled={style.fill_rgba === null}
            onChange={event => updateFill(true, event.target.value)}
          />
        </label>
      </fieldset>

      <section className={styles.selection} aria-label="Paint selection">
        <h4>Selection</h4>
        {interactionState?.selected ? (
          <>
            <dl>
              <div><dt>Type</dt><dd>{interactionState.selected.kind}</dd></div>
              <div><dt>Owner</dt><dd>User {interactionState.selected.created_by}</dd></div>
              <div><dt>Version</dt><dd>{interactionState.selected.version}</dd></div>
            </dl>
            {!interactionState.canEditSelected && (
              <p className={styles.notice}>You can inspect this object but cannot change it.</p>
            )}
            <div className={styles.selectionActions}>
              <button
                type="button"
                disabled={!interactionState.canEditSelected}
                onClick={() => interaction?.restyleSelected(style)}
              >
                Apply style
              </button>
              <button
                type="button"
                className={styles.danger}
                disabled={!interactionState.canEditSelected}
                onClick={() => interaction?.deleteSelected()}
              >
                Delete object
              </button>
            </div>
          </>
        ) : (
          <p>Choose Select/Edit, then click an object.</p>
        )}
      </section>

      <footer className={styles.footer}>
        <span>{interactionState?.gestureActive ? 'Drawing preview' : 'Ready'}</span>
        <span>{scene?.pending.length ?? 0} pending</span>
      </footer>
    </section>
  );
}

export default PaintPanel;
