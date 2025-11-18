#!/bin/bash
echo "=== T-1: Testing MALLOC_ARENA_MAX=1 (Serialized Allocation) ==="
echo ""

for RUN in 1 2 3; do
  echo "Run $RUN:"
  MALLOC_ARENA_MAX=1 timeout 30 cargo test --test test_pure_std_repro test_concurrent_string_and_vec_growth --release -- --nocapture 2>&1 | tail -8
  echo ""
done

echo ""
echo "=== Summary of T-1 ==="
MALLOC_ARENA_MAX=1 timeout 30 cargo test --test test_pure_std_repro test_concurrent_string_and_vec_growth --release 2>&1 | grep -E "PASS|SIGSEGV|signal" | head -5
