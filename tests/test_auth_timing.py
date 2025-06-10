#!/usr/bin/env python3
"""
Test authentication timing
"""
import requests
import time
import json

def test_auth_timing():
    """Test the authentication timing"""
    server_url = "http://127.0.0.1:8000"
    
    # Test user credentials
    username = "test"
    password = "test"
    
    print("Testing authentication timing...")
    
    # Measure registration time
    start_time = time.time()
    register_response = requests.post(
        f"{server_url}/users/register",
        data={
            "username": username,
            "password": password
        },
        timeout=30
    )
    register_time = time.time() - start_time
    print(f"Registration request: {register_time:.2f} seconds (Status: {register_response.status_code})")
    
    # Measure login/token time
    start_time = time.time()
    token_response = requests.post(
        f"{server_url}/users/token",
        data={
            "username": username,
            "password": password
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=30
    )
    token_time = time.time() - start_time
    print(f"Token request: {token_time:.2f} seconds (Status: {token_response.status_code})")
    
    if token_response.status_code == 200:
        token_data = token_response.json()
        print(f"Token received: {token_data.get('access_token', '')[:20]}...")
    else:
        print(f"Token error: {token_response.text}")
    
    # Test multiple consecutive logins
    print("\nTesting consecutive logins:")
    times = []
    for i in range(5):
        start_time = time.time()
        token_response = requests.post(
            f"{server_url}/users/token",
            data={
                "username": username,
                "password": password
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=30
        )
        elapsed = time.time() - start_time
        times.append(elapsed)
        print(f"Login {i+1}: {elapsed:.2f} seconds (Status: {token_response.status_code})")
    
    avg_time = sum(times) / len(times)
    print(f"\nAverage login time: {avg_time:.2f} seconds")
    print(f"Min: {min(times):.2f}s, Max: {max(times):.2f}s")

if __name__ == "__main__":
    test_auth_timing()
