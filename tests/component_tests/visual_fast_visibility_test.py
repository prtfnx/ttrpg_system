#!/usr/bin/env python3
"""
FAST Visibility Visual Testing

This demonstrates the NEW FAST visibility method logic visually:
- Green rays: Cast ONLY to obstacle endpoints (the key optimization)
- Blue rays: Additional coverage rays (only 40 total)
- Red lines: Obstacles
- Yellow polygon: Resulting visibility area

The fast method casts rays ONLY to critical points instead of 360+ rays.
"""

import numpy as np
import matplotlib.pyplot as plt
import matplotlib.animation as animation
from GeometricManager import GeometricManager, profiler
import time

class FastVisibilityVisualizer:
    """Interactive visualization of the FAST visibility method"""
    
    def __init__(self):
        self.fig, self.ax = plt.subplots(figsize=(12, 8))
        self.ax.set_xlim(0, 100)
        self.ax.set_ylim(0, 100)
        self.ax.set_aspect('equal')
        self.ax.grid(True, alpha=0.3)
        self.ax.set_title("FAST Visibility System - Rays ONLY to Obstacle Endpoints + 40 Additional", 
                         fontsize=14, fontweight='bold')
        
        # Player position (interactive with mouse)
        self.player_pos = np.array([50.0, 50.0], dtype=np.float64)
        
        # Obstacles (line segments)
        self.obstacles = np.array([
            [[20, 30], [40, 30]],   # Horizontal wall
            [[60, 20], [60, 40]],   # Vertical wall  
            [[70, 60], [90, 80]],   # Diagonal wall
            [[15, 70], [35, 85]],   # Another diagonal
            [[80, 15], [95, 25]],   # Corner obstacle
        ], dtype=np.float64)
        
        # Visual elements
        self.obstacle_lines = []
        self.endpoint_rays = []
        self.additional_rays = []
        self.visibility_polygon = None
        self.player_marker = None
        self.endpoint_markers = []
        
        # Performance tracking
        self.last_update_time = 0
        self.frame_count = 0
        self.fps_text = None
        
        # Setup mouse interaction
        self.fig.canvas.mpl_connect('motion_notify_event', self.on_mouse_move)
        
        self.setup_visualization()
    
    def setup_visualization(self):
        """Initialize the visual elements"""
        # Draw obstacles (red lines)
        for obstacle in self.obstacles:
            line, = self.ax.plot([obstacle[0][0], obstacle[1][0]], 
                                [obstacle[0][1], obstacle[1][1]], 
                                'r-', linewidth=3, label='Obstacles' if len(self.obstacle_lines) == 0 else "")
            self.obstacle_lines.append(line)
        
        # Draw obstacle endpoints (white dots - ray targets)
        endpoints = self.obstacles.reshape(-1, 2)
        for endpoint in endpoints:
            marker, = self.ax.plot(endpoint[0], endpoint[1], 'wo', markersize=6, 
                                  markeredgecolor='black', markeredgewidth=1,
                                  label='Ray Targets' if len(self.endpoint_markers) == 0 else "")
            self.endpoint_markers.append(marker)
        
        # Initialize player marker
        self.player_marker, = self.ax.plot(self.player_pos[0], self.player_pos[1], 
                                          'ks', markersize=10, label='Player')
        
        # Add performance text
        self.fps_text = self.ax.text(0.02, 0.98, '', transform=self.ax.transAxes, 
                                    fontsize=10, verticalalignment='top',
                                    bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.8))
        
        # Add legend
        self.ax.legend(loc='upper right')
        
        # Initial update
        self.update_visibility()
    
    def on_mouse_move(self, event):
        """Handle mouse movement to update player position"""
        if event.inaxes != self.ax:
            return
        
        # Update player position
        self.player_pos[0] = event.xdata
        self.player_pos[1] = event.ydata
        
        # Update visualization
        self.update_visibility()
    
    def update_visibility(self):
        """Update the visibility visualization using FAST method"""
        start_time = time.perf_counter()
        
        # Clear previous rays and polygon
        for ray in self.endpoint_rays + self.additional_rays:
            ray.remove()
        self.endpoint_rays.clear()
        self.additional_rays.clear()
        
        if self.visibility_polygon:
            self.visibility_polygon.remove()
        
        # Update player marker position
        self.player_marker.set_data([self.player_pos[0]], [self.player_pos[1]])
        
        # VISUALIZE FAST METHOD LOGIC
        max_view_distance = 60
        
        # 1. Cast rays to obstacle endpoints (GREEN - the key optimization)
        if self.obstacles.size > 0:
            endpoints = self.obstacles.reshape(-1, 2)
            
            for endpoint in endpoints:
                # Calculate angle and cast ray
                angle = np.arctan2(endpoint[1] - self.player_pos[1], 
                                 endpoint[0] - self.player_pos[0])
                intersection_point = GeometricManager._cast_ray_to_closest_obstacle(
                    self.player_pos, angle, max_view_distance, self.obstacles
                )
                
                # Draw ray (GREEN)
                ray, = self.ax.plot([self.player_pos[0], intersection_point[0]], 
                                   [self.player_pos[1], intersection_point[1]], 
                                   'g-', alpha=0.7, linewidth=1.5,
                                   label='Endpoint Rays' if len(self.endpoint_rays) == 0 else "")
                self.endpoint_rays.append(ray)
        
        # 2. Cast additional coverage rays (BLUE - only 40)
        additional_angles = np.linspace(0, 2 * np.pi, 40, endpoint=False)
        for i, angle in enumerate(additional_angles):
            if i % 3 == 0:  # Show every 3rd ray to reduce visual clutter
                intersection_point = GeometricManager._cast_ray_to_closest_obstacle(
                    self.player_pos, angle, max_view_distance, self.obstacles
                )
                
                # Draw ray (BLUE)
                ray, = self.ax.plot([self.player_pos[0], intersection_point[0]], 
                                   [self.player_pos[1], intersection_point[1]], 
                                   'b-', alpha=0.4, linewidth=1,
                                   label='Coverage Rays' if len(self.additional_rays) == 0 else "")
                self.additional_rays.append(ray)
        
        # 3. Generate and draw visibility polygon (YELLOW)
        visibility_polygon = GeometricManager.generate_visibility_polygon(
            self.player_pos, self.obstacles, max_view_distance, additional_rays=40
        )
        
        if visibility_polygon.shape[0] > 2:
            self.visibility_polygon = plt.Polygon(visibility_polygon, alpha=0.2, 
                                                 facecolor='yellow', edgecolor='orange', 
                                                 linewidth=2, label='Visibility Area')
            self.ax.add_patch(self.visibility_polygon)
        
        # Update performance display
        end_time = time.perf_counter()
        calculation_time = (end_time - start_time) * 1000  # ms
        
        # Calculate ray counts for display
        endpoint_ray_count = len(self.obstacles) * 6  # 3 rays per endpoint (with perturbations)
        total_ray_count = endpoint_ray_count + 40
        
        # Update FPS and performance text
        self.frame_count += 1
        current_time = time.time()
        if current_time - self.last_update_time > 0.5:  # Update every 0.5s
            fps = self.frame_count / (current_time - self.last_update_time)
            self.last_update_time = current_time
            self.frame_count = 0
            
            performance_text = (
                f"FAST METHOD PERFORMANCE:\n"
                f"Calculation Time: {calculation_time:.2f}ms\n"
                f"Total Rays Cast: {total_ray_count}\n"
                f"  • Endpoint Rays: {endpoint_ray_count}\n"
                f"  • Coverage Rays: 40\n"
                f"FPS: {fps:.1f}\n"
                f"Player: ({self.player_pos[0]:.1f}, {self.player_pos[1]:.1f})"
            )
            self.fps_text.set_text(performance_text)
        
        # Redraw
        self.fig.canvas.draw_idle()
    
    def run(self):
        """Start the interactive visualization"""
        print("=== FAST VISIBILITY VISUAL TEST ===")
        print("Move mouse to control player position")
        print("Green rays = cast to obstacle endpoints (KEY OPTIMIZATION)")
        print("Blue rays = additional coverage (only 40 total)")
        print("Yellow area = resulting visibility polygon")
        print("White dots = obstacle endpoints (ray targets)")
        print("\nMethod: Cast rays ONLY to critical points, not 360+ rays!")
        
        plt.show()

def test_fast_method_comparison():
    """Compare fast method vs traditional method performance"""
    print("\n" + "="*60)
    print("FAST METHOD vs TRADITIONAL METHOD COMPARISON")
    print("="*60)
    
    # Test setup
    player = np.array([50.0, 50.0], dtype=np.float64)
    obstacles = np.random.rand(15, 2, 2) * 100  # 15 random obstacles
    
    print(f"Test setup: {len(obstacles)} obstacles")
    print(f"Player position: ({player[0]:.1f}, {player[1]:.1f})")
    
    # Fast method (rays only to endpoints + 40 additional)
    print(f"\nFAST METHOD (Rays to endpoints + 40):")
    fast_ray_count = len(obstacles) * 6 + 40
    print(f"Total rays to cast: {fast_ray_count}")
    
    fast_times = []
    for i in range(10):
        profiler.reset()
        start_time = time.perf_counter()
        visibility_polygon = GeometricManager.generate_visibility_polygon(
            player, obstacles, max_view_distance=60, additional_rays=40
        )
        end_time = time.perf_counter()
        fast_times.append((end_time - start_time) * 1000)
    
    fast_avg = np.mean(fast_times)
    print(f"Average time: {fast_avg:.2f}ms")
    print(f"Time per ray: {fast_avg / fast_ray_count:.4f}ms")
    
    # Traditional method simulation (360 rays)
    print(f"\nTRADITIONAL METHOD (360 degree rays):")
    traditional_ray_count = 360
    print(f"Total rays to cast: {traditional_ray_count}")
    
    # Simulate traditional method by using many additional rays
    traditional_times = []
    for i in range(10):
        start_time = time.perf_counter()
        # Simulate traditional method with 360 evenly spaced rays
        ray_angles = np.linspace(0, 2 * np.pi, traditional_ray_count, endpoint=False)
        visibility_points = []
        for angle in ray_angles:
            intersection_point = GeometricManager._cast_ray_to_closest_obstacle(
                player, angle, 60, obstacles
            )
            visibility_points.append(intersection_point)
        visibility_array = np.array(visibility_points)
        sorted_points = GeometricManager._sort_points_clockwise(visibility_array, player)
        end_time = time.perf_counter()
        traditional_times.append((end_time - start_time) * 1000)
    
    traditional_avg = np.mean(traditional_times)
    print(f"Average time: {traditional_avg:.2f}ms")
    print(f"Time per ray: {traditional_avg / traditional_ray_count:.4f}ms")
    
    # Comparison
    print(f"\nCOMPARISON:")
    print(f"Speed improvement: {traditional_avg / fast_avg:.1f}x faster")
    print(f"Ray reduction: {traditional_ray_count / fast_ray_count:.1f}x fewer rays")
    print(f"Efficiency gain: {(traditional_avg - fast_avg) / traditional_avg * 100:.1f}% faster")
    
    print(f"\nFAST METHOD ADVANTAGES:")
    print(f"  • Uses {fast_ray_count} rays instead of {traditional_ray_count}")
    print(f"  • {fast_avg:.2f}ms vs {traditional_avg:.2f}ms calculation time")
    print(f"  • Focuses on critical visibility points (obstacle endpoints)")
    print(f"  • Excellent for real-time applications")

if __name__ == "__main__":
    print("FAST VISIBILITY SYSTEM - VISUAL DEMONSTRATION")
    print("=" * 50)
    
    # Run performance comparison first
    test_fast_method_comparison()
    
    print(f"\nStarting interactive visualization...")
    print("Close the window when done to see profiling summary.")
    
    # Run interactive visualization
    visualizer = FastVisibilityVisualizer()
    visualizer.run()
    
    # Show final profiling stats
    print("\n" + "="*50)
    print("FINAL PROFILING SUMMARY")
    print("="*50)
    print(profiler.get_summary())
