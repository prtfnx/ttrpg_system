from __future__ import annotations
import numpy as np
from skimage import draw
from typing import List, Tuple, Set, Optional
from dataclasses import dataclass

@dataclass
class Point:
    x: float
    y: float
    
    def __hash__(self):
        return hash((self.x, self.y))
    
    def to_array(self) -> np.ndarray:
        """Convert to numpy array for vectorized operations"""
        return np.array([self.x, self.y])

@dataclass  
class LineSegment:
    start: Point
    end: Point
    
    def to_arrays(self) -> Tuple[np.ndarray, np.ndarray]:
        """Convert endpoints to numpy arrays"""
        return self.start.to_array(), self.end.to_array()

class GeometricManager:
    def __init__(self):
        pass

    @staticmethod
    def line(r0: int, c0: int, r1: int, c1: int) -> Tuple[np.ndarray, np.ndarray]:
        """Using skimage.draw for line coordinates"""
        return draw.line(r0, c0, r1, c1)

    @staticmethod
    def cast_ray(start: Point, angle: float, max_distance: float, 
                 obstacles: List[LineSegment]) -> Optional[Point]:
        """
        Cast a ray using vectorized numpy operations for maximum speed.
        """
        # Ray direction vector
        direction = np.array([np.cos(angle), np.sin(angle)])
        ray_end = start.to_array() + max_distance * direction
        
        if not obstacles:
            return Point(ray_end[0], ray_end[1])
        
        # Vectorize intersection calculations
        intersections = GeometricManager._vectorized_intersections(
            start.to_array(), ray_end, obstacles
        )
        
        if len(intersections) == 0:
            return Point(ray_end[0], ray_end[1])
        
        # Find closest intersection using vectorized distance calculation
        start_arr = start.to_array()
        distances = np.linalg.norm(intersections - start_arr, axis=1)
        closest_idx = np.argmin(distances)
        closest_point = intersections[closest_idx]
        
        return Point(closest_point[0], closest_point[1])

    @staticmethod
    def _vectorized_intersections(ray_start: np.ndarray, ray_end: np.ndarray, 
                                obstacles: List[LineSegment]) -> np.ndarray:
        """
        Calculate all ray-obstacle intersections using vectorized numpy operations.
        This is much faster than individual intersection calculations.
        """
        if not obstacles:
            return np.array([]).reshape(0, 2)
        
        # Convert all obstacles to numpy arrays
        p1_array = np.array([obs.start.to_array() for obs in obstacles])  # Ray start points
        p2_array = np.array([ray_end for _ in obstacles])                 # Ray end points  
        p3_array = np.array([obs.start.to_array() for obs in obstacles])  # Obstacle start points
        p4_array = np.array([obs.end.to_array() for obs in obstacles])    # Obstacle end points
        
        # Vectorized line intersection calculation
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
    def _distance(p1: Point, p2: Point) -> float:
        """Fast distance calculation using numpy"""
        diff = p1.to_array() - p2.to_array()
        return np.linalg.norm(diff)

    @staticmethod
    def generate_visibility_polygon(player_pos: Point, obstacles: List[LineSegment], 
                                  max_view_distance: float = 100.0,
                                  angle_resolution: int = 360) -> List[Point]:
        """
        Generate visibility polygon using optimized numpy raycasting.
        """
        # Collect critical angles (toward obstacle endpoints)
        critical_angles = set()
        
        player_arr = player_pos.to_array()
        
        # Vectorized angle calculation for all obstacle endpoints
        for obstacle in obstacles:
            for point in [obstacle.start, obstacle.end]:
                point_arr = point.to_array()
                angle = np.arctan2(point_arr[1] - player_arr[1], point_arr[0] - player_arr[0])
                critical_angles.update([angle - 0.001, angle, angle + 0.001])
        
        # Add regular angular intervals
        regular_angles = np.linspace(0, 2 * np.pi, angle_resolution, endpoint=False)
        critical_angles.update(regular_angles)
        
        # Cast rays for all angles
        visibility_points = []
        for angle in sorted(critical_angles):
            intersection = GeometricManager.cast_ray(
                player_pos, angle, max_view_distance, obstacles
            )
            if intersection:
                visibility_points.append(intersection)
        
        return GeometricManager._sort_points_clockwise(visibility_points, player_pos)

    @staticmethod
    def _sort_points_clockwise(points: List[Point], center: Point) -> List[Point]:
        """Sort points clockwise using vectorized numpy operations"""
        if len(points) <= 1:
            return points
        
        center_arr = center.to_array()
        points_arr = np.array([p.to_array() for p in points])
        
        # Vectorized angle calculation
        diff = points_arr - center_arr
        angles = np.arctan2(diff[:, 1], diff[:, 0])
        
        # Sort by angles
        sorted_indices = np.argsort(angles)
        
        return [points[i] for i in sorted_indices]

    @staticmethod
    def get_visibility_mask(player_pos: Point, obstacles: List[LineSegment], 
                           grid_shape: Tuple[int, int], 
                           max_view_distance: float = 100.0) -> np.ndarray:
        """
        Generate visibility mask using numpy polygon operations.
        """
        visibility_polygon = GeometricManager.generate_visibility_polygon(
            player_pos, obstacles, max_view_distance
        )
        
        if len(visibility_polygon) < 3:
            return np.zeros(grid_shape, dtype=bool)
        
        # Convert to numpy array for efficient polygon operations
        polygon_points = np.array([[p.y, p.x] for p in visibility_polygon])
        
        # Create mask using skimage polygon
        mask = np.zeros(grid_shape, dtype=bool)
        rr, cc = draw.polygon(polygon_points[:, 0], polygon_points[:, 1], grid_shape)
        mask[rr, cc] = True
        
        return mask

def main():
    # Example usage
    player = Point(10, 10)
    
    # Create obstacles
    obstacles = [
        LineSegment(Point(5, 5), Point(15, 5)),    # Horizontal wall
        LineSegment(Point(20, 8), Point(20, 12)),  # Vertical wall
        LineSegment(Point(25, 15), Point(30, 20))  # Diagonal wall
    ]
    
    # Generate visibility polygon
    visibility_polygon = GeometricManager.generate_visibility_polygon(
        player, obstacles, max_view_distance=50.0
    )
    
    print(f"Player at: ({player.x}, {player.y})")
    print(f"Visibility polygon has {len(visibility_polygon)} vertices:")
    for i, point in enumerate(visibility_polygon):
        print(f"  Vertex {i}: ({point.x:.2f}, {point.y:.2f})")
    
    # Generate visibility mask
    mask = GeometricManager.get_visibility_mask(
        player, obstacles, (50, 50), max_view_distance=50.0
    )
    print(f"Visible area coverage: {np.sum(mask)} / {mask.size} cells")

if __name__ == "__main__":
    main()
