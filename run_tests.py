#!/usr/bin/env python3
"""
Test Runner for TTRPG System
Runs all test scripts in the /tests/ directory with proper error handling and reporting.
"""
import os
import sys
import subprocess
import time
import argparse
from pathlib import Path
from typing import List, Tuple, Dict

# Add the project root to Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

class TestRunner:
    def __init__(self, verbose: bool = False, fail_fast: bool = False):
        self.verbose = verbose
        self.fail_fast = fail_fast
        self.tests_dir = project_root / "tests"
        self.results: Dict[str, Tuple[bool, str, float]] = {}
        
    def discover_tests(self) -> List[Path]:
        """Discover all test files in the tests directory"""
        test_files = []
        
        if not self.tests_dir.exists():
            print(f"❌ Tests directory not found: {self.tests_dir}")
            return test_files
        
        # Find all test_*.py files
        for test_file in self.tests_dir.glob("test_*.py"):
            if test_file.is_file() and test_file.stat().st_size > 0:
                test_files.append(test_file)
        
        # Also check component_tests subdirectory
        component_tests_dir = self.tests_dir / "component_tests"
        if component_tests_dir.exists():
            for test_file in component_tests_dir.glob("test_*.py"):
                if test_file.is_file() and test_file.stat().st_size > 0:
                    test_files.append(test_file)
        
        return sorted(test_files)
    
    def run_single_test(self, test_file: Path) -> Tuple[bool, str, float]:
        """Run a single test file and return (success, output, duration)"""
        test_name = test_file.relative_to(project_root)
        
        if self.verbose:
            print(f"🔄 Running {test_name}...")
        
        start_time = time.time()
        
        try:
            # Run the test with proper environment
            env = os.environ.copy()
            env['PYTHONPATH'] = str(project_root)
            
            result = subprocess.run(
                [sys.executable, str(test_file)],
                cwd=project_root,
                capture_output=True,
                text=True,
                timeout=300,  # 5 minute timeout per test
                env=env
            )
            
            duration = time.time() - start_time
            
            if result.returncode == 0:
                if self.verbose:
                    print(f"✅ {test_name} passed ({duration:.2f}s)")
                return True, result.stdout, duration
            else:
                error_output = f"STDERR:\n{result.stderr}\nSTDOUT:\n{result.stdout}"
                if self.verbose:
                    print(f"❌ {test_name} failed ({duration:.2f}s)")
                    print(f"   Error: {result.stderr.strip()}")
                return False, error_output, duration
                
        except subprocess.TimeoutExpired:
            duration = time.time() - start_time
            error_msg = f"Test timed out after {duration:.1f} seconds"
            if self.verbose:
                print(f"⏰ {test_name} timed out")
            return False, error_msg, duration
            
        except Exception as e:
            duration = time.time() - start_time
            error_msg = f"Exception running test: {str(e)}"
            if self.verbose:
                print(f"💥 {test_name} crashed: {str(e)}")
            return False, error_msg, duration
    
    def run_all_tests(self) -> bool:
        """Run all discovered tests and return overall success"""
        test_files = self.discover_tests()
        
        if not test_files:
            print("❌ No test files found!")
            return False
        
        print(f"🚀 Running {len(test_files)} test files...")
        print("=" * 60)
        
        start_time = time.time()
        passed = 0
        failed = 0
        
        for test_file in test_files:
            test_name = str(test_file.relative_to(project_root))
            success, output, duration = self.run_single_test(test_file)
            
            self.results[test_name] = (success, output, duration)
            
            if success:
                passed += 1
                status = "✅ PASS"
            else:
                failed += 1
                status = "❌ FAIL"
            
            print(f"{status:8} {test_name:50} ({duration:6.2f}s)")
            
            if not success and self.fail_fast:
                print(f"\n💥 Stopping due to failure in {test_name}")
                break
        
        total_time = time.time() - start_time
        
        # Print summary
        print("=" * 60)
        print(f"📊 Test Results Summary:")
        print(f"   Total:  {len(test_files)} tests")
        print(f"   Passed: {passed} tests")
        print(f"   Failed: {failed} tests")
        print(f"   Time:   {total_time:.2f} seconds")
        
        if failed > 0:
            print(f"\n❌ {failed} test(s) failed:")
            for test_name, (success, output, duration) in self.results.items():
                if not success:
                    print(f"   - {test_name}")
                    if self.verbose and output:
                        print(f"     {output[:200]}...")
        
        success_rate = (passed / len(test_files)) * 100 if test_files else 0
        print(f"\n🎯 Success Rate: {success_rate:.1f}%")
        
        return failed == 0
    
    def run_specific_tests(self, test_patterns: List[str]) -> bool:
        """Run tests matching specific patterns"""
        all_tests = self.discover_tests()
        matching_tests = []
        
        for pattern in test_patterns:
            for test_file in all_tests:
                if pattern.lower() in str(test_file).lower():
                    if test_file not in matching_tests:
                        matching_tests.append(test_file)
        
        if not matching_tests:
            print(f"❌ No tests found matching patterns: {test_patterns}")
            return False
        
        print(f"🎯 Running {len(matching_tests)} matching test(s)...")
        
        passed = 0
        failed = 0
        
        for test_file in matching_tests:
            test_name = str(test_file.relative_to(project_root))
            success, output, duration = self.run_single_test(test_file)
            
            if success:
                passed += 1
                print(f"✅ {test_name} passed ({duration:.2f}s)")
            else:
                failed += 1
                print(f"❌ {test_name} failed ({duration:.2f}s)")
                if self.verbose and output:
                    print(f"   Error: {output[:200]}...")
        
        print(f"\n📊 Results: {passed} passed, {failed} failed")
        return failed == 0

def main():
    parser = argparse.ArgumentParser(description="Run TTRPG System tests")
    parser.add_argument("-v", "--verbose", action="store_true", 
                       help="Verbose output with detailed test information")
    parser.add_argument("-f", "--fail-fast", action="store_true",
                       help="Stop on first failure")
    parser.add_argument("-t", "--tests", nargs="+", 
                       help="Run specific tests (pattern matching)")
    parser.add_argument("--list", action="store_true",
                       help="List all available tests")
    
    args = parser.parse_args()
    
    runner = TestRunner(verbose=args.verbose, fail_fast=args.fail_fast)
    
    if args.list:
        test_files = runner.discover_tests()
        print(f"📋 Found {len(test_files)} test files:")
        for test_file in test_files:
            print(f"   - {test_file.relative_to(project_root)}")
        return
    
    print("🧪 TTRPG System Test Runner")
    print("=" * 60)
    
    if args.tests:
        success = runner.run_specific_tests(args.tests)
    else:
        success = runner.run_all_tests()
    
    if success:
        print(f"\n🎉 All tests passed!")
        sys.exit(0)
    else:
        print(f"\n💥 Some tests failed!")
        sys.exit(1)

if __name__ == "__main__":
    main()
