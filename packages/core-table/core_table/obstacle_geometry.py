"""Bounded world boundaries shared by movement, vision and planning."""
import math

MAX_SEGMENTS = 8192
MAX_COORDINATE = 10_000_000


def _number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError('Non-finite obstacle geometry')
    if abs(value) > MAX_COORDINATE:
        raise ValueError('Obstacle geometry exceeds coordinate bounds')
    return float(value)


def obstacle_boundary(entity):
    kind = getattr(entity, 'obstacle_type', None)
    raw = getattr(entity, 'obstacle_data', None)
    data = raw if isinstance(raw, dict) else {}
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

    width, height = _number(getattr(entity, 'width', 0)), _number(getattr(entity, 'height', 0))
    width = (width if width > 0 else 50) * _number(getattr(entity, 'scale_x', 1))
    height = (height if height > 0 else 50) * _number(getattr(entity, 'scale_y', 1))
    x, y = (_number(value) for value in entity.position)
    angle = math.radians(_number(getattr(entity, 'rotation', 0)))
    cosine, sine = math.cos(angle), math.sin(angle)

    def transform(dx, dy):
        return (_number(x + width / 2 + dx * cosine - dy * sine),
                _number(y + height / 2 + dx * sine + dy * cosine))

    if kind == 'circle':
        return [transform(width / 2 * math.cos(index * math.tau / 32),
                          height / 2 * math.sin(index * math.tau / 32)) for index in range(32)], True
    if kind == 'line':
        return [transform(-width / 2, 0), transform(width / 2, 0)], False
    return [transform(-width / 2, -height / 2), transform(width / 2, -height / 2),
            transform(width / 2, height / 2), transform(-width / 2, height / 2)], True
