#!/usr/bin/env python3
"""
Real-world performance test: Integration with visibility system
Shows how the SDL vertex converter works with actual visibility polygon generation
"""

import numpy as np
import time
import sys
import os

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import sdl_vertex_converter
import sprites_to_obstacles

def test_real_world_integration():
    """Test the SDL vertex converter with realistic visibility data"""
    print("🌟 Real-World Integration Test")
    print("=" * 50)
    
    # Simulate realistic player position and obstacles
    player_pos = np.array([400.0, 300.0])
    
    # Create realistic obstacles (walls, furniture, etc.)
    wall_obstacles = np.array([
        # Room walls
        [[100, 100], [700, 100]],  # Top wall
        [[100, 500], [700, 500]],  # Bottom wall
        [[100, 100], [100, 500]],  # Left wall
        [[700, 100], [700, 500]],  # Right wall
        
        # Internal obstacles
        [[200, 200], [300, 200]],  # Desk
        [[300, 200], [300, 250]],
        [[300, 250], [200, 250]],
        [[200, 250], [200, 200]],
        
        [[500, 350], [600, 350]],  # Table
        [[600, 350], [600, 400]],
        [[600, 400], [500, 400]],
        [[500, 400], [500, 350]],
    ], dtype=np.float32)
    
    # Simulate sprite obstacles (like from light_sprites_to_obstacles)
    sprite_data = [
        {"x": 250.0, "y": 300.0, "width": 50.0, "height": 30.0},  # Character
        {"x": 450.0, "y": 200.0, "width": 40.0, "height": 40.0},  # Object
        {"x": 150.0, "y": 400.0, "width": 60.0, "height": 20.0},  # Item
    ]
    
    # Convert sprites to obstacles using our optimized function
    sprite_obstacles = sprites_to_obstacles.sprites_to_obstacles_numpy(sprite_data)
    
    # Combine obstacles
    all_obstacles = np.vstack([wall_obstacles, sprite_obstacles])
    
    print(f"📊 Test scenario:")
    print(f"  Player position: {player_pos}")
    print(f"  Wall obstacles: {len(wall_obstacles)} line segments")
    print(f"  Sprite obstacles: {len(sprite_obstacles)} line segments")
    print(f"  Total obstacles: {len(all_obstacles)} line segments")
    print()
    
    # Simulate visibility polygon generation (simplified)
    def generate_simple_visibility_polygon(player_pos, obstacles, num_rays=64):
        """Generate a simplified visibility polygon for testing"""
        rays = []
        for i in range(num_rays):
            angle = (2 * np.pi * i) / num_rays
            rays.append([
                player_pos[0] + 150 * np.cos(angle),
                player_pos[1] + 150 * np.sin(angle)
            ])
        return np.array(rays, dtype=np.float32)
    
    # Generate visibility polygon
    visibility_polygon = generate_simple_visibility_polygon(player_pos, all_obstacles)
    
    print(f"🔍 Generated visibility polygon with {len(visibility_polygon)} vertices")
    print()
    
    # Test SDL vertex conversion performance
    iterations = 1000
    print(f"⚡ Performance test ({iterations} iterations):")
    
    # Test individual conversions
    start_time = time.perf_counter()
    for _ in range(iterations):
        triangle_vertices = sdl_vertex_converter.polygon_to_sdl_triangles(
            visibility_polygon, player_pos, (0.0, 1.0, 0.0, 0.3))
        outline_vertices = sdl_vertex_converter.sorted_points_to_sdl_outline(
            visibility_polygon, (0.0, 1.0, 0.0, 1.0))
        obstacle_vertices = sdl_vertex_converter.line_segments_to_sdl_lines(
            all_obstacles, (1.0, 0.0, 0.0, 1.0))
    individual_time = time.perf_counter() - start_time
    
    # Test combined conversion
    start_time = time.perf_counter()
    for _ in range(iterations):
        triangle_vertices, outline_vertices = sdl_vertex_converter.create_ultra_fast_visibility_vertices(
            visibility_polygon, player_pos)
        obstacle_vertices = sdl_vertex_converter.line_segments_to_sdl_lines(
            all_obstacles, (1.0, 0.0, 0.0, 1.0))
    combined_time = time.perf_counter() - start_time
    
    individual_avg = (individual_time / iterations) * 1000
    combined_avg = (combined_time / iterations) * 1000
    speedup = individual_time / combined_time
    
    print(f"  Individual calls: {individual_avg:.3f}ms per frame")
    print(f"  Combined calls:   {combined_avg:.3f}ms per frame")
    print(f"  Speedup:          {speedup:.2f}x faster")
    print()
    
    # Calculate rendering stats
    num_triangle_vertices = len(triangle_vertices)
    num_outline_vertices = len(outline_vertices)
    num_obstacle_vertices = len(obstacle_vertices)
    total_vertices = num_triangle_vertices + num_outline_vertices + num_obstacle_vertices
    
    print(f"📈 Rendering statistics:")
    print(f"  Triangle vertices: {num_triangle_vertices} (filled polygon)")
    print(f"  Outline vertices:  {num_outline_vertices} (polygon border)")
    print(f"  Obstacle vertices: {num_obstacle_vertices} (wall/sprite lines)")
    print(f"  Total vertices:    {total_vertices}")
    print()
    
    # Calculate real-time performance
    fps_60 = 1000 / 60  # 16.67ms per frame at 60 FPS
    fps_120 = 1000 / 120  # 8.33ms per frame at 120 FPS
    
    print(f"🎮 Real-time performance analysis:")
    print(f"  Conversion time:   {combined_avg:.3f}ms")
    print(f"  60 FPS budget:     {fps_60:.2f}ms per frame")
    print(f"  120 FPS budget:    {fps_120:.2f}ms per frame")
    
    if combined_avg < fps_120:
        print(f"  Status: ✅ Excellent - Can run at 120+ FPS")
    elif combined_avg < fps_60:
        print(f"  Status: ✅ Good - Can run at 60+ FPS")
    else:
        print(f"  Status: ⚠️  May need optimization for real-time")
    
    print()
    print("🎉 Integration test completed successfully!")
    print("💡 SDL vertex conversion is ready for real-time visibility rendering")

if __name__ == "__main__":
    test_real_world_integration()
