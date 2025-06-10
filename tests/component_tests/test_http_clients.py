#!/usr/bin/env python3
"""
Test different HTTP client libraries to compare timing
"""
import time
import asyncio

def test_requests():
    """Test with requests library"""
    import requests
    
    times = []
    for i in range(3):
        start_time = time.perf_counter()
        response = requests.post(
            "http://127.0.0.1:8000/users/token",
            data={"username": "test", "password": "test"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=30
        )
        elapsed = time.perf_counter() - start_time
        times.append(elapsed)
        print(f"Requests {i+1}: {elapsed:.4f}s (Status: {response.status_code})")
    
    avg = sum(times) / len(times)
    print(f"Requests average: {avg:.4f}s")
    return avg

async def test_aiohttp():
    """Test with aiohttp library"""
    try:
        import aiohttp
        
        times = []
        async with aiohttp.ClientSession() as session:
            for i in range(3):
                start_time = time.perf_counter()
                async with session.post(
                    "http://127.0.0.1:8000/users/token",
                    data={"username": "test", "password": "test"},
                    headers={"Content-Type": "application/x-www-form-urlencoded"}
                ) as response:
                    await response.text()
                    elapsed = time.perf_counter() - start_time
                    times.append(elapsed)
                    print(f"aiohttp {i+1}: {elapsed:.4f}s (Status: {response.status})")
        
        avg = sum(times) / len(times)
        print(f"aiohttp average: {avg:.4f}s")
        return avg
    except ImportError:
        print("aiohttp not available")
        return None

def test_urllib():
    """Test with urllib (built-in)"""
    import urllib.request
    import urllib.parse
    
    times = []
    for i in range(3):
        start_time = time.perf_counter()
        
        data = urllib.parse.urlencode({"username": "test", "password": "test"}).encode()
        req = urllib.request.Request(
            "http://127.0.0.1:8000/users/token",
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                response.read()
                elapsed = time.perf_counter() - start_time
                times.append(elapsed)
                print(f"urllib {i+1}: {elapsed:.4f}s (Status: {response.status})")
        except Exception as e:
            elapsed = time.perf_counter() - start_time
            print(f"urllib {i+1}: {elapsed:.4f}s (Error: {e})")
            times.append(elapsed)
    
    avg = sum(times) / len(times)
    print(f"urllib average: {avg:.4f}s")
    return avg

async def main():
    print("=== HTTP Client Library Comparison ===\n")
    
    print("Testing requests library:")
    requests_time = test_requests()
    
    print("\nTesting urllib library:")
    urllib_time = test_urllib()
    
    print("\nTesting aiohttp library:")
    aiohttp_time = await test_aiohttp()
    
    print("\n=== Summary ===")
    print(f"requests: {requests_time:.4f}s")
    print(f"urllib: {urllib_time:.4f}s")
    if aiohttp_time:
        print(f"aiohttp: {aiohttp_time:.4f}s")

if __name__ == "__main__":
    asyncio.run(main())
