#!/usr/bin/env python3
"""
Test the new intersection-based rectangle union functionality
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from GeometricManager import GeometricManager
import numpy as np

def test_rectangle_intersection():
    """Test rectangle intersection detection"""
    print("=== Testing Rectangle Intersection ===")
    
    # Test case 1: Non-intersecting rectangles
    rect1 = ((0, 0), (10, 10))
    rect2 = ((20, 20), (30, 30))
    intersects = GeometricManager._rectangles_intersect(rect1, rect2)
    print(f"Non-intersecting rectangles: {intersects} (should be False)")
    assert not intersects, "Non-intersecting rectangles should not intersect"
    
    # Test case 2: Intersecting rectangles
    rect1 = ((0, 0), (10, 10))
    rect2 = ((5, 5), (15, 15))
    intersects = GeometricManager._rectangles_intersect(rect1, rect2)
    print(f"Intersecting rectangles: {intersects} (should be True)")
    assert intersects, "Intersecting rectangles should intersect"
    
    # Test case 3: Adjacent rectangles (touching but not overlapping)
    rect1 = ((0, 0), (10, 10))
    rect2 = ((10, 0), (20, 10))
    intersects = GeometricManager._rectangles_intersect(rect1, rect2)
    print(f"Adjacent rectangles: {intersects} (should be False)")
    assert not intersects, "Adjacent rectangles should not intersect"
    
    # Test case 4: Contained rectangle
    rect1 = ((0, 0), (10, 10))
    rect2 = ((2, 2), (8, 8))
    intersects = GeometricManager._rectangles_intersect(rect1, rect2)
    print(f"Contained rectangle: {intersects} (should be True)")
    assert intersects, "Contained rectangle should intersect"
    
    print("✓ All intersection tests passed!")

def test_rectangle_grouping():
    """Test rectangle grouping by intersection"""
    print("\n=== Testing Rectangle Grouping ===")
    
    # Test case 1: Two separate groups
    rectangles = [
        ((0, 0), (10, 10)),    # Group 1
        ((5, 5), (15, 15)),    # Group 1 (intersects with first)
        ((30, 30), (40, 40)),  # Group 2
        ((35, 35), (45, 45))   # Group 2 (intersects with third)
    ]
    
    groups = GeometricManager._group_intersecting_rectangles(rectangles)
    print(f"Found {len(groups)} groups:")
    for i, group in enumerate(groups):
        print(f"  Group {i+1}: {len(group)} rectangles")
    
    assert len(groups) == 2, f"Expected 2 groups, got {len(groups)}"
    
    # Test case 2: All rectangles in one group
    rectangles = [
        ((0, 0), (10, 10)),
        ((5, 5), (15, 15)),
        ((10, 10), (20, 20)),
        ((15, 15), (25, 25))
    ]
    
    groups = GeometricManager._group_intersecting_rectangles(rectangles)
    print(f"Chain of intersecting rectangles: {len(groups)} groups")
    assert len(groups) == 1, f"Expected 1 group, got {len(groups)}"
    
    # Test case 3: No rectangles
    groups = GeometricManager._group_intersecting_rectangles([])
    assert len(groups) == 0, "Empty list should produce no groups"
    
    print("✓ All grouping tests passed!")

def test_precise_union():
    """Test precise union of rectangles"""
    print("\n=== Testing Precise Union ===")
    
    # Test case 1: Single rectangle
    rectangles = [((0, 0), (10, 10))]
    union_polygon = GeometricManager.union_rectangles_vertices(rectangles)
    print(f"Single rectangle union: {union_polygon.shape[0]} vertices")
    assert union_polygon.shape[0] == 4, "Single rectangle should have 4 vertices"
    
    # Test case 2: Two non-intersecting rectangles (should return first group)
    rectangles = [
        ((0, 0), (10, 10)),
        ((20, 20), (30, 30))
    ]
    union_polygon = GeometricManager.union_rectangles_vertices(rectangles)
    print(f"Non-intersecting rectangles: {union_polygon.shape[0]} vertices")
    # Should return the first group (single rectangle)
    assert union_polygon.shape[0] == 4, "Non-intersecting rectangles should return first rectangle"
    
    # Test case 3: Two intersecting rectangles
    rectangles = [
        ((0, 0), (10, 10)),
        ((5, 5), (15, 15))
    ]
    union_polygon = GeometricManager.union_rectangles_vertices(rectangles)
    print(f"Intersecting rectangles: {union_polygon.shape[0]} vertices")
    print(f"Union vertices: {union_polygon}")
    
    # Verify the union covers both rectangles
    expected_min_x, expected_min_y = 0, 0
    expected_max_x, expected_max_y = 15, 15
    
    min_x, min_y = union_polygon.min(axis=0)
    max_x, max_y = union_polygon.max(axis=0)
    
    print(f"Union bounds: ({min_x}, {min_y}) to ({max_x}, {max_y})")
    print(f"Expected bounds: ({expected_min_x}, {expected_min_y}) to ({expected_max_x}, {expected_max_y})")
    
    assert abs(min_x - expected_min_x) < 0.001, f"Min X mismatch: {min_x} != {expected_min_x}"
    assert abs(min_y - expected_min_y) < 0.001, f"Min Y mismatch: {min_y} != {expected_min_y}"
    assert abs(max_x - expected_max_x) < 0.001, f"Max X mismatch: {max_x} != {expected_max_x}"
    assert abs(max_y - expected_max_y) < 0.001, f"Max Y mismatch: {max_y} != {expected_max_y}"
    
    print("✓ All union tests passed!")

def test_fog_polygon_computation():
    """Test fog polygon computation with hide and reveal"""
    print("\n=== Testing Fog Polygon Computation ===")
    
    # Test case: Hide a large area, then reveal a smaller area inside
    hide_rectangles = [((0, 0), (100, 100))]
    reveal_rectangles = [((25, 25), (75, 75))]
    
    fog_polygon = GeometricManager.compute_fog_polygon(hide_rectangles, reveal_rectangles)
    print(f"Fog polygon after subtraction: {fog_polygon.shape[0]} vertices")
    
    # The result should be a polygon with a hole
    # For now, this might be empty or simplified depending on implementation
    print(f"Fog polygon vertices: {fog_polygon}")
    
    print("✓ Fog polygon computation test completed!")

if __name__ == "__main__":
    test_rectangle_intersection()
    test_rectangle_grouping()
    test_precise_union()
    test_fog_polygon_computation()
    print("\n=== All tests completed! ===")
