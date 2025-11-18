#!/bin/bash

# Direct testing of address space exhaustion hypothesis
# This script runs tests with different malloc configurations and monitors results

set -e

echo "======================================================================"
echo "DIRECT ADDRESS SPACE EXHAUSTION TESTING"
echo "======================================================================"
echo ""
echo "Goal: Directly observe and measure address space usage to confirm"
echo "      the hypothesis that gVisor has limited per-arena address space."
echo ""
echo "======================================================================"
echo ""

# Build tests first
echo "Building tests..."
cargo build --release --tests
echo ""

# Test 1: Baseline address space monitoring
echo "======================================================================"
echo "TEST 1: Address Space Monitoring - Baseline"
echo "======================================================================"
echo "Running tests that monitor /proc/self/maps to observe actual"
echo "address space usage patterns..."
echo ""

cargo test --release test_address_space_baseline -- --nocapture 2>&1 | tee test1_baseline.log
echo ""

cargo test --release test_address_space_single_thread_large_alloc -- --nocapture 2>&1 | tee test1_single.log
echo ""

cargo test --release test_address_space_incremental_growth -- --nocapture 2>&1 | tee test1_incremental.log
echo ""

# Test 2: Safe concurrent allocation (3MB × 3 threads)
echo "======================================================================"
echo "TEST 2: Address Space with Safe Concurrent Allocation (3MB)"
echo "======================================================================"
echo "Expected: PASS - Monitor address space during known-safe allocation"
echo ""

cargo test --release test_address_space_concurrent_safe -- --nocapture 2>&1 | tee test2_safe.log
echo ""

# Test 3: Boundary concurrent allocation (3.3MB × 3 threads)
echo "======================================================================"
echo "TEST 3: Address Space at Boundary (3.3MB)"
echo "======================================================================"
echo "Expected: PASS (barely) - Just below crash threshold"
echo ""

cargo test --release test_address_space_concurrent_boundary -- --nocapture 2>&1 | tee test3_boundary.log
echo ""

# Test 4: Count arenas via maps
echo "======================================================================"
echo "TEST 4: Observe Arena Creation in /proc/self/maps"
echo "======================================================================"
echo ""

cargo test --release test_count_arenas_via_maps -- --nocapture 2>&1 | tee test4_arenas.log
echo ""

# Test 5: MALLOC_MMAP_THRESHOLD effects
echo "======================================================================"
echo "TEST 5: Test MALLOC_MMAP_THRESHOLD (Force brk over mmap)"
echo "======================================================================"
echo "Theory: If mmap() regions cause address space exhaustion,"
echo "        forcing brk() should help."
echo ""

echo "--- Default MALLOC_MMAP_THRESHOLD (crash expected) ---"
cargo test --release test_mmap_threshold_effect -- --nocapture 2>&1 | tee test5_default.log || echo "CRASHED (expected)"
echo ""

echo "--- MALLOC_MMAP_THRESHOLD=67108864 (64MB) ---"
echo "This forces malloc to use brk() for allocations < 64MB"
echo ""
MALLOC_MMAP_THRESHOLD=67108864 cargo test --release test_mmap_threshold_effect -- --nocapture 2>&1 | tee test5_64mb.log || echo "CRASHED"
echo ""

echo "--- MALLOC_MMAP_THRESHOLD=134217728 (128MB) ---"
echo "Even higher threshold to maximize brk() usage"
echo ""
MALLOC_MMAP_THRESHOLD=134217728 cargo test --release test_mmap_threshold_effect -- --nocapture 2>&1 | tee test5_128mb.log || echo "CRASHED"
echo ""

# Test 6: MALLOC_MMAP_MAX effects
echo "======================================================================"
echo "TEST 6: Test MALLOC_MMAP_MAX (Limit mmap regions)"
echo "======================================================================"
echo "Theory: If too many mmap() calls cause crash, limiting them helps"
echo ""

echo "--- MALLOC_MMAP_MAX=0 (disable mmap entirely, brk only) ---"
MALLOC_MMAP_MAX=0 cargo test --release test_mmap_max_effect -- --nocapture 2>&1 | tee test6_no_mmap.log || echo "CRASHED"
echo ""

echo "--- MALLOC_MMAP_MAX=10 (very limited mmap) ---"
MALLOC_MMAP_MAX=10 cargo test --release test_mmap_max_effect -- --nocapture 2>&1 | tee test6_limit10.log || echo "CRASHED"
echo ""

# Test 7: Allocation patterns
echo "======================================================================"
echo "TEST 7: Different Allocation Patterns"
echo "======================================================================"
echo ""

echo "--- Many small allocations ---"
cargo test --release test_allocation_pattern_many_small -- --nocapture 2>&1 | tee test7_many_small.log || echo "CRASHED"
echo ""

echo "--- Vec vs String ---"
cargo test --release test_vec_vs_string_allocation -- --nocapture 2>&1 | tee test7_vec_string.log || echo "CRASHED"
echo ""

echo "--- Sequential with drops ---"
cargo test --release test_sequential_alloc_with_drops -- --nocapture 2>&1 | tee test7_sequential.log || echo "CRASHED"
echo ""

# Test 8: Combined tuning
echo "======================================================================"
echo "TEST 8: Combined Malloc Tuning (brk-only + arena limit)"
echo "======================================================================"
echo "Theory: If both address space AND arena count matter, combining helps"
echo ""

echo "--- MALLOC_ARENA_MAX=1 + MALLOC_MMAP_MAX=0 ---"
MALLOC_ARENA_MAX=1 MALLOC_MMAP_MAX=0 cargo test --release --test test_pure_std_repro test_concurrent_string_and_vec_growth -- --nocapture 2>&1 | tee test8_combined1.log || echo "CRASHED"
echo ""

echo "--- MALLOC_ARENA_MAX=2 + MALLOC_MMAP_MAX=0 ---"
MALLOC_ARENA_MAX=2 MALLOC_MMAP_MAX=0 cargo test --release --test test_pure_std_repro test_concurrent_string_and_vec_growth -- --nocapture 2>&1 | tee test8_combined2.log || echo "CRASHED"
echo ""

echo "--- MALLOC_ARENA_MAX=3 + MALLOC_MMAP_MAX=0 (should still crash if arena=3 is root cause) ---"
MALLOC_ARENA_MAX=3 MALLOC_MMAP_MAX=0 cargo test --release --test test_pure_std_repro test_concurrent_string_and_vec_growth -- --nocapture 2>&1 | tee test8_combined3.log || echo "CRASHED"
echo ""

# Summary
echo "======================================================================"
echo "TEST SUMMARY"
echo "======================================================================"
echo ""
echo "Log files created:"
ls -lh test*.log
echo ""
echo "Analyze these logs to answer:"
echo "1. How does address space usage differ between passing/crashing tests?"
echo "2. How many memory regions are created per arena?"
echo "3. Does MALLOC_MMAP_THRESHOLD help (brk vs mmap)?"
echo "4. Does MALLOC_MMAP_MAX help (limiting mmap regions)?"
echo "5. Is the issue really about ARENAS or about MMAP regions?"
echo ""
echo "======================================================================"
