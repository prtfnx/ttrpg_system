#!/usr/bin/env python3
"""
Test script for Fog of War Polygon System
"""

import numpy as np
from GeometricManager import GeometricManager

def test_fog_polygon_system():
    """Test the new fog of war polygon system"""
    
    print("=== Testing Fog of War Polygon System ===")
    
    # Test 1: Union of rectangles
    print("\n1. Testing rectangle union:")
    rectangles = [
        ((0.0, 0.0), (100.0, 100.0)),
        ((50.0, 50.0), (150.0, 150.0)),
        ((200.0, 200.0), (300.0, 300.0))
    ]
    
    union_polygon = GeometricManager.union_rectangles_vertices(rectangles)
    print(f"Union polygon vertices: {union_polygon.shape}")
    print(f"Vertices: {union_polygon}")
    
    # Test 2: Subtract rectangle from polygon
    print("\n2. Testing rectangle subtraction:")
    base_polygon = np.array([
        [0, 0],
        [200, 0],
        [200, 200],
        [0, 200]
    ], dtype=np.float64)
    
    subtract_rect = ((50.0, 50.0), (150.0, 150.0))
    result_polygon = GeometricManager.subtract_rectangle_from_polygon(base_polygon, subtract_rect)
    print(f"Result polygon vertices: {result_polygon.shape}")
    print(f"Vertices: {result_polygon}")
    
    # Test 3: Complete fog computation
    print("\n3. Testing complete fog computation:")
    hide_rects = [
        ((0.0, 0.0), (300.0, 300.0)),
        ((400.0, 400.0), (500.0, 500.0))
    ]
    
    reveal_rects = [
        ((50.0, 50.0), (100.0, 100.0)),
        ((150.0, 150.0), (200.0, 200.0))
    ]
    
    fog_polygon = GeometricManager.compute_fog_polygon(hide_rects, reveal_rects)
    print(f"Final fog polygon vertices: {fog_polygon.shape}")
    print(f"Vertices: {fog_polygon}")
    
    # Test 4: Empty cases
    print("\n4. Testing empty cases:")
    empty_polygon = GeometricManager.compute_fog_polygon([], [])
    print(f"Empty fog polygon: {empty_polygon.shape}")
    
    single_rect = GeometricManager.union_rectangles_vertices([((0.0, 0.0), (100.0, 100.0))])
    print(f"Single rectangle polygon: {single_rect.shape}")
    
    print("\n✅ All fog polygon tests completed!")

if __name__ == "__main__":
    test_fog_polygon_system()
