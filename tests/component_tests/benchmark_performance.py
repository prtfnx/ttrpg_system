# Performance benchmark script for GeometricManager
import time
import numpy as np
from GeometricManager import GeometricManager, profiler

def performance_benchmark():
    """Run a comprehensive performance benchmark"""
    print("=== PERFORMANCE BENCHMARK ===")
    print("Testing numpy array-based GeometricManager implementation")
    
    # Test configurations
    test_configs = [
        {"obstacles": 5, "max_distance": 100, "iterations": 10, "description": "Light workload"},
        {"obstacles": 10, "max_distance": 150, "iterations": 5, "description": "Medium workload"},
        {"obstacles": 20, "max_distance": 200, "iterations": 3, "description": "Heavy workload"},
        {"obstacles": 50, "max_distance": 300, "iterations": 2, "description": "Extreme workload"},
    ]
    
    for config in test_configs:
        print(f"\n--- {config['description']}: {config['obstacles']} obstacles, {config['max_distance']} distance, {config['iterations']} iterations ---")
        
        # Generate test data
        player_pos = np.array([50.0, 50.0], dtype=np.float64)
        
        # Create random obstacles
        np.random.seed(42)  # For reproducible results
        obstacles = np.random.rand(config['obstacles'], 2, 2) * config['max_distance']
        
        # Reset profiler
        profiler.reset()
        total_start = time.perf_counter()
        
        # Initialize variables
        visibility_polygon = None
        mask = None
        
        # Run multiple iterations
        for i in range(config['iterations']):
            # Test visibility polygon generation
            visibility_polygon = GeometricManager.generate_visibility_polygon(
                player_pos, obstacles, config['max_distance'], angle_resolution=360
            )
            
            # Test visibility mask generation
            mask = GeometricManager.get_visibility_mask(
                player_pos, obstacles, (100, 100), config['max_distance']
            )
        
        total_end = time.perf_counter()
        total_time = (total_end - total_start) * 1000  # Convert to ms
        
        print(f"Total execution time: {total_time:.2f}ms")
        print(f"Average per iteration: {total_time/config['iterations']:.2f}ms")
        
        if visibility_polygon is not None:
            print(f"Generated polygon vertices: {len(visibility_polygon)}")
        
        if mask is not None:
            visible_ratio = np.sum(mask) / mask.size * 100
            print(f"Visible area coverage: {np.sum(mask)}/{mask.size} cells ({visible_ratio:.1f}%)")
        
        # Show detailed profiling breakdown
        print("\nDetailed profiling:")
        print(profiler.get_summary())

def stress_test():
    """Perform stress testing with very large obstacle counts"""
    print("\n=== STRESS TEST ===")
    print("Testing with very high obstacle counts")
    
    player_pos = np.array([100.0, 100.0], dtype=np.float64)
    
    stress_configs = [100, 200, 500]
    
    for obstacle_count in stress_configs:
        print(f"\n--- Stress test: {obstacle_count} obstacles ---")
        
        # Generate large number of obstacles
        np.random.seed(42)
        obstacles = np.random.rand(obstacle_count, 2, 2) * 200
        
        profiler.reset()
        
        start_time = time.perf_counter()
        visibility_polygon = GeometricManager.generate_visibility_polygon(
            player_pos, obstacles, max_view_distance=200, angle_resolution=180
        )
        end_time = time.perf_counter()
        
        execution_time = (end_time - start_time) * 1000
        print(f"Execution time: {execution_time:.2f}ms")
        print(f"Generated vertices: {len(visibility_polygon)}")
        print(f"Performance: {len(visibility_polygon)/execution_time:.2f} vertices/ms")
        
        # Quick profiling summary
        stats = profiler.get_summary().split('\n')
        for line in stats:
            if 'generate_visibility_polygon' in line or 'cast_ray' in line:
                print(line)

if __name__ == "__main__":
    performance_benchmark()
    stress_test()
