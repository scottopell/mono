#!/bin/bash
for test in test_7mb_per_thread test_10mb_per_thread test_12mb_per_thread test_13mb_per_thread; do
  echo "========================================"
  echo "Testing: $test"
  MALLOC_ARENA_MAX=3 cargo test --test test_varying_sizes $test --release -- --nocapture 2>&1 | tail -8
  echo ""
done
