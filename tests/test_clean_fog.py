#!/usr/bin/env python3
"""
Test script for the cleaned up fog system
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from GeometricManager import GeometricManager
import numpy as np

def test_basic_fog_functions():
    """Test the basic fog functions"""
    print("=== Testing Cleaned Up Fog System ===")
    
    # Test 1: Rectangle intersection
    print("\n1. Testing rectangle intersection:")
    rect1 = ((0.0, 0.0), (100.0, 100.0))
    rect2 = ((50.0, 50.0), (150.0, 150.0))
    rect3 = ((200.0, 200.0), (300.0, 300.0))
    
    intersects_12 = GeometricManager.rectangles_intersect(rect1, rect2)
    intersects_13 = GeometricManager.rectangles_intersect(rect1, rect3)
    
    print(f"Rect1 intersects Rect2: {intersects_12}")  # Should be True
    print(f"Rect1 intersects Rect3: {intersects_13}")  # Should be False
    
    # Test 2: Rectangle to polygon conversion
    print("\n2. Testing rectangle to polygon conversion:")
    polygon = GeometricManager.rectangle_to_polygon(rect1)
    print(f"Rectangle {rect1} -> Polygon vertices: {polygon.shape[0]}")
    print(f"Vertices: {polygon}")
    
    # Test 3: Union polygon with rectangle
    print("\n3. Testing union polygon with rectangle:")
    # Start with first rectangle as polygon
    base_polygon = GeometricManager.rectangle_to_polygon(rect1)
    print(f"Base polygon vertices: {base_polygon.shape[0]}")
    
    # Union with intersecting rectangle
    union_polygon = GeometricManager.union_polygon_with_rectangle(base_polygon, rect2)
    print(f"Union polygon vertices: {union_polygon.shape[0]}")
    print(f"Union vertices: {union_polygon}")
    
    # Test 4: Subtract rectangle from polygon
    print("\n4. Testing subtract rectangle from polygon:")
    # Create a larger base polygon
    large_rect = ((0.0, 0.0), (200.0, 200.0))
    large_polygon = GeometricManager.rectangle_to_polygon(large_rect)
    
    # Subtract a smaller rectangle from it
    subtract_rect = ((50.0, 50.0), (150.0, 150.0))
    result_polygon = GeometricManager.subtract_rectangle_from_polygon(large_polygon, subtract_rect)
    print(f"Result polygon vertices: {result_polygon.shape[0]}")
    print(f"Result vertices: {result_polygon}")
    
    print("\n✅ All basic fog function tests completed!")

if __name__ == "__main__":
    test_basic_fog_functions()
