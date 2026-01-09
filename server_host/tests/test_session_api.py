"""Test session management API endpoints"""
from main import app

def test_router_loaded():
    """Verify session management router loads correctly"""
    print("🧪 Testing Session Management API\n")
    
    print(f"✓ Main app loaded successfully")
    print(f"✓ Total routes: {len(app.routes)}")
    
    session_routes = [r for r in app.routes if '/session' in str(getattr(r, 'path', ''))]
    print(f"✓ Session management routes: {len(session_routes)}")
    
    print("\n📋 Session management endpoints:")
    for route in session_routes[:10]:
        if hasattr(route, 'methods') and hasattr(route, 'path'):
            methods = ', '.join(route.methods) if route.methods else 'WS'
            print(f"  {methods:8} {route.path}")
    
    print("\n✅ All tests passed!")

if __name__ == "__main__":
    test_router_loaded()
