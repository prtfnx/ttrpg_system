"""Read-only obstacle boundaries; never serialize entity identity or metadata."""
import uuid

from core_table.obstacle_geometry import obstacle_boundary
from core_table.table import VirtualTable

MAX_SEGMENTS = 8192
MAX_COORDINATE = 10_000_000


def obstacle_occlusion_snapshot(table: VirtualTable) -> dict:
    segments = []
    try:
        for entity in table.entities.values():
            if entity.layer != 'obstacles' or entity.texture_path in {'__LIGHT__', '__FOG_HIDE__', '__FOG_REVEAL__'}:
                continue
            points, closed = obstacle_boundary(entity)
            count = len(points) if closed else len(points) - 1
            if len(segments) // 4 + count > MAX_SEGMENTS:
                raise ValueError('Occlusion segment budget exceeded')
            for index in range(count):
                segments.extend(value for point in (points[index], points[(index + 1) % len(points)])
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
