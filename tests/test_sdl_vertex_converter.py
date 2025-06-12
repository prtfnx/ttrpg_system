#!/usr/bin/env python3
"""
Comprehensive test script for sdl_vertex_converter.py module
Tests all conversion functions with optimized SDL vertex creation
"""

import numpy as np
import sdl3
import sys
import os

# Add the current directory to Python path to import our module
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import sdl_vertex_converter

def test_polygon_to_sdl_triangles():
    """Test polygon to SDL triangle fan conversion"""
    print("\n🔹 Testing polygon_to_sdl_triangles:")
    
    # Test data: a simple triangle
    polygon_points = np.array([[100.0, 100.0], [200.0, 100.0], [150.0, 200.0]], dtype=np.float64)
    center_point = np.array([150.0, 133.0], dtype=np.float64)
    color = (0.0, 1.0, 0.0, 0.8)  # Green with transparency
    
    try:
        vertices = sdl_vertex_converter.polygon_to_sdl_triangles(polygon_points, center_point, color)
        print(f"✅ Polygon conversion successful: {len(vertices)} vertices created")
        
        # Verify structure
        expected_vertices = len(polygon_points) * 3  # Triangle fan
        if len(vertices) == expected_vertices:
            print(f"✅ Correct vertex count: {expected_vertices}")
        else:
            print(f"❌ Wrong vertex count: expected {expected_vertices}, got {len(vertices)}")
            
        # Check first triangle vertices
        print("First triangle vertices:")
        for i in range(3):
            v = vertices[i]
            print(f"  Vertex {i}: pos=({v.position.x:.1f}, {v.position.y:.1f}), color=({v.color.r:.1f}, {v.color.g:.1f}, {v.color.b:.1f}, {v.color.a:.1f})")
            
    except Exception as e:
        print(f"❌ Polygon conversion failed: {e}")
        import traceback
        traceback.print_exc()

def test_points_to_sdl_lines():
    """Test points to SDL line strip conversion"""
    print("\n🔹 Testing points_to_sdl_lines:")
    
    # Test data: a simple line path
    points = np.array([[10.0, 10.0], [50.0, 20.0], [90.0, 50.0], [120.0, 80.0]], dtype=np.float64)
    color = (1.0, 1.0, 1.0, 1.0)  # White
    
    try:
        vertices = sdl_vertex_converter.points_to_sdl_lines(points, color)
        print(f"✅ Points conversion successful: {len(vertices)} vertices created")
        
        # Verify structure
        expected_vertices = len(points)
        if len(vertices) == expected_vertices:
            print(f"✅ Correct vertex count: {expected_vertices}")
        else:
            print(f"❌ Wrong vertex count: expected {expected_vertices}, got {len(vertices)}")
            
        # Check texture coordinates progression
        print("Texture coordinates progression:")
        for i in range(min(4, len(vertices))):
            v = vertices[i]
            print(f"  Vertex {i}: tex_coord.x={v.tex_coord.x:.2f}")
            
    except Exception as e:
        print(f"❌ Points conversion failed: {e}")
        import traceback
        traceback.print_exc()

def test_line_segments_to_sdl_lines():
    """Test line segments to SDL lines conversion"""
    print("\n🔹 Testing line_segments_to_sdl_lines:")
    
    # Test data: obstacle line segments (walls)
    line_segments = np.array([
        [[100.0, 100.0], [200.0, 100.0]],  # Horizontal wall
        [[200.0, 100.0], [200.0, 200.0]],  # Vertical wall
        [[200.0, 200.0], [100.0, 200.0]],  # Horizontal wall
        [[100.0, 200.0], [100.0, 100.0]]   # Vertical wall (complete box)
    ], dtype=np.float64)
    color = (1.0, 0.0, 0.0, 1.0)  # Red
    
    try:
        vertices = sdl_vertex_converter.line_segments_to_sdl_lines(line_segments, color)
        print(f"✅ Line segments conversion successful: {len(vertices)} vertices created")
        
        # Verify structure
        expected_vertices = len(line_segments) * 2  # 2 vertices per line segment
        if len(vertices) == expected_vertices:
            print(f"✅ Correct vertex count: {expected_vertices}")
        else:
            print(f"❌ Wrong vertex count: expected {expected_vertices}, got {len(vertices)}")
            
        # Check first line segment
        print("First line segment:")
        for i in range(2):
            v = vertices[i]
            print(f"  Vertex {i}: pos=({v.position.x:.1f}, {v.position.y:.1f})")
            
    except Exception as e:
        print(f"❌ Line segments conversion failed: {e}")
        import traceback
        traceback.print_exc()

def test_rays_to_sdl_lines():
    """Test ray angles to SDL lines conversion"""
    print("\n🔹 Testing rays_to_sdl_lines:")
    
    # Test data: rays from player position
    player_pos = np.array([400.0, 300.0], dtype=np.float64)
    ray_angles = [0.0, np.pi/4, np.pi/2, 3*np.pi/4, np.pi]  # 0°, 45°, 90°, 135°, 180°
    max_distance = 100.0
    color = (0.7, 0.8, 0.0, 0.5)  # Yellow-green with transparency
    
    try:
        vertices = sdl_vertex_converter.rays_to_sdl_lines(player_pos, ray_angles, max_distance, color)
        print(f"✅ Rays conversion successful: {len(vertices)} vertices created")
        
        # Verify structure
        expected_vertices = len(ray_angles) * 2  # 2 vertices per ray
        if len(vertices) == expected_vertices:
            print(f"✅ Correct vertex count: {expected_vertices}")
        else:
            print(f"❌ Wrong vertex count: expected {expected_vertices}, got {len(vertices)}")
            
        # Check first ray (0° angle - pointing right)
        print("First ray (0° angle):")
        for i in range(2):
            v = vertices[i]
            print(f"  Vertex {i}: pos=({v.position.x:.1f}, {v.position.y:.1f})")
            
        # Verify first ray goes from player to (player_x + max_distance, player_y)
        expected_end_x = player_pos[0] + max_distance
        expected_end_y = player_pos[1]
        actual_end_x = vertices[1].position.x
        actual_end_y = vertices[1].position.y
        
        if abs(actual_end_x - expected_end_x) < 0.1 and abs(actual_end_y - expected_end_y) < 0.1:
            print(f"✅ Ray calculation correct: end point ({actual_end_x:.1f}, {actual_end_y:.1f})")
        else:
            print(f"❌ Ray calculation wrong: expected ({expected_end_x:.1f}, {expected_end_y:.1f}), got ({actual_end_x:.1f}, {actual_end_y:.1f})")
            
    except Exception as e:
        print(f"❌ Rays conversion failed: {e}")
        import traceback
        traceback.print_exc()

def test_sorted_points_to_sdl_outline():
    """Test sorted points to SDL outline conversion"""
    print("\n🔹 Testing sorted_points_to_sdl_outline:")
    
    # Test data: a simple quadrilateral (clockwise sorted)
    sorted_points = np.array([[50.0, 50.0], [150.0, 50.0], [150.0, 150.0], [50.0, 150.0]], dtype=np.float64)
    color = (0.0, 1.0, 0.0, 1.0)  # Green
    
    try:
        vertices = sdl_vertex_converter.sorted_points_to_sdl_outline(sorted_points, color)
        print(f"✅ Outline conversion successful: {len(vertices)} vertices created")
          # Verify structure
        expected_vertices = len(sorted_points) * 2  # pairs for line segments (including closing)
        if len(vertices) == expected_vertices:
            print(f"✅ Correct vertex count: {expected_vertices}")
        else:
            print(f"❌ Wrong vertex count: expected {expected_vertices}, got {len(vertices)}")
            
        # Check that outline closes (last segment connects back to first point)
        print("First and last line segments:")
        print(f"  First segment: ({vertices[0].position.x:.1f}, {vertices[0].position.y:.1f}) -> ({vertices[1].position.x:.1f}, {vertices[1].position.y:.1f})")
        print(f"  Last segment: ({vertices[-2].position.x:.1f}, {vertices[-2].position.y:.1f}) -> ({vertices[-1].position.x:.1f}, {vertices[-1].position.y:.1f})")
        
        # Verify that last vertex connects back to first point
        first_point = (vertices[0].position.x, vertices[0].position.y)
        last_connection = (vertices[-1].position.x, vertices[-1].position.y)
        
        if abs(first_point[0] - last_connection[0]) < 0.1 and abs(first_point[1] - last_connection[1]) < 0.1:
            print(f"✅ Outline properly closed")
        else:
            print(f"❌ Outline not properly closed")
            
    except Exception as e:
        print(f"❌ Outline conversion failed: {e}")
        import traceback
        traceback.print_exc()

def test_edge_cases():
    """Test edge cases and error handling"""
    print("\n🔹 Testing edge cases:")
    
    # Test empty/invalid inputs
    try:
        # Empty polygon
        empty_polygon = np.array([], dtype=np.float64).reshape(0, 2)
        center = np.array([0.0, 0.0])
        vertices = sdl_vertex_converter.polygon_to_sdl_triangles(empty_polygon, center)
        print(f"✅ Empty polygon handled: {len(vertices)} vertices")
        
        # Triangle with less than 3 points
        small_polygon = np.array([[10.0, 10.0], [20.0, 20.0]], dtype=np.float64)
        vertices = sdl_vertex_converter.polygon_to_sdl_triangles(small_polygon, center)
        print(f"✅ Small polygon handled: {len(vertices)} vertices")
        
        # Empty line segments
        empty_segments = np.array([], dtype=np.float64).reshape(0, 2, 2)
        vertices = sdl_vertex_converter.line_segments_to_sdl_lines(empty_segments)
        print(f"✅ Empty segments handled: {len(vertices)} vertices")
        
        # Empty ray angles
        empty_rays = []
        vertices = sdl_vertex_converter.rays_to_sdl_lines(center, empty_rays, 100.0)
        print(f"✅ Empty rays handled: {len(vertices)} vertices")
        
    except Exception as e:
        print(f"❌ Edge case handling failed: {e}")
        import traceback
        traceback.print_exc()

def benchmark_performance():
    """Benchmark performance of the conversion functions"""
    print("\n🔹 Performance benchmark:")
    
    import time
    
    # Create larger test data
    large_polygon = np.random.rand(100, 2) * 500  # 100-point polygon
    center = np.array([250.0, 250.0])
    
    # Benchmark polygon conversion
    start_time = time.perf_counter()
    for _ in range(100):  # 100 iterations
        vertices = sdl_vertex_converter.polygon_to_sdl_triangles(large_polygon, center)
    end_time = time.perf_counter()
    
    avg_time = (end_time - start_time) / 100 * 1000  # ms per conversion
    print(f"✅ Polygon conversion (100 vertices): {avg_time:.2f}ms average")
    
    # Benchmark line segments
    large_segments = np.random.rand(200, 2, 2) * 500  # 200 line segments
    
    start_time = time.perf_counter()
    for _ in range(100):
        vertices = sdl_vertex_converter.line_segments_to_sdl_lines(large_segments)
    end_time = time.perf_counter()
    
    avg_time = (end_time - start_time) / 100 * 1000  # ms per conversion
    print(f"✅ Line segments conversion (200 segments): {avg_time:.2f}ms average")

def main():
    """Run all tests for the SDL vertex converter"""
    print("🚀 Starting SDL Vertex Converter Tests")
    print("=" * 50)
    
    test_polygon_to_sdl_triangles()
    test_points_to_sdl_lines()
    test_line_segments_to_sdl_lines() 
    test_rays_to_sdl_lines()
    test_sorted_points_to_sdl_outline()
    test_edge_cases()
    benchmark_performance()
    
    print("\n" + "=" * 50)
    print("🎉 SDL Vertex Converter Tests Completed!")

if __name__ == "__main__":
    main()
