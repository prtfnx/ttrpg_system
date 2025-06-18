from __future__ import annotations
import numpy as np
#from skimage import draw
from typing import List, Tuple, Set, Optional, Callable, Any
import time
import functools
import sdl3
import ctypes
import sys
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Profiling utilities
class ProfilerStats:
    """Simple profiler to track function execution times"""
    
    def __init__(self):
        self.stats = {}
        self.call_counts = {}
    
    def record(self, func_name: str, execution_time: float):
        """Record execution time for a function"""
        if func_name not in self.stats:
            self.stats[func_name] = []
            self.call_counts[func_name] = 0
        
        self.stats[func_name].append(execution_time)
        self.call_counts[func_name] += 1
    
    def get_summary(self) -> str:
        """Get performance summary"""
        summary = ["=== PROFILING SUMMARY ==="]
        
        for func_name in sorted(self.stats.keys()):
            times = self.stats[func_name]
            count = self.call_counts[func_name]
            
            avg_time = sum(times) / len(times) * 1000  # Convert to ms
            min_time = min(times) * 1000
            max_time = max(times) * 1000
            total_time = sum(times) * 1000
            
            summary.append(f"{func_name:30} | Calls: {count:4} | "
                          f"Avg: {avg_time:6.2f}ms | Min: {min_time:6.2f}ms | "
                          f"Max: {max_time:6.2f}ms | Total: {total_time:7.2f}ms")
        
        return "\n".join(summary)
    
    def reset(self):
        """Reset all statistics"""
        self.stats.clear()
        self.call_counts.clear()

# Global profiler instance
profiler = ProfilerStats()

def profile_function(func: Callable) -> Callable:
    """Decorator to profile function execution time"""
    @functools.wraps(func)
    def wrapper(*args, **kwargs) -> Any:
        start_time = time.perf_counter()
        try:
            result = func(*args, **kwargs)
            return result
        finally:
            end_time = time.perf_counter()
            execution_time = end_time - start_time
            profiler.record(func.__name__, execution_time)
    
    return wrapper

class GeometricManager:
    """
    FAST visibility polygon generation using exact user requirements:
    
    Logic:
    1. Cast rays ONLY to obstacle start/end points (critical rays)
    2. Add small perturbations around each endpoint ray for shadow boundaries
    3. Add ~40 additional rays for general coverage
    4. Find intersections only for these specific rays using fast vectorized operations
    5. Keep shortest distance for each ray
    
    Data Format:
    - Points: numpy array of shape (2,) with [x, y] coordinates
    - Line segments: numpy array of shape (2, 2) with [[x1, y1], [x2, y2]]
    - Obstacle collections: numpy array of shape (N, 2, 2) for N line segments
    """
    
    # @staticmethod
    # @profile_function
    # def line(r0: int, c0: int, r1: int, c1: int) -> Tuple[np.ndarray, np.ndarray]:
    #     """Using skimage.draw for line coordinates"""
    #     return draw.line(r0, c0, r1, c1)

    def sprites_to_obstacles_numpy(sprite_list : List[sprite]) -> np.ndarray:
        """
        numpy-vectorized conversion of sprites to obstacles array.
        
        Uses vectorized operations for maximum performance when processing many sprites.
        Args:
            include_non_collidable: Whether to include non-collidable sprites (default: True)

        Returns:
            numpy array of shape (N*4, 2, 2) representing line segments
            Each sprite contributes 4 line segments (rectangle edges)
           
        """        # Pre-filter and extract sprite data in one pass
        valid_sprites = []
        for sprite in sprite_list:
            x, y, w, h = float(sprite.frect.x), float(sprite.frect.y), float(sprite.frect.w), float(sprite.frect.h)
                
            # Skip invalid dimensions
            if w <= 0 or h <= 0:
                continue                    
            valid_sprites.append([x, y, w, h])              
        
        # Handle empty case
        if not valid_sprites:
            logger.debug("No valid sprites found, returning empty obstacles array")
            return np.empty((0, 2, 2), dtype=np.float64)
        
        # Ensure 2D array shape even with single sprite
        sprite_rects = np.array(valid_sprites, dtype=np.float64)
        if sprite_rects.ndim == 1:
            sprite_rects = sprite_rects.reshape(1, -1)  # Reshape to (1, 4) for single sprite
        
        # Ensure we have the expected 2D shape (N, 4)
        if sprite_rects.shape[1] != 4:
            logger.error(f"Unexpected sprite_rects shape: {sprite_rects.shape}, expected (N, 4)")
            return np.empty((0, 2, 2), dtype=np.float64)
        
        # Vectorized calculation of all corners
        x, y, w, h = sprite_rects[:, 0], sprite_rects[:, 1], sprite_rects[:, 2], sprite_rects[:, 3]
        # Calculate all corner points vectorized
        x2 = x + w  # Right edge x-coordinate
        y2 = y + h  # Bottom edge y-coordinate        
        #  Create all line segments at once using vectorized operations
        num_sprites = len(sprite_rects)
                # Pre-allocate obstacles array: 4 segments per sprite
        obstacles = np.empty((num_sprites * 4, 2, 2), dtype=np.float64)
        
        # Vectorized assignment of all line segments
        # Top edges: (x, y) -> (x2, y)
        obstacles[0::4, 0, 0] = x     # Start x
        obstacles[0::4, 0, 1] = y     # Start y  
        obstacles[0::4, 1, 0] = x2    # End x
        obstacles[0::4, 1, 1] = y     # End y
        
        # Right edges: (x2, y) -> (x2, y2)
        obstacles[1::4, 0, 0] = x2    # Start x
        obstacles[1::4, 0, 1] = y     # Start y
        obstacles[1::4, 1, 0] = x2    # End x  
        obstacles[1::4, 1, 1] = y2    # End y
        
        # Bottom edges: (x2, y2) -> (x, y2)
        obstacles[2::4, 0, 0] = x2    # Start x
        obstacles[2::4, 0, 1] = y2    # Start y
        obstacles[2::4, 1, 0] = x     # End x
        obstacles[2::4, 1, 1] = y2    # End y
        
        # Left edges: (x, y2) -> (x, y)
        obstacles[3::4, 0, 0] = x     # Start x
        obstacles[3::4, 0, 1] = y2    # Start y
        obstacles[3::4, 1, 0] = x     # End x
        obstacles[3::4, 1, 1] = y     # End y
        
        logger.debug(f" Created {len(obstacles)} line segments from {num_sprites} sprites '")
        logger.debug(f"Obstacles array shape: {obstacles.shape}")
        
        return obstacles
    
    @staticmethod
    def polygon_to_sdl_triangles(polygon_points: np.ndarray, center_point: np.ndarray,
                            color: Tuple[float, float, float, float] = (0.0, 1.0, 0.0, 0.5)) -> ctypes.Array:
        """
        Convert visibility polygon numpy array to SDL_Vertex triangle fan for GPU rendering.
        
        Args:
            polygon_points: numpy array of shape (N, 2) with polygon vertices
            center_point: numpy array [x, y] representing the center point
            color: RGBA color tuple (r, g, b, a) with values 0.0-1.0
            
        Returns:
            ctypes array of SDL_Vertex structures for triangle rendering
        """
        if polygon_points.shape[0] < 3:
            return (sdl3.SDL_Vertex * 0)()
        
        num_triangles = polygon_points.shape[0]
        num_vertices = num_triangles * 3  # 3 vertices per triangle
        vertices = (sdl3.SDL_Vertex * num_vertices)()
        
        # Pre-convert color to SDL format
        r, g, b, a = color
        sdl_color = sdl3.SDL_FColor()
        sdl_color.r = ctypes.c_float(r)
        sdl_color.g = ctypes.c_float(g)
        sdl_color.b = ctypes.c_float(b)
        sdl_color.a = ctypes.c_float(a)
        
        # Fast triangle fan generation: center -> each polygon edge
        for i in range(num_triangles):
            base_idx = i * 3
            next_idx = (i + 1) % num_triangles
            
            # Triangle: center, current point, next point
            # Vertex 1: Center
            vertices[base_idx].position.x = ctypes.c_float(center_point[0])
            vertices[base_idx].position.y = ctypes.c_float(center_point[1])
            vertices[base_idx].color = sdl_color
            vertices[base_idx].tex_coord.x = ctypes.c_float(0.5)
            vertices[base_idx].tex_coord.y = ctypes.c_float(0.5)
            
            # Vertex 2: Current polygon point
            vertices[base_idx + 1].position.x = ctypes.c_float(polygon_points[i, 0])
            vertices[base_idx + 1].position.y = ctypes.c_float(polygon_points[i, 1])
            vertices[base_idx + 1].color = sdl_color
            vertices[base_idx + 1].tex_coord.x = ctypes.c_float(0.0)
            vertices[base_idx + 1].tex_coord.y = ctypes.c_float(0.0)
            
            # Vertex 3: Next polygon point
            vertices[base_idx + 2].position.x = ctypes.c_float(polygon_points[next_idx, 0])
            vertices[base_idx + 2].position.y = ctypes.c_float(polygon_points[next_idx, 1])
            vertices[base_idx + 2].color = sdl_color
            vertices[base_idx + 2].tex_coord.x = ctypes.c_float(1.0)
            vertices[base_idx + 2].tex_coord.y = ctypes.c_float(0.0)

        return vertices

    @staticmethod
    #@profile_function
    def generate_visibility_polygon(player_pos: np.ndarray, obstacles: np.ndarray, 
                                  max_view_distance: int = 100,
                                  step_to_gap: int = 1) -> np.ndarray:
        """
        FAST visibility polygon generation - cast rays ONLY to obstacle endpoints + few additional rays.
        
        LOGIC:
        2.1) Player point of view in 2D map with line obstacles (start/end points)
        2.2) Find vertices for visibility polygon very fast
        2.3) Cast rays using fast function to ALL obstacle start/end points 
        2.4) Find intersections between rays and obstacles
        2.5) Find distances for intersections
        2.6) Collect only points with shortest distance for visibility polygon
        2.7) Cast rays to fill gaps between arcs (if needed) 
        
        Args:
            player_pos: numpy array [x, y] representing player position
            obstacles: numpy array of shape (N, 2, 2) representing line segments
            max_view_distance: maximum viewing distance
            step_to_gap: number of additional rays for coverage (default 40)
        
        Returns:
            numpy array of shape (M, 2) representing visibility polygon vertices
        """
        ray_angles = []
        
        # Step 2.3: Cast rays to ALL obstacle start and end points
        if obstacles.size > 0:
            # Get all obstacle endpoints (start and end points)
            #print(f"Obstacles : {obstacles}")
            endpoints = obstacles.reshape(-1, 2)  # Shape: (2*N, 2) - all start/end points
            #print(f"Obstacle endpoints: {endpoints}")
            # Calculate angles from player to each obstacle endpoint - FAST vectorized
            vectors = endpoints - player_pos
            #print('Vectors to endpoints:', vectors)
            angles_to_endpoints = np.arctan2(vectors[:, 1], vectors[:, 0])
            #print(f"Angles to endpoints: {angles_to_endpoints}")
            # FIX: Normalize angles to [0, 2π] range to handle negative angles
            angles_to_endpoints = np.where(angles_to_endpoints < 0, 
                                         angles_to_endpoints + 2 * np.pi, 
                                         angles_to_endpoints)
            #print(f"Norm angles endpoints: {angles_to_endpoints}")
            # Add small perturbations for shadow boundaries (edge cases)
            epsilon = 0.001
            for angle in angles_to_endpoints:
                ray_angles.extend([angle - epsilon, angle, angle + epsilon])
           
        else:
            # No obstacles - just add regular rays in all directions            
            visibility_points = []
            additional_angles = np.linspace(0, 2 * np.pi, step_to_gap+20, endpoint=False)
            ray_angles.extend(additional_angles)
            for angle in ray_angles:
                # Cast rays to max distance in all directions
                end_point = GeometricManager._cast_ray_to_max_distance(
                    player_pos, angle, max_view_distance
                )                
                visibility_points.append(end_point)
            visibility_array = np.array(visibility_points)
            return GeometricManager._sort_points_clockwise(visibility_array, player_pos)

        
        # Step 2.4, 2.5, 2.6: Cast rays and find shortest intersections
        visibility_points = []
        for angle in ray_angles:
            # Cast ray and find intersection with shortest distance
            intersection_point = GeometricManager._cast_ray_to_closest_obstacle(
                player_pos, angle, max_view_distance, obstacles
            )
            visibility_points.append(intersection_point)

        # Step 2.7: Cast rays to fill gaps between arcs
        gap_mask= GeometricManager._find_arc_gaps_fast(angles_to_endpoints,step_to_gap=step_to_gap)
        if isinstance(gap_mask, np.ndarray) and gap_mask.dtype == bool:
            gap_indices = np.where(~gap_mask)[0]  # Find False elements (gaps)
            #print(f"Gap indices: {gap_indices}")
            if len(gap_indices) > 0:
                # Convert indices to radians
                gap_angles_from_mask = (gap_indices[:] * 2 * np.pi / len(gap_mask))
                for angle in gap_angles_from_mask:
                    end_point = GeometricManager._cast_ray_to_max_distance(
                        player_pos, angle, max_view_distance
                    )
                    #print(f"Adding gap ray at angle {angle} to point {end_point}")
                    visibility_points.append(end_point)
                GeometricManager.angle_gaps = gap_angles_from_mask
            
        # for debugging purposes
        #if len(visibility_points) == 0:
        #    return np.array([]).reshape(0, 2)
        
        visibility_array = np.array(visibility_points)
        #for test visual
        #GeometricManager.visibility_polygon = visibility_array
        #GeometricManager.ray_angles = ray_angles
        return GeometricManager._sort_points_clockwise(visibility_array, player_pos)

    
    @staticmethod
    #@profile_function
    def _find_arc_gaps_fast(angles_to_endpoints: np.ndarray, step_to_gap: int = 10) -> np.ndarray:
        """
        Simple and fast gap detection using numpy mask operations.
        Find gaps between obstacle coverage and return angles to it.        
        """
        #TODO: fix logic. Temprorary solution to back to vectors:
        #if np.any(angles_to_endpoints < 0.2) or np.any(angles_to_endpoints > 6.0):
        #    return GeometricManager._find_arc_gaps_fast_vector(angles_to_endpoints, step_to_gap=step_to_gap)
        
        # Convert full circle in radians 6.28 to step_to_gap segments
        mask_size= 628 // step_to_gap
        #print(f"step_to_gap: {step_to_gap}, size: {mask_size}")        
        # If no obstacles, return full circle
        min_gap_threshold = np.pi / 36
        shadow_angle = np.pi / 72
        if len(angles_to_endpoints) == 0:
            return np.zeros(mask_size, dtype=bool)
        # Form mask for angles to obstacles
        else:
            mask = np.zeros(mask_size, dtype=bool)
            for i in range(0,len(angles_to_endpoints) - 1, 2):
                angular_span = angles_to_endpoints[i+1] - angles_to_endpoints[i]

                # Handle wraparound case
                if angular_span < 0:
                    angular_span += 2 * np.pi
                #first_norm_vector = int(angles_to_endpoints[i]*100// step_to_gap)
                #second_norm_vector = int(angles_to_endpoints[i+1]*10000 // step_to_gap)
                first_norm_vector = int((angles_to_endpoints[i] / (2 * np.pi)) * mask_size) % mask_size
                second_norm_vector = int((angles_to_endpoints[i+1] / (2 * np.pi)) * mask_size) % mask_size

                #print(f"first_norm_vector: {first_norm_vector}, second_norm_vector: {second_norm_vector}")
                #print(f"i: {i}")
                #print(f"angular span {angular_span}")
                #print(f"first_norm_vector: {first_norm_vector}, second_norm_vector: {second_norm_vector}")
                # Excess checks to ensure indices are within bounds, and try to cover obstacles excessively
                if angular_span < np.pi:
                    #print(f"Angular span is less than pi: {angular_span}")
                    if first_norm_vector <= second_norm_vector:
                        #print(f"First norm vector <= second norm vector: {first_norm_vector} <= {second_norm_vector}")
                        if first_norm_vector > 1:
                            if second_norm_vector < mask_size:
                                mask[first_norm_vector-1:second_norm_vector+1] = True
                            else:
                                mask[first_norm_vector-1:second_norm_vector] = True
                        # elif second_norm_vector < mask_size:
                        #     mask[second_norm_vector:first_norm_vector+1] = True
                        # else:
                        #     mask[second_norm_vector:first_norm_vector] = True
                    # reverse case
                    else:
                        #print(f"Second norm vector >= first norm vector: {first_norm_vector} >= {second_norm_vector}")
                        # if second_norm_vector > 1:
                        #     if first_norm_vector < mask_size:
                        #         mask[second_norm_vector-1:first_norm_vector+1] = True
                        #     else:
                        #         mask[second_norm_vector-1:first_norm_vector] = True
                        # elif first_norm_vector < mask_size:
                        #     mask[second_norm_vector:first_norm_vector+1] = True
                        # else:
                        #     mask[second_norm_vector:first_norm_vector] = True
                        mask[first_norm_vector-1:mask_size] = True
                        mask[0:second_norm_vector+1] = True
                else:
                    #print(f"Angular span is more than pi: {angular_span}")
                    if first_norm_vector < second_norm_vector:
                        #print(f"First norm vector <= second norm vector: {first_norm_vector} <= {second_norm_vector}")
                        if first_norm_vector < mask_size:
                            if second_norm_vector > 1:
                                mask[0:first_norm_vector+1] = True
                                mask[second_norm_vector-1:mask_size] = True
                            else:
                                mask[0:first_norm_vector+1] = True
                                mask[second_norm_vector:mask_size] = True
                        elif second_norm_vector > 1:
                            mask[0:first_norm_vector] = True
                            mask[second_norm_vector-1:mask_size] = True
                        else:
                            mask[0:first_norm_vector] = True
                            mask[second_norm_vector-1:mask_size] = True

                    # reverse case
                    else:
                        #print(f"Second norm vector >= first norm vector: {second_norm_vector} >= {first_norm_vector}")
                        # if second_norm_vector > 1:
                        #     if first_norm_vector < mask_size:
                        #         mask[second_norm_vector-1:first_norm_vector+1] = True
                        #     else:
                        #         mask[second_norm_vector-1:first_norm_vector] = True
                        # elif first_norm_vector < mask_size:
                        #     mask[second_norm_vector:first_norm_vector+1] = True
                        # else:
                        #     mask[second_norm_vector:first_norm_vector] = True
                        if second_norm_vector > 1:
                            if first_norm_vector < mask_size:
                                mask[second_norm_vector-1:first_norm_vector+1] = True   
                            else:
                                mask[second_norm_vector-1:first_norm_vector] = True
                        elif first_norm_vector < mask_size:
                            mask[second_norm_vector:first_norm_vector+1] = True
                        else:
                            mask[second_norm_vector:first_norm_vector] = True
            #print(f"Mask after angles: {mask}")
            return mask
            

    @staticmethod
    #@profile_function
    def _find_arc_gaps_fast_vector(angles_to_endpoints: np.ndarray, step_to_gap: int = 10) -> np.ndarray:
        """
        Simple and fast gap detection using vector operations instead of angle normalization.
        Find gaps between obstacle coverage and return mask indicating coverage.
        Back airdrome version with vectors.
        """
        # Convert full circle to step_to_gap segments
        mask_size = 628 // step_to_gap
        
        # If no obstacles, return all gaps (no coverage)
        if len(angles_to_endpoints) == 0:
            return np.zeros(mask_size, dtype=bool)
        
        # Create unit vectors for each mask segment (evenly spaced around circle)
        segment_angles = np.linspace(0, 2 * np.pi, mask_size, endpoint=False)
        segment_vectors = np.column_stack([np.cos(segment_angles), np.sin(segment_angles)])
        
        # Create unit vectors from angles to endpoints
        endpoint_vectors = np.column_stack([np.cos(angles_to_endpoints), np.sin(angles_to_endpoints)])
        
        # Initialize mask (False = gap, True = covered by obstacle)
        mask = np.zeros(mask_size, dtype=bool)
        
        # For each pair of consecutive endpoint vectors, mark the arc between them as covered
        for i in range(0, len(endpoint_vectors) - 1, 2):
            if i + 1 >= len(endpoint_vectors):
                break
                
            vec1 = endpoint_vectors[i]
            vec2 = endpoint_vectors[i + 1]
            
            # Calculate which segments fall between these two vectors
            # Use cross product to determine if segment is between vec1 and vec2
            for j, segment_vec in enumerate(segment_vectors):
                if GeometricManager._vector_is_between(segment_vec, vec1, vec2):
                    mask[j] = True
        
        return mask

    @staticmethod
    def _vector_is_between(test_vec: np.ndarray, vec1: np.ndarray, vec2: np.ndarray) -> bool:
        """
        Check if test_vec is between vec1 and vec2 in counterclockwise direction.
        All vectors should be unit vectors (normalized).
        """
        # Calculate cross products to determine relative positions
        cross1 = np.cross(vec1, test_vec)  # vec1 × test_vec
        cross2 = np.cross(test_vec, vec2)  # test_vec × vec2
        cross_span = np.cross(vec1, vec2)  # vec1 × vec2
        
        # If the span is small (vectors are very close), consider it covered
        if abs(cross_span) < 1e-6:
            return True
        
        # Check if test_vec is in the sector from vec1 to vec2
        if cross_span > 0:  # Counterclockwise from vec1 to vec2
            return cross1 >= 0 and cross2 >= 0
        else:  # Clockwise from vec1 to vec2 (or crossing zero)
            return cross1 <= 0 or cross2 <= 0
    
    @staticmethod
    #@profile_function
    def _cast_ray_to_max_distance(start: np.ndarray, angle: float, max_distance: int, 
                                    ) -> np.ndarray:
        direction = np.array([np.cos(angle), np.sin(angle)], dtype=np.float64)
        ray_end = start + max_distance * direction
        return ray_end

    @staticmethod
    #@profile_function
    def _cast_ray_to_closest_obstacle(start: np.ndarray, angle: float, max_distance: int, 
                                    obstacles: np.ndarray) -> np.ndarray:
        """
        Cast ray and find intersection with SHORTEST distance only. 
        """
        # Calculate ray end point using fast trigonometry
        direction = np.array([np.cos(angle), np.sin(angle)], dtype=np.float64)
        ray_end = start + max_distance * direction
        
        if obstacles.size == 0:
            return ray_end
        
        # Step 2.4: Find intersections using FAST vectorized operations
        intersections = GeometricManager._vectorized_intersections(
            start, ray_end, obstacles
        )
        
        if len(intersections) == 0:
            return ray_end
        
        # Step 2.5 & 2.6: Find shortest distance (use squared distance to avoid sqrt)
        distances_sq = np.sum((intersections - start)**2, axis=1)
        closest_idx = np.argmin(distances_sq)
        
        return intersections[closest_idx]

    @staticmethod
    #@profile_function
    def _vectorized_intersections(ray_start: np.ndarray, ray_end: np.ndarray, 
                                obstacles: np.ndarray) -> np.ndarray:
        """
        Calculate all ray-obstacle intersections using FAST vectorized numpy operations.
        
        This checks intersections ONLY for rays cast to obstacles (as per requirements).
        """
        if obstacles.size == 0:
            return np.array([]).reshape(0, 2)
        
        # Extract obstacle endpoints for vectorized calculations
        p3_array = obstacles[:, 0, :]  # Start points of obstacles
        p4_array = obstacles[:, 1, :]  # End points of obstacles
        
        # FAST vectorized line intersection calculation
        x1, y1 = ray_start[0], ray_start[1]
        x2, y2 = ray_end[0], ray_end[1]
        x3, y3 = p3_array[:, 0], p3_array[:, 1]
        x4, y4 = p4_array[:, 0], p4_array[:, 1]
        
        # Calculate denominators for all intersections at once
        denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
        
        # Filter out parallel lines (denom ≈ 0)
        valid_mask = np.abs(denom) > 1e-10
        
        if not np.any(valid_mask):
            return np.array([]).reshape(0, 2)
        
        # Calculate parameters t and u for valid intersections
        denom_valid = denom[valid_mask]
        x3_valid, y3_valid = x3[valid_mask], y3[valid_mask]
        x4_valid, y4_valid = x4[valid_mask], y4[valid_mask]
        
        t = ((x1 - x3_valid) * (y3_valid - y4_valid) - (y1 - y3_valid) * (x3_valid - x4_valid)) / denom_valid
        u = -((x1 - x2) * (y1 - y3_valid) - (y1 - y2) * (x1 - x3_valid)) / denom_valid
        
        # Check if intersections are within both line segments
        intersection_mask = (t >= 0) & (t <= 1) & (u >= 0) & (u <= 1)
        
        if not np.any(intersection_mask):
            return np.array([]).reshape(0, 2)
        
        # Calculate intersection points
        t_valid = t[intersection_mask]
        x_intersect = x1 + t_valid * (x2 - x1)
        y_intersect = y1 + t_valid * (y2 - y1)
        
        return np.column_stack([x_intersect, y_intersect])

    @staticmethod
    #@profile_function
    def _sort_points_clockwise(points: np.ndarray, center: np.ndarray) -> np.ndarray:
        """Sort points clockwise using FAST vectorized numpy operations"""
        if points.shape[0] <= 1:
            return points
        
        # Vectorized angle calculation
        diff = points - center
        angles = np.arctan2(diff[:, 1], diff[:, 0])
        
        # Sort by angles
        sorted_indices = np.argsort(angles)
        
        return points[sorted_indices]

    @staticmethod
    #@profile_function
    def get_visibility_mask(player_pos: np.ndarray, obstacles: np.ndarray, 
                           grid_shape: Tuple[int, int], 
                           max_view_distance: int = 100) -> np.ndarray:
        """Generate visibility mask using fast polygon operations."""
        visibility_polygon = GeometricManager.generate_visibility_polygon(
            player_pos, obstacles, max_view_distance
        )
        
        if visibility_polygon.shape[0] < 3:
            return np.zeros(grid_shape, dtype=bool)
        
        # Convert to integer coordinates for polygon rasterization
        polygon_points = np.round(visibility_polygon).astype(int)
        
        # Swap x,y to y,x for skimage (row, col format)
        polygon_points_swapped = polygon_points[:, [1, 0]]
        
        # Create mask using skimage polygon
        mask = np.zeros(grid_shape, dtype=bool)
        rr, cc = draw.polygon(polygon_points_swapped[:, 0], polygon_points_swapped[:, 1], grid_shape)          
        mask[rr, cc] = True
        return mask

    @staticmethod
    def test_visibility_system(stress_test: bool = False, fill_polygon: bool = False,
                               step_to_gap: int = 40) -> None:
        """
        SDL visual test for the FAST visibility system.
        Shows the fast method logic in action with real-time visualization.
        """
        print("Testing SDL3 FAST visibility system...")
        print(f'step_to_gap: {step_to_gap}, stress_test: {stress_test}, fill_polygon: {fill_polygon}')
        # Initialize SDL with proper flags
        if sdl3.SDL_Init(sdl3.SDL_INIT_VIDEO) < 0:
            print(f"SDL initialization failed: {sdl3.SDL_GetError().decode()}")
            return
        
        # Window dimensions
        WINDOW_WIDTH = 800
        WINDOW_HEIGHT = 600
        
        # Create window with proper encoding
        window = sdl3.SDL_CreateWindow(
            "FAST Visibility System Test".encode(), 
            WINDOW_WIDTH, WINDOW_HEIGHT,
            sdl3.SDL_WINDOW_RESIZABLE
        )
        
        if not window:
            print(f"Window creation failed: {sdl3.SDL_GetError().decode()}")
            sdl3.SDL_Quit()
            return
        
        # Get available render drivers and select appropriate one
        render_drivers = [sdl3.SDL_GetRenderDriver(i).decode() for i in range(sdl3.SDL_GetNumRenderDrivers())]
        render_driver = next((d for d in ["opengl", "software"] if d in render_drivers), None)
        if not render_driver:
            print("No suitable render driver found.")
            sdl3.SDL_DestroyWindow(window)
            sdl3.SDL_Quit()
            return
            
        # Create renderer with specific driver
        renderer = sdl3.SDL_CreateRenderer(window, render_driver.encode())
        if not renderer:
            print(f"Renderer creation failed: {sdl3.SDL_GetError().decode()}")
            sdl3.SDL_DestroyWindow(window)
            sdl3.SDL_Quit()
            return
        
        print("SDL3 window created successfully for FAST visibility testing")
        
        # Test setup - player and obstacles (same as original but numpy format)
        player_pos = np.array([400.0, 300.0], dtype=np.float64)  # Center of window
        # default test
        obstacles = np.array([
            [[200, 150], [350, 150]],  # Top wall
            #[[450, 200], [600, 250]],  # Diagonal wall
            [[350, 150], [400, 350]],  # Diagonal wall
            [[150, 400], [150, 500]],  # Left vertical wall
            [[500, 350], [650, 350]],  # Bottom wall
            [[100, 100], [200, 200]],  # Corner obstacle
        ], dtype=np.float64)
        # stress test
        if stress_test:
            # Generate 20 obstacles near the center area for stress testing
            np.random.seed(42)
            center_x, center_y = 400, 300
            num_obstacles = 20
            obstacle_length = 60
            angles = np.random.uniform(0, 2 * np.pi, num_obstacles)
            radii = np.random.uniform(80, 200, num_obstacles)
            offsets = np.random.uniform(-obstacle_length/2, obstacle_length/2, (num_obstacles, 2))

            obstacles = []
            for i in range(num_obstacles):
                # Place obstacle center near a ring around the player
                cx = center_x + radii[i] * np.cos(angles[i])
                cy = center_y + radii[i] * np.sin(angles[i])
                # Random orientation
                theta = np.random.uniform(0, 2 * np.pi)
                dx = (obstacle_length / 2) * np.cos(theta)
                dy = (obstacle_length / 2) * np.sin(theta)
                p1 = [cx - dx + offsets[i,0], cy - dy + offsets[i,1]]
                p2 = [cx + dx + offsets[i,0], cy + dy + offsets[i,1]]
                obstacles.append([p1, p2])
            obstacles = np.array(obstacles, dtype=np.float64)
        # FPS tracking variables
        frame_count = 0
        fps_timer = time.time()
        current_fps = 0.0
        fps_update_interval = 0.5  # Update FPS display every 0.5 seconds
        profiling_interval = 5.0  # Print profiling stats every 5 seconds
        profiling_timer = time.time()
        
        # Main loop
        running = True
        event = sdl3.SDL_Event()
        mouse_x, mouse_y = ctypes.c_float(), ctypes.c_float()
        
        print("Use mouse to move player position. Press ESC to exit.")
        print("FPS will be displayed in console and window title.")
        print("Profiling stats will be printed every 5 seconds.")
        
        while running:
            frame_start_time = time.time()
            
            # Handle events
            while sdl3.SDL_PollEvent(ctypes.byref(event)):
                if event.type == sdl3.SDL_EVENT_QUIT:
                    running = False
                elif event.type == sdl3.SDL_EVENT_KEY_DOWN:
                    if event.key.key == sdl3.SDL_SCANCODE_ESCAPE:
                        running = False
                    #elif event.key.key == sdl3.SDLK_p:  # Press 'P' to print profiling stats
                    #    print("\n" + profiler.get_summary())
                    #elif event.key.key == sdl3.SDLK_r:  # Press 'R' to reset profiling stats
                    #    profiler.reset()
                    #    print("Profiling stats reset")
                elif event.type == sdl3.SDL_EVENT_MOUSE_MOTION:
                    # Update player position to mouse position
                    mouse_x, mouse_y = ctypes.c_float(), ctypes.c_float()
                    sdl3.SDL_GetMouseState(ctypes.byref(mouse_x), ctypes.byref(mouse_y))
                    player_pos[0] = float(mouse_x.value)
                    player_pos[1] = float(mouse_y.value)
            
            # Clear screen with dark blue background
            sdl3.SDL_SetRenderDrawColorFloat(renderer, 0.1, 0.1, 0.2, 1.0)
            sdl3.SDL_RenderClear(renderer)
            
            # Render FAST visibility system (this will be profiled)
            GeometricManager._render_fast_visibility_test(renderer, player_pos, obstacles, 
                                                       max_view_distance=250.0, fill_polygon=fill_polygon,
                                                       step_to_gap=step_to_gap)

            # Render FPS counter on screen
            GeometricManager._render_fps_display(renderer, current_fps, WINDOW_WIDTH, WINDOW_HEIGHT)
            
            # Present frame
            sdl3.SDL_RenderPresent(renderer)
            
            # Update FPS counter
            frame_count += 1
            current_time = time.time()
            elapsed_time = current_time - fps_timer
            
            if elapsed_time >= fps_update_interval:
                current_fps = frame_count / elapsed_time
                
                # Update window title with FPS
                fps_title = f"FAST Visibility - FPS: {current_fps:.1f} ".encode()
                sdl3.SDL_SetWindowTitle(window, fps_title)
                
                # Reset counters
                frame_count = 0
                fps_timer = current_time
            
            # Print profiling stats periodically
            if current_time - profiling_timer >= profiling_interval:
                print(f"\n=== LIVE STATS - FPS: {current_fps:.1f} ===")
                print(profiler.get_summary())
                profiling_timer = current_time
        
        # Final profiling summary
        print("\n=== FINAL PROFILING SUMMARY ===")
        print(profiler.get_summary())
        
        # Cleanup
        sdl3.SDL_DestroyRenderer(renderer)
        sdl3.SDL_DestroyWindow(window)
        sdl3.SDL_Quit()
        print("FAST Visibility test completed")

    @staticmethod
    #@profile_function
    def _render_fast_visibility_test(renderer, player_pos: np.ndarray, obstacles: np.ndarray, 
                                   max_view_distance: float = 200.0, fill_polygon: bool = False,
                                   step_to_gap: int = 1) -> None:
        """
        Render FAST visibility polygon visualization showing the optimized ray casting method.
        Shows rays cast ONLY to obstacle endpoints + additional rays.
        """
        # Generate visibility polygon using FAST method
        visibility_polygon = GeometricManager.generate_visibility_polygon(
            player_pos, obstacles, max_view_distance, step_to_gap=step_to_gap        )
          # Render obstacles (red lines)
        sdl3.SDL_SetRenderDrawColorFloat(renderer, ctypes.c_float(1.0), ctypes.c_float(0.0), ctypes.c_float(0.0), ctypes.c_float(1.0))  # Red
        for obstacle in obstacles:
            sdl3.SDL_RenderLine(renderer, 
                              ctypes.c_float(obstacle[0, 0]), ctypes.c_float(obstacle[0, 1]),
                              ctypes.c_float(obstacle[1, 0]), ctypes.c_float(obstacle[1, 1]))
        
        # Render obstacle endpoints (white dots - these are the ray targets!)
        sdl3.SDL_SetRenderDrawColorFloat(renderer, 1.0, 1.0, 1.0, 1.0)  # White
        for obstacle in obstacles:
            for endpoint in obstacle:
                # Draw small circles for endpoints
                GeometricManager._draw_circle_outline(renderer, endpoint, 3.0, segments=12)
        # render lines to all points
        sdl3.SDL_SetRenderDrawColorFloat(renderer, 0.0, 0.0, 1.0, 1.0)  # Blue
        for i in range(len(visibility_polygon)):
                start_point = visibility_polygon[i]
                
                sdl3.SDL_RenderLine(renderer,
                                  ctypes.c_float(start_point[0]), ctypes.c_float(start_point[1]),
                                  ctypes.c_float(player_pos[0]), ctypes.c_float(player_pos[1]))
        
        # Render visibility polygon (green lines)
        if len(visibility_polygon) > 2:
            sdl3.SDL_SetRenderDrawColorFloat(renderer, 0.0, 1.0, 0.0, 0.8)  # Green
            
            # Draw polygon edges
            for i in range(len(visibility_polygon)):
                start_point = visibility_polygon[i]
                end_point = visibility_polygon[(i + 1) % len(visibility_polygon)]
                sdl3.SDL_RenderLine(renderer,
                                  ctypes.c_float(start_point[0]), ctypes.c_float(start_point[1]),
                                  ctypes.c_float(end_point[0]), ctypes.c_float(end_point[1]))
                sdl3.SDL_RenderLine(renderer,
                                  ctypes.c_float(start_point[0]-5), ctypes.c_float(start_point[1]-5),
                                  ctypes.c_float(start_point[0]+5), ctypes.c_float(start_point[1]+5))
                sdl3.SDL_RenderLine(renderer,
                                ctypes.c_float(start_point[0]-5), ctypes.c_float(start_point[1]+5),
                                ctypes.c_float(start_point[0]+5), ctypes.c_float(start_point[1]-5))

            sdl3.SDL_SetRenderDrawColorFloat(renderer, 0.7, 0.6, 1.0, 1)  # e
            angle_gaps = GeometricManager.angle_gaps           
            ray_angles = GeometricManager.ray_angles 
            additional_angles = np.linspace(0, 2 * np.pi, 40, endpoint=False)
            
            sdl3.SDL_SetRenderDrawColorFloat(renderer, 0.7, 0.8, 0, 1)    
            for ray in ray_angles:
                    direction = np.array([np.cos(ray), np.sin(ray)], dtype=np.float64)
                    ray_end = player_pos + max_view_distance * direction
                    sdl3.SDL_RenderLine(renderer,
                                    ctypes.c_float(player_pos[0]), ctypes.c_float(player_pos[1]),
                                    ctypes.c_float(ray_end[0]), ctypes.c_float(ray_end[1]))
        # Render player position (white cross)
        sdl3.SDL_SetRenderDrawColorFloat(renderer, 1.0, 1.0, 1.0, 1.0)  # White
        player_size = 8
        sdl3.SDL_RenderLine(renderer,
                          ctypes.c_float(player_pos[0] - player_size), ctypes.c_float(player_pos[1]),
                          ctypes.c_float(player_pos[0] + player_size), ctypes.c_float(player_pos[1]))
        sdl3.SDL_RenderLine(renderer,
                          ctypes.c_float(player_pos[0]), ctypes.c_float(player_pos[1] - player_size),
                          ctypes.c_float(player_pos[0]), ctypes.c_float(player_pos[1] + player_size))
        

        # Render max view distance circle (faint gray)
        sdl3.SDL_SetRenderDrawColorFloat(renderer, 0.3, 0.3, 0.3, 0.5)  # Faint gray
        GeometricManager._draw_circle_outline(renderer, player_pos, max_view_distance)
        if fill_polygon:
            # Fill the visibility polygon using SDL3's geometry API (if available)
            # Fallback: draw many triangles (triangle fan) from player_pos to polygon edges
            if len(visibility_polygon) >= 3:
                sdl3.SDL_SetRenderDrawColorFloat(renderer, 0.0, 1.0, 0.0, 0.2)  # Semi-transparent green
                center = player_pos
                for i in range(len(visibility_polygon)):
                    p1 = visibility_polygon[i]
                    p2 = visibility_polygon[(i + 1) % len(visibility_polygon)]
                    # Draw triangle: center -> p1 -> p2 by drawing many lines between edges
                    steps = 10
                    for alpha in np.linspace(0, 1, steps):
                        x1 = center[0] + alpha * (p1[0] - center[0])
                        y1 = center[1] + alpha * (p1[1] - center[1])
                        x2 = center[0] + alpha * (p2[0] - center[0])
                        y2 = center[1] + alpha * (p2[1] - center[1])
                        sdl3.SDL_RenderLine(renderer,
                            ctypes.c_float(x1), ctypes.c_float(y1),
                            ctypes.c_float(x2), ctypes.c_float(y2))
    @staticmethod
    #@profile_function
    def _render_fps_display(renderer, fps: float, window_width: int, window_height: int):
        """
        Render FPS display as simple geometric shapes (since we don't have text rendering).
        """
        # Draw FPS indicator in top-left corner
        sdl3.SDL_SetRenderDrawColorFloat(renderer, 1.0, 1.0, 0.0, 1.0)  # Yellow
        
        # Simple FPS visualization - more bars = higher FPS
        bar_count = min(int(fps / 10), 10)  # Up to 10 bars for 100+ FPS
        
        for i in range(bar_count):
            x = 10 + i * 8
            y = 10
            width = 6
            height = 20
            
            # Draw filled rectangle using lines
            for line_y in range(height):
                sdl3.SDL_RenderLine(renderer, ctypes.c_float(x), ctypes.c_float(y + line_y),
                                  ctypes.c_float(x + width), ctypes.c_float(y + line_y))
        
        # Draw FPS range indicator (gray outlines for unfilled bars)
        sdl3.SDL_SetRenderDrawColorFloat(renderer, 0.5, 0.5, 0.5, 1.0)  # Gray
        
        for i in range(10):
            x = 10 + i * 8
            y = 10
            width = 6
            height = 20
            
            if i >= bar_count:  # Only draw outline for unfilled bars
                # Draw rectangle outline
                sdl3.SDL_RenderLine(renderer, ctypes.c_float(x), ctypes.c_float(y), 
                                  ctypes.c_float(x + width), ctypes.c_float(y))
                sdl3.SDL_RenderLine(renderer, ctypes.c_float(x), ctypes.c_float(y + height), 
                                  ctypes.c_float(x + width), ctypes.c_float(y + height))
                sdl3.SDL_RenderLine(renderer, ctypes.c_float(x), ctypes.c_float(y), 
                                  ctypes.c_float(x), ctypes.c_float(y + height))
                sdl3.SDL_RenderLine(renderer, ctypes.c_float(x + width), ctypes.c_float(y), 
                                  ctypes.c_float(x + width), ctypes.c_float(y + height))

    @staticmethod
    #@profile_function
    def _draw_circle_outline(renderer, center: np.ndarray, radius: float, segments: int = 64):
        """
        Draw circle outline using line segments.
        """
        angle_step = 2 * np.pi / segments
        
        for i in range(segments):
            angle1 = i * angle_step
            angle2 = (i + 1) * angle_step
            
            x1 = center[0] + radius * np.cos(angle1)
            y1 = center[1] + radius * np.sin(angle1)
            x2 = center[0] + radius * np.cos(angle2)
            y2 = center[1] + radius * np.sin(angle2)
            
            sdl3.SDL_RenderLine(renderer, ctypes.c_float(x1), ctypes.c_float(y1), 
                              ctypes.c_float(x2), ctypes.c_float(y2))

def test_fast_visibility():
    """Test the FAST visibility system"""
    print("=== FAST VISIBILITY SYSTEM TEST ===")
    print("Logic: Cast rays ONLY to obstacle endpoints + 40 additional rays")
    print("Focus: Maximum performance, readable code, best practices")
    
    # Test basic functionality
    player = np.array([10.0, 10.0], dtype=np.float64)
    
    # Create obstacles using numpy arrays
    obstacles = np.array([
        [[5, 5], [15, 5]],    # Horizontal wall
        [[20, 8], [20, 12]],  # Vertical wall
        [[25, 15], [30, 20]]  # Diagonal wall
    ], dtype=np.float64)
    
    print(f"\nPlayer at: ({player[0]}, {player[1]})")
    print(f"Obstacles: {len(obstacles)} line segments")
    print(f"Total obstacle endpoints: {len(obstacles) * 2}")
    print(f"Rays to cast: {len(obstacles) * 2 * 3} (to endpoints + perturbations) + 40 (additional) = {len(obstacles) * 6 + 40}")
    
    # Generate visibility polygon (profiled)
    visibility_polygon = GeometricManager.generate_visibility_polygon(
        player, obstacles, max_view_distance=100, step_to_gap=40
    )
    
    print(f"\nVisibility polygon has {len(visibility_polygon)} vertices:")
    for i, point in enumerate(visibility_polygon[:5]):  # Show first 5 points
        print(f"  Vertex {i}: ({point[0]:.2f}, {point[1]:.2f})")
    if len(visibility_polygon) > 5:
        print(f"  ... and {len(visibility_polygon) - 5} more vertices")
    
    # Generate visibility mask (profiled)
    mask = GeometricManager.get_visibility_mask(
        player, obstacles, (50, 50), max_view_distance=50
    )
    print(f"\nVisible area coverage: {np.sum(mask)} / {mask.size} cells ({100*np.sum(mask)/mask.size:.1f}%)")
    
    # Performance test with larger obstacle set
    print("\n=== PERFORMANCE TEST ===")
    large_obstacles = np.random.rand(20, 2, 2) * 100  # 20 random obstacles
    
    # Time multiple runs
    times = []
    for i in range(10):
        start_time = time.perf_counter()
        visibility_polygon = GeometricManager.generate_visibility_polygon(
            player, large_obstacles, max_view_distance=100, step_to_gap=40
        )
        end_time = time.perf_counter()
        times.append((end_time - start_time) * 1000)  # Convert to ms
    
    avg_time = np.mean(times)
    print(f"Average time for 20 obstacles: {avg_time:.2f}ms")
    print(f"Total rays cast: {20 * 6 + 40} = {20 * 6 + 40}")
    print(f"Time per ray: {avg_time / (20 * 6 + 40):.4f}ms")
    
    # Print profiling stats from all tests
    print("\n=== PROFILING SUMMARY ===")
    print(profiler.get_summary())
    GeometricManager.test_visibility_system(stress_test=False, fill_polygon=True, step_to_gap=30)

if __name__ == "__main__":
    test_fast_visibility()
