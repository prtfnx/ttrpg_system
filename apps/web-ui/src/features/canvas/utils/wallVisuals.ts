import type { WallData } from '@/store';

// Returns base line width for a wall type (not including hover boost)
export function wallLineWidth(wall: WallData | undefined): number {
  if (!wall) return 2;
  if (wall.is_door || wall.wall_type === 'normal') return 3;
  if (wall.wall_type === 'terrain' || wall.wall_type === 'ethereal') return 2;
  return 1; // invisible, window
}

// Returns Canvas2D setLineDash pattern for a wall type
export function wallLineDash(wall: WallData | undefined): number[] {
  if (!wall) return [];
  if (wall.wall_type === 'ethereal') return [6, 4];
  if (wall.wall_type === 'invisible') return [3, 8];
  return [];
}

// Returns CSS color for door state indicator
export function doorIndicatorColor(doorState: WallData['door_state']): string {
  if (doorState === 'open') return '#4ade80';
  if (doorState === 'locked') return '#f87171';
  return '#fb923c'; // closed
}

// Draws a small arc at the wall midpoint to indicate a door
export function drawDoorArc(
  ctx: CanvasRenderingContext2D,
  sx1: number, sy1: number,
  sx2: number, sy2: number,
  doorState: WallData['door_state'],
): void {
  const mx = (sx1 + sx2) / 2;
  const my = (sy1 + sy2) / 2;
  const wallAngle = Math.atan2(sy2 - sy1, sx2 - sx1);
  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(wallAngle);
  ctx.beginPath();
  ctx.arc(0, 0, 6, -Math.PI / 2, Math.PI / 2);
  ctx.strokeStyle = doorIndicatorColor(doorState);
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.stroke();
  ctx.restore();
}

// Draws a chevron at the wall midpoint indicating the allowed passage direction
export function drawDirectionChevron(
  ctx: CanvasRenderingContext2D,
  sx1: number, sy1: number,
  sx2: number, sy2: number,
  direction: WallData['direction'],
  color: string,
): void {
  if (direction === 'both') return;
  const mx = (sx1 + sx2) / 2;
  const my = (sy1 + sy2) / 2;
  const wallAngle = Math.atan2(sy2 - sy1, sx2 - sx1);
  // Perpendicular direction: right = +90°, left = -90°
  const perpAngle = direction === 'right' ? wallAngle + Math.PI / 2 : wallAngle - Math.PI / 2;
  const size = 7;
  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(perpAngle);
  ctx.beginPath();
  ctx.moveTo(-size * 0.6, -size * 0.5);
  ctx.lineTo(size * 0.6, 0);
  ctx.lineTo(-size * 0.6, size * 0.5);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.stroke();
  ctx.restore();
}
