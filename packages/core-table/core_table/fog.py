"""Derive the compatibility rectangle view from canonical persisted entities."""
import math


def fog_rectangles_from_entities(entities):
    rectangles = {'hide': [], 'reveal': []}
    modes = {'__FOG_HIDE__': 'hide', '__FOG_REVEAL__': 'reveal'}
    for entity in entities:
        if entity.layer != 'fog_of_war' or entity.texture_path not in modes:
            continue
        x, y = entity.position
        width, height = entity.scale_x, entity.scale_y
        if not all(isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
                   for value in (x, y, width, height)) or width < 0 or height < 0:
            raise ValueError('Stored fog rectangle is invalid')
        rectangles[modes[entity.texture_path]].append(((x, y), (x + width, y + height)))
    return rectangles
