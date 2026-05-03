#!/bin/bash
for i in {1..5}; do
  echo "=== Run $i ==="
  timeout 30 cargo test --test test_pure_std_repro test_concurrent_string_and_vec_growth --release -- --nocapture 2>&1 | tail -10
  echo ""
  sleep 1
done
