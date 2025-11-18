#!/bin/bash
for i in 1 2 3; do
  echo "=== Run $i ==="
  MALLOC_ARENA_MAX=3 cargo test --test test_pure_std_repro test_concurrent_string_and_vec_growth --release -- --nocapture 2>&1 | tail -5
  echo ""
done
