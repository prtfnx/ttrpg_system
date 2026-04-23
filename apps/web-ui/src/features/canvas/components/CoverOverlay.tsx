import { useCoverStore } from '../../combat/stores/coverStore';
import type { CoverZone } from '../../combat/stores/coverStore';
import styles from './CoverOverlay.module.css';

interface Props {
  canvasWidth: number;
  canvasHeight: number;
}

export function CoverOverlay({ canvasWidth, canvasHeight }: Props) {
  const zones = useCoverStore((s: { zones: CoverZone[] }) => s.zones);
  if (!zones.length) return null;

  return (
    <svg
      className={styles.overlay}
      width={canvasWidth}
      height={canvasHeight}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
    >
      {zones.map((zone: CoverZone) => {
        const cls = styles[zone.cover_tier.replace('_', '')] ?? styles.half;
        if (zone.shape_type === 'rect' && zone.coords.length === 4) {
          const [x, y, w, h] = zone.coords;
          return <rect key={zone.zone_id} x={x} y={y} width={w} height={h} className={cls} />;
        }
        if (zone.shape_type === 'circle' && zone.coords.length === 3) {
          const [cx, cy, r] = zone.coords;
          return <circle key={zone.zone_id} cx={cx} cy={cy} r={r} className={cls} />;
        }
        if (zone.shape_type === 'polygon' && zone.coords.length >= 3) {
          const pts = (zone.coords as unknown as number[][]).map((p) => p.join(',')).join(' ');
          return <polygon key={zone.zone_id} points={pts} className={cls} />;
        }
        return null;
      })}
    </svg>
  );
}
