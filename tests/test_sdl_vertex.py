#!/usr/bin/env python3
"""
Test script to verify SDL_Vertex and SDL_FColor functionality
"""

import sdl3
import ctypes
import numpy as np

def test_sdl_structures():
    """Test SDL_Vertex and SDL_FColor creation and assignment"""
    print("Testing SDL structures...")
    
    # Test SDL_FColor
    print("\n1. Testing SDL_FColor creation:")
    color = sdl3.SDL_FColor()
    print(f"Created SDL_FColor: {color}")
    
    try:
        color.r = ctypes.c_float(1.0)
        color.g = ctypes.c_float(0.5)
        color.b = ctypes.c_float(0.0)
        color.a = ctypes.c_float(0.8)
        print(f"✅ SDL_FColor assignment successful: r={color.r}, g={color.g}, b={color.b}, a={color.a}")
    except Exception as e:
        print(f"❌ SDL_FColor assignment failed: {e}")
        
        # Try direct assignment
        try:
            color.r = 1.0
            color.g = 0.5
            color.b = 0.0
            color.a = 0.8
            print(f"✅ Direct SDL_FColor assignment successful: r={color.r}, g={color.g}, b={color.b}, a={color.a}")
        except Exception as e2:
            print(f"❌ Direct SDL_FColor assignment also failed: {e2}")
    
    # Test SDL_Vertex
    print("\n2. Testing SDL_Vertex creation:")
    vertex = sdl3.SDL_Vertex()
    print(f"Created SDL_Vertex: {vertex}")
    
    try:
        vertex.position.x = ctypes.c_float(100.0)
        vertex.position.y = ctypes.c_float(200.0)
        vertex.color = color
        vertex.tex_coord.x = ctypes.c_float(0.0)
        vertex.tex_coord.y = ctypes.c_float(1.0)
        print(f"✅ SDL_Vertex assignment successful")
        print(f"   Position: ({vertex.position.x}, {vertex.position.y})")
        print(f"   Color: r={vertex.color.r}, g={vertex.color.g}, b={vertex.color.b}, a={vertex.color.a}")
        print(f"   TexCoord: ({vertex.tex_coord.x}, {vertex.tex_coord.y})")
    except Exception as e:
        print(f"❌ SDL_Vertex assignment failed: {e}")
        
        # Try direct assignment
        try:
            vertex.position.x = 100.0
            vertex.position.y = 200.0
            vertex.color = color
            vertex.tex_coord.x = 0.0
            vertex.tex_coord.y = 1.0
            print(f"✅ Direct SDL_Vertex assignment successful")
        except Exception as e2:
            print(f"❌ Direct SDL_Vertex assignment also failed: {e2}")
    
    # Test vertex array creation
    print("\n3. Testing SDL_Vertex array creation:")
    try:
        vertices = (sdl3.SDL_Vertex * 3)()
        print(f"✅ SDL_Vertex array created: {len(vertices)} vertices")
        
        # Test assignment to array elements
        vertices[0].position.x = ctypes.c_float(0.0)
        vertices[0].position.y = ctypes.c_float(0.0)
        vertices[0].color = color
        print(f"✅ Array element assignment successful")
        
    except Exception as e:
        print(f"❌ SDL_Vertex array creation failed: {e}")

def test_numpy_conversion():
    """Test numpy array conversion to SDL_Vertex"""
    print("\n4. Testing numpy to SDL_Vertex conversion:")
    
    # Test data
    polygon_points = np.array([[100.0, 100.0], [200.0, 100.0], [150.0, 200.0]], dtype=np.float64)
    center_point = np.array([150.0, 133.0], dtype=np.float64)
    
    print(f"Polygon points: {polygon_points}")
    print(f"Center point: {center_point}")
    
    try:
        # Create color
        color = sdl3.SDL_FColor()
        color.r = 0.0
        color.g = 1.0  
        color.b = 0.0
        color.a = 0.5
        
        # Create vertices (triangle fan)
        num_triangles = len(polygon_points)
        vertices = (sdl3.SDL_Vertex * (num_triangles * 3))()
        
        for i in range(num_triangles):
            base_idx = i * 3
            next_i = (i + 1) % num_triangles
            
            # Center vertex
            vertices[base_idx].position.x = float(center_point[0])
            vertices[base_idx].position.y = float(center_point[1])
            vertices[base_idx].color = color
            
            # Current vertex
            vertices[base_idx + 1].position.x = float(polygon_points[i, 0])
            vertices[base_idx + 1].position.y = float(polygon_points[i, 1])
            vertices[base_idx + 1].color = color
            
            # Next vertex  
            vertices[base_idx + 2].position.x = float(polygon_points[next_i, 0])
            vertices[base_idx + 2].position.y = float(polygon_points[next_i, 1])
            vertices[base_idx + 2].color = color
            
        print(f"✅ Numpy to SDL_Vertex conversion successful: {len(vertices)} vertices created")
        
        # Print first triangle vertices
        print("First triangle vertices:")
        for j in range(3):
            v = vertices[j]
            print(f"  Vertex {j}: pos=({v.position.x}, {v.position.y}), color=({v.color.r}, {v.color.g}, {v.color.b}, {v.color.a})")
        
    except Exception as e:
        print(f"❌ Numpy to SDL_Vertex conversion failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_sdl_structures()
    test_numpy_conversion()
    print("\nTest completed!")
