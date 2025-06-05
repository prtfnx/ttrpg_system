# Simple performance test
import numpy as np
from GeometricManager import GeometricManager, profiler

def simple_test():
    print("=== SIMPLE PERFORMANCE TEST ===")
    
    # Test data
    player_pos = np.array([25.0, 25.0], dtype=np.float64)
    obstacles = np.array([
        [[10, 10], [40, 10]],  # Horizontal wall
        [[15, 20], [15, 30]],  # Vertical wall  
        [[30, 15], [35, 25]]   # Diagonal wall
    ], dtype=np.float64)
    
    print(f"Player position: {player_pos}")
    print(f"Number of obstacles: {obstacles.shape[0]}")
    
    # Reset profiler
    profiler.reset()
    
    # Test visibility polygon generation multiple times
    for i in range(5):
        vis_poly = GeometricManager.generate_visibility_polygon(
            player_pos, obstacles, max_view_distance=50, angle_resolution=180
        )
        
        mask = GeometricManager.get_visibility_mask(
            player_pos, obstacles, (50, 50), max_view_distance=50
        )
    
    print(f"Last polygon vertices: {len(vis_poly)}")
    print(f"Last mask coverage: {np.sum(mask)}/{mask.size} cells")
    
    print("\n" + profiler.get_summary())

if __name__ == "__main__":
    simple_test()
