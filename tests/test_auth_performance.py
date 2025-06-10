#!/usr/bin/env python3
"""
Detailed authentication timing analysis
"""
import sys
import os
import time
import logging

# Add the server_host path for imports
sys.path.append(os.path.join(os.path.dirname(__file__), 'server_host'))

from sqlalchemy.orm import Session
from server_host.database.database import get_db
from server_host.database import crud
from passlib.context import CryptContext

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')
logger = logging.getLogger(__name__)

def time_function(func, *args, **kwargs):
    """Time a function execution"""
    start_time = time.perf_counter()
    result = func(*args, **kwargs)
    end_time = time.perf_counter()
    return result, end_time - start_time

def test_individual_components():
    """Test individual components of the authentication process"""
    logger.info("Testing individual authentication components...")
    
    # Test password hashing speed
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=4)
    test_password = "test_password_123"
    
    # Test hashing speed
    logger.info("Testing password hashing...")
    hashed_password, hash_time = time_function(pwd_context.hash, test_password)
    logger.info(f"Password hashing took: {hash_time:.4f} seconds")
    
    # Test verification speed
    logger.info("Testing password verification...")
    _, verify_time = time_function(pwd_context.verify, test_password, hashed_password)
    logger.info(f"Password verification took: {verify_time:.4f} seconds")
    
    # Test database connection
    logger.info("Testing database connection...")
    db_gen = get_db()
    db, db_time = time_function(next, db_gen)
    logger.info(f"Database connection took: {db_time:.4f} seconds")
    
    # Test user lookup
    logger.info("Testing user lookup...")
    username = "test"
    user, lookup_time = time_function(crud.get_user_by_username, db, username)
    logger.info(f"User lookup took: {lookup_time:.4f} seconds")
    
    if user:
        # Test full authentication
        logger.info("Testing full authentication...")
        auth_result, auth_time = time_function(crud.authenticate_user, db, username, "test")
        logger.info(f"Full authentication took: {auth_time:.4f} seconds")
        logger.info(f"Authentication result: {bool(auth_result)}")
    else:
        logger.info("User 'test' not found in database")
    
    # Close database
    db.close()
    
    # Summary
    total_expected = hash_time + verify_time + db_time + lookup_time
    logger.info(f"\nSummary:")
    logger.info(f"Hash: {hash_time:.4f}s")
    logger.info(f"Verify: {verify_time:.4f}s") 
    logger.info(f"DB Connect: {db_time:.4f}s")
    logger.info(f"User Lookup: {lookup_time:.4f}s")
    logger.info(f"Expected total: {total_expected:.4f}s")

def test_bcrypt_rounds():
    """Test different bcrypt rounds to see the impact"""
    logger.info("Testing different bcrypt rounds...")
    test_password = "test_password_123"
    
    for rounds in [4, 8, 10, 12]:
        logger.info(f"\nTesting bcrypt rounds: {rounds}")
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=rounds)
        
        # Test hashing
        hashed_password, hash_time = time_function(pwd_context.hash, test_password)
        logger.info(f"  Hash (rounds={rounds}): {hash_time:.4f} seconds")
        
        # Test verification
        _, verify_time = time_function(pwd_context.verify, test_password, hashed_password)
        logger.info(f"  Verify (rounds={rounds}): {verify_time:.4f} seconds")
        
        total_time = hash_time + verify_time
        logger.info(f"  Total (rounds={rounds}): {total_time:.4f} seconds")

def test_database_performance():
    """Test database operations performance"""
    logger.info("Testing database performance...")
    
    # Multiple database connections
    logger.info("Testing multiple database connections...")
    times = []
    for i in range(10):
        db_gen = get_db()
        db, db_time = time_function(next, db_gen)
        times.append(db_time)
        db.close()
    
    avg_time = sum(times) / len(times)
    logger.info(f"Average DB connection time: {avg_time:.4f} seconds (n={len(times)})")
    logger.info(f"Min: {min(times):.4f}s, Max: {max(times):.4f}s")

if __name__ == "__main__":
    print("=== Authentication Performance Analysis ===\n")
    
    test_individual_components()
    print("\n" + "="*50 + "\n")
    
    test_bcrypt_rounds()
    print("\n" + "="*50 + "\n")
    
    test_database_performance()
