"""Read-only obstacle boundaries; never serialize entity identity or metadata."""
import math
import uuid

from core_table.table import VirtualTable

MAX_SEGMENTS = 8192
MAX_COORDINATE = 10_000_000


def _number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError('Non-finite obstacle geometry')
    if abs(value) > MAX_COORDINATE:
        raise ValueError('Obstacle geometry exceeds coordinate bounds')
    return float(value)


def _vertices(entity):
    kind = entity.obstacle_type
    data = entity.obstacle_data if isinstance(entity.obstacle_data, dict) else {}
    vertices = data.get('vertices')
    if kind == 'polygon' or kind == 'line' and vertices is not None:
        if not isinstance(vertices, list) or not 2 <= len(vertices) <= MAX_SEGMENTS:
            raise ValueError('Invalid obstacle vertices')
        points = []
        for point in vertices:
            if not isinstance(point, (list, tuple)) or len(point) != 2:
                raise ValueError('Invalid obstacle point')
            points.append(tuple(_number(value) for value in point))
        return points[:2] if kind == 'line' else points, kind != 'line'

    width, height = _number(entity.width), _number(entity.height)
    width = (width if width > 0 else 50) * _number(entity.scale_x)
    height = (height if height > 0 else 50) * _number(entity.scale_y)
    x, y = (_number(value) for value in entity.position)
    angle = math.radians(_number(entity.rotation))
    cosine, sine = math.cos(angle), math.sin(angle)

    def transform(dx, dy):
        return (x + width / 2 + dx * cosine - dy * sine,
                y + height / 2 + dx * sine + dy * cosine)

    if kind == 'circle':
        return [transform(width / 2 * math.cos(index * math.tau / 32),
                          height / 2 * math.sin(index * math.tau / 32)) for index in range(32)], True
    if kind == 'line':
        return [transform(-width / 2, 0), transform(width / 2, 0)], False
    return [transform(-width / 2, -height / 2), transform(width / 2, -height / 2),
            transform(width / 2, height / 2), transform(-width / 2, height / 2)], True


def obstacle_occlusion_snapshot(table: VirtualTable) -> dict:
    segments = []
    try:
        for entity in table.entities.values():
            if entity.layer != 'obstacles' or entity.texture_path in {'__LIGHT__', '__FOG_HIDE__', '__FOG_REVEAL__'}:
                continue
            points, closed = _vertices(entity)
            count = len(points) if closed else len(points) - 1
            if len(segments) // 4 + count > MAX_SEGMENTS:
                raise ValueError('Occlusion segment budget exceeded')
            for index in range(count):
                segments.extend(_number(value) for point in (points[index], points[(index + 1) % len(points)])
                                for value in point)
        return {'schema_version': 1, 'valid': True, 'segments': segments}
    except (ValueError, TypeError, OverflowError):
        # Never publish a partial boundary that would reveal behind an omitted obstacle.
        return {'schema_version': 1, 'valid': False, 'segments': []}


def versioned_occlusion_snapshot(protocol, table: VirtualTable) -> dict:
    """One ordered revision stream per loaded session, reset by a fresh epoch."""
    if not hasattr(protocol, '_occlusion_cache'):
        protocol._occlusion_cache = {}
        protocol._occlusion_epoch = str(uuid.uuid4())
    key = str(table.table_id)
    geometry = obstacle_occlusion_snapshot(table)
    previous = protocol._occlusion_cache.get(key)
    if previous is not None and all(previous[field] == value for field, value in geometry.items()):
        return previous
    payload = {**geometry, 'epoch': protocol._occlusion_epoch,
               'revision': previous['revision'] + 1 if previous is not None else 1}
    protocol._occlusion_cache[key] = payload
    return payload
