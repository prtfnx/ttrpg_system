from __future__ import annotations

import heapq
import math
from typing import TYPE_CHECKING, Optional

from .obstacle_geometry import obstacle_boundary

if TYPE_CHECKING:
    pass


class SpatialHashGrid:
    """Grid-bucketed spatial index for walls and obstacles.

    Mirrors the Rust SpatialHash struct — reduces collision checks from O(N)
    to O(bucket_size) ≈ O(1-5) for typical dungeon maps.
    """

    def __init__(self, cell_size: float):
        self.cell_size = cell_size
        self._all_walls: set[int] = set()
        self._all_obstacles: set[int] = set()
        self._global_walls: set[int] = set()
        self._global_obstacles: set[int] = set()
        self._walls: dict[tuple[int, int], list[int]] = {}
        self._obstacles: dict[tuple[int, int], list[int]] = {}

    def _bucket(self, x: float, y: float) -> tuple[int, int]:
        c = self.cell_size
        return (int(x // c), int(y // c))

    def insert_wall(self, idx: int, wall) -> None:
        self._all_walls.add(idx)
        if self._span(wall.x1, wall.y1, wall.x2, wall.y2) > 4096:
            self._global_walls.add(idx)
            return
        for cell in self._cells_along(wall.x1, wall.y1, wall.x2, wall.y2):
            self._walls.setdefault(cell, []).append(idx)

    def insert_obstacle(self, idx: int, entity) -> None:
        self._all_obstacles.add(idx)
        try:
            points, _closed = obstacle_boundary(entity)
            min_c = self._bucket(min(p[0] for p in points), min(p[1] for p in points))
            max_c = self._bucket(max(p[0] for p in points), max(p[1] for p in points))
        except (ValueError, TypeError, OverflowError):
            self._global_obstacles.add(idx)
            return
        if (max_c[0] - min_c[0] + 1) * (max_c[1] - min_c[1] + 1) > 4096:
            self._global_obstacles.add(idx)
            return
        for cx in range(min_c[0], max_c[0] + 1):
            for cy in range(min_c[1], max_c[1] + 1):
                self._obstacles.setdefault((cx, cy), []).append(idx)

    def query_walls(self, x1: float, y1: float, x2: float, y2: float) -> set[int]:
        if self._span(x1, y1, x2, y2) > 4096:
            return self._all_walls.copy()
        result = self._global_walls.copy()
        for cell in self._cells_along(x1, y1, x2, y2):
            result.update(self._walls.get(cell, []))
        return result

    def query_obstacles(self, x1: float, y1: float, x2: float, y2: float) -> set[int]:
        if self._span(x1, y1, x2, y2) > 4096:
            return self._all_obstacles.copy()
        result = self._global_obstacles.copy()
        for cell in self._cells_along(x1, y1, x2, y2):
            result.update(self._obstacles.get(cell, []))
        return result

    def _span(self, x1, y1, x2, y2):
        return abs(int(x2 // self.cell_size) - int(x1 // self.cell_size)) + abs(int(y2 // self.cell_size) - int(y1 // self.cell_size)) + 2

    def _cells_along(self, x1: float, y1: float, x2: float, y2: float) -> list[tuple[int, int]]:
        """DDA grid walk — same algorithm as Rust cells_along_segment."""
        c = self.cell_size
        cx, cy = int(x1 // c), int(y1 // c)
        end_cx, end_cy = int(x2 // c), int(y2 // c)

        dx, dy = x2 - x1, y2 - y1
        step_x = 1 if dx >= 0 else -1
        step_y = 1 if dy >= 0 else -1

        t_delta_x = (c / abs(dx)) if abs(dx) > 1e-6 else float('inf')
        t_delta_y = (c / abs(dy)) if abs(dy) > 1e-6 else float('inf')

        next_bx = (cx + 1) * c if step_x > 0 else cx * c
        next_by = (cy + 1) * c if step_y > 0 else cy * c
        t_max_x = ((next_bx - x1) / dx) if abs(dx) > 1e-6 else float('inf')
        t_max_y = ((next_by - y1) / dy) if abs(dy) > 1e-6 else float('inf')

        cells = [(cx, cy)]
        max_steps = abs(end_cx - cx) + abs(end_cy - cy) + 2
        for _ in range(max_steps):
            if cx == end_cx and cy == end_cy:
                break
            if t_max_x < t_max_y:
                cx += step_x
                t_max_x += t_delta_x
            else:
                cy += step_y
                t_max_y += t_delta_y
            cells.append((cx, cy))
        return cells

    @staticmethod
    def build(walls: list, obstacles: list, cell_size: float) -> 'SpatialHashGrid':
        """Build a hash from wall + obstacle lists in one pass."""
        h = SpatialHashGrid(cell_size)
        for i, w in enumerate(walls):
            h.insert_wall(i, w)
        for i, o in enumerate(obstacles):
            h.insert_obstacle(i, o)
        return h


class PathfindingSystem:

    # ── Geometric primitives ─────────────────────────────────────────────────

    @staticmethod
    def line_segments_intersect(
        ax1: float, ay1: float, ax2: float, ay2: float,
        bx1: float, by1: float, bx2: float, by2: float,
    ) -> bool:
        """Cross-product segment intersection (proper + endpoint cases)."""
        def cross(ox, oy, ax, ay, bx, by):
            return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox)

        d1 = cross(bx1, by1, bx2, by2, ax1, ay1)
        d2 = cross(bx1, by1, bx2, by2, ax2, ay2)
        d3 = cross(ax1, ay1, ax2, ay2, bx1, by1)
        d4 = cross(ax1, ay1, ax2, ay2, bx2, by2)

        if ((d1 > 0 and d2 < 0) or (d1 < 0 and d2 > 0)) and \
           ((d3 > 0 and d4 < 0) or (d3 < 0 and d4 > 0)):
            return True

        def on_segment(px, py, x1, y1, x2, y2):
            return min(x1, x2) <= px <= max(x1, x2) and min(y1, y2) <= py <= max(y1, y2)

        if d1 == 0 and on_segment(ax1, ay1, bx1, by1, bx2, by2):
            return True
        if d2 == 0 and on_segment(ax2, ay2, bx1, by1, bx2, by2):
            return True
        if d3 == 0 and on_segment(bx1, by1, ax1, ay1, ax2, ay2):
            return True
        if d4 == 0 and on_segment(bx2, by2, ax1, ay1, ax2, ay2):
            return True
        return False

    @staticmethod
    def line_intersects_aabb(
        x1: float, y1: float, x2: float, y2: float,
        rx: float, ry: float, rw: float, rh: float,
    ) -> bool:
        """Check if line segment intersects an axis-aligned bounding box."""
        # Check if either endpoint is inside the rect
        def inside(px, py):
            return rx <= px <= rx + rw and ry <= py <= ry + rh
        if inside(x1, y1) or inside(x2, y2):
            return True
        # Check the four rect edges
        edges = [
            (rx, ry, rx + rw, ry),
            (rx + rw, ry, rx + rw, ry + rh),
            (rx + rw, ry + rh, rx, ry + rh),
            (rx, ry + rh, rx, ry),
        ]
        for ex1, ey1, ex2, ey2 in edges:
            if PathfindingSystem.line_segments_intersect(x1, y1, x2, y2, ex1, ey1, ex2, ey2):
                return True
        return False

    @staticmethod
    def line_intersects_circle(
        x1: float, y1: float, x2: float, y2: float,
        cx: float, cy: float, radius: float,
    ) -> bool:
        """Segment-circle intersection."""
        dx, dy = x2 - x1, y2 - y1
        fx, fy = x1 - cx, y1 - cy
        a = dx * dx + dy * dy
        b = 2 * (fx * dx + fy * dy)
        c = fx * fx + fy * fy - radius * radius
        if a == 0:
            return c <= 0
        discriminant = b * b - 4 * a * c
        if discriminant < 0:
            return False
        sq = math.sqrt(discriminant)
        t1 = (-b - sq) / (2 * a)
        t2 = (-b + sq) / (2 * a)
        return 0 <= t1 <= 1 or 0 <= t2 <= 1

    # ── High-level checks ────────────────────────────────────────────────────

    @staticmethod
    def is_path_blocked_by_walls(
        start: tuple, end: tuple,
        walls: list,
        spatial_hash: Optional['SpatialHashGrid'] = None,
    ) -> bool:
        candidates = (
            [walls[i] for i in spatial_hash.query_walls(start[0], start[1], end[0], end[1])]
            if spatial_hash else walls
        )
        for wall in candidates:
            if not wall.blocks_movement:
                continue
            if wall.is_door and wall.door_state == 'open':
                continue
            if PathfindingSystem.line_segments_intersect(
                start[0], start[1], end[0], end[1],
                wall.x1, wall.y1, wall.x2, wall.y2,
            ):
                return True
        return False

    @staticmethod
    def is_path_blocked_by_obstacles(
        start: tuple, end: tuple,
        obstacles: list,
        exclude_entity_id: Optional[str] = None,
        spatial_hash: Optional['SpatialHashGrid'] = None,
    ) -> bool:
        x1, y1, x2, y2 = start[0], start[1], end[0], end[1]
        if spatial_hash:
            idxs = spatial_hash.query_obstacles(x1, y1, x2, y2)
            candidates = [obstacles[i] for i in idxs if i < len(obstacles)]
        else:
            candidates = obstacles
        for entity in candidates:
            if exclude_entity_id and str(exclude_entity_id) in {
                str(getattr(entity, 'entity_id', '')), str(getattr(entity, 'sprite_id', '')),
            }:
                continue
            try:
                points, closed = obstacle_boundary(entity)
            except (ValueError, TypeError, OverflowError):
                return True
            if closed and (PathfindingSystem.point_in_polygon(start, points) or PathfindingSystem.point_in_polygon(end, points)):
                return True
            count = len(points) if closed else len(points) - 1
            for index in range(count):
                if PathfindingSystem.line_segments_intersect(x1, y1, x2, y2,
                        *points[index], *points[(index + 1) % len(points)]):
                    return True
        return False

    @staticmethod
    def point_in_polygon(point, vertices):
        inside = False
        for index, first in enumerate(vertices):
            second = vertices[(index + 1) % len(vertices)]
            if (first[1] > point[1]) != (second[1] > point[1]) and point[0] < (
                (second[0] - first[0]) * (point[1] - first[1]) / (second[1] - first[1]) + first[0]
            ):
                inside = not inside
        return inside

    @staticmethod
    def get_movement_cost(start, end, grid_size, diagonal_rule='standard', *, cell_distance=5.0, distance_unit='ft'):
        return PathfindingSystem.get_path_movement_cost([start, end], grid_size, diagonal_rule,
            cell_distance=cell_distance, distance_unit=distance_unit)

    @staticmethod
    def get_path_movement_cost(path, grid_size, diagonal_rule='standard', *, cell_distance=5.0,
                               distance_unit='ft', difficult_cells=()):
        if (not math.isfinite(grid_size) or grid_size <= 0 or not math.isfinite(cell_distance)
                or cell_distance <= 0 or distance_unit not in {'ft', 'm'}):
            raise ValueError('Movement requires finite positive table units')
        feet_per_cell = cell_distance / 0.3048 if distance_unit == 'm' else cell_distance
        total = diagonal_count = 0.0
        intervals = 0
        for first, last in zip(path, path[1:]):
            breaks = {0.0, 1.0}
            if difficult_cells:
                for axis in (0, 1):
                    low, high = sorted((first[axis], last[axis]))
                    lower, upper = math.floor(low / grid_size), math.floor(high / grid_size)
                    if upper - lower > 8192:
                        raise ValueError('Movement terrain sampling budget exceeded')
                    if first[axis] != last[axis]:
                        for boundary in range(lower + 1, upper + 1):
                            t = (boundary * grid_size - first[axis]) / (last[axis] - first[axis])
                            if 0 < t < 1:
                                breaks.add(t)
            ordered = sorted(breaks)
            intervals += len(ordered) - 1
            if intervals > 8192:
                raise ValueError('Movement terrain sampling budget exceeded')
            for begin, finish in zip(ordered, ordered[1:]):
                dx = abs(last[0] - first[0]) * (finish - begin) / grid_size
                dy = abs(last[1] - first[1]) * (finish - begin) / grid_size
                diagonal = min(dx, dy)
                cells = math.hypot(dx, dy) if diagonal_rule == 'realistic' else max(dx, dy)
                if diagonal_rule == 'alternate':
                    cells += math.floor((diagonal_count + diagonal) / 2 + 1e-9) - math.floor(diagonal_count / 2 + 1e-9)
                diagonal_count += diagonal
                middle = (begin + finish) / 2
                midpoint = tuple(math.floor((first[axis] + (last[axis] - first[axis]) * middle) / grid_size) for axis in (0, 1))
                total += cells * feet_per_cell * (2 if midpoint in difficult_cells else 1)
        return round(total, 9)

    @staticmethod
    def find_path_astar(
        start: tuple, end: tuple,
        walls: list,
        obstacles: list,
        grid_size: float,
        max_distance: Optional[float] = None,
        exclude_entity_id: Optional[str] = None,
        grid_bounds: Optional[tuple] = None,  # (max_cols, max_rows) in cells, inclusive
        diagonal_rule: str = "standard",
        spatial_hash: Optional['SpatialHashGrid'] = None,
    ) -> Optional[list[tuple]]:
        """A* on grid. Returns waypoints in pixel space or None if unreachable."""
        def to_cell(pt):
            return (int(pt[0] / grid_size), int(pt[1] / grid_size))

        def to_px(cell):
            return (cell[0] * grid_size + grid_size / 2, cell[1] * grid_size + grid_size / 2)

        start_c = to_cell(start)
        end_c = to_cell(end)

        def in_bounds(cell):
            cx, cy = cell
            if cx < 0 or cy < 0:
                return False
            if grid_bounds:
                return cx <= grid_bounds[0] and cy <= grid_bounds[1]
            return True

        if not in_bounds(start_c) or not in_bounds(end_c):
            return None

        if start_c == end_c:
            return [start, end]

        # Direct-path shortcut — skip A* if line of sight is clear
        if not PathfindingSystem.is_path_blocked_by_walls(start, end, walls, spatial_hash) and \
                not PathfindingSystem.is_path_blocked_by_obstacles(start, end, obstacles, exclude_entity_id, spatial_hash):
            return [start, end]

        open_set = [(0.0, start_c)]
        came_from: dict = {}
        g: dict = {start_c: 0.0}

        def h(c):
            return max(abs(c[0] - end_c[0]), abs(c[1] - end_c[1])) * 5

        visited: set = set()

        while open_set and len(visited) < 8192:
            _, current = heapq.heappop(open_set)
            if current in visited:
                continue
            visited.add(current)

            if current == end_c:
                # Reconstruct
                path = []
                node = current
                while node in came_from:
                    path.append(to_px(node))
                    node = came_from[node]
                path.append(start)
                path.reverse()
                path[-1] = end
                return path

            cx, cy = current
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    nb = (cx + dx, cy + dy)
                    if not in_bounds(nb) or nb in visited:
                        continue
                    nb_px = to_px(nb)
                    cur_px = to_px(current)
                    # Collision check on the step segment
                    if walls and PathfindingSystem.is_path_blocked_by_walls(cur_px, nb_px, walls, spatial_hash):
                        continue
                    if obstacles and PathfindingSystem.is_path_blocked_by_obstacles(
                        cur_px, nb_px, obstacles, exclude_entity_id, spatial_hash
                    ):
                        continue
                    # Cost per step consistent with get_movement_cost rules:
                    # realistic=sqrt(2)*5, standard/alternate=Chebyshev 5ft
                    is_diag = dx != 0 and dy != 0
                    step = 5 * (math.sqrt(2) if (is_diag and diagonal_rule == 'realistic') else 1)
                    new_g = g[current] + step
                    if max_distance and new_g > max_distance:
                        continue
                    if new_g < g.get(nb, float('inf')):
                        g[nb] = new_g
                        came_from[nb] = current
                        heapq.heappush(open_set, (new_g + h(nb), nb))

        return None  # unreachable

    @staticmethod
    def get_reachable_cells(
        start: tuple,
        speed: float,
        walls: list,
        obstacles: list,
        grid_size: float,
        diagonal_rule: str = "standard",
        spatial_hash: Optional['SpatialHashGrid'] = None,
    ) -> list[dict]:
        """BFS expansion. Returns [{x, y, cost}] for cells reachable within speed."""
        def to_cell(pt):
            return (int(pt[0] / grid_size), int(pt[1] / grid_size))

        def to_px(cell):
            return (cell[0] * grid_size + grid_size / 2, cell[1] * grid_size + grid_size / 2)

        start_c = to_cell(start)
        queue = [(0.0, start_c)]
        best: dict = {start_c: 0.0}
        result = []

        while queue:
            cost, current = heapq.heappop(queue)
            if cost > best.get(current, float('inf')):
                continue

            cx, cy = current
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    nb = (cx + dx, cy + dy)
                    nb_px = to_px(nb)
                    cur_px = to_px(current)
                    if walls and PathfindingSystem.is_path_blocked_by_walls(cur_px, nb_px, walls, spatial_hash):
                        continue
                    if obstacles and PathfindingSystem.is_path_blocked_by_obstacles(cur_px, nb_px, obstacles, spatial_hash=spatial_hash):
                        continue
                    # Consistent with A* step costs: realistic=sqrt(2)*5, standard/alternate=5
                    is_diag = dx != 0 and dy != 0
                    step = 5 * (math.sqrt(2) if (is_diag and diagonal_rule == 'realistic') else 1)
                    new_cost = cost + step
                    if new_cost <= speed and new_cost < best.get(nb, float('inf')):
                        best[nb] = new_cost
                        heapq.heappush(queue, (new_cost, nb))

        for cell, cost in best.items():
            if cell == start_c:
                continue
            px = to_px(cell)
            result.append({'x': px[0], 'y': px[1], 'cost': cost})

        return result
