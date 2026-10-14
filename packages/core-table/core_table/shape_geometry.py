"""Canonical, bounded world vertices shared by persistence and shape commands."""
import math


def normalize_world_vertices(value, *, minimum=0):
    if not isinstance(value, (list, tuple)) or not minimum <= len(value) <= 1000:
        raise ValueError(f"Shape geometry requires {minimum} to 1000 vertices")
    points = []
    for vertex in value:
        if isinstance(vertex, dict):
            vertex = [vertex.get("x"), vertex.get("y")]
        if not isinstance(vertex, (list, tuple)) or len(vertex) != 2:
            raise ValueError("Shape vertices require coordinate pairs")
        if any(isinstance(coordinate, bool) or not isinstance(coordinate, (int, float))
                or abs(coordinate) > 1_000_000 or not math.isfinite(coordinate) for coordinate in vertex):
            raise ValueError("Shape coordinates must be finite and bounded")
        points.append(list(vertex))
    return points
