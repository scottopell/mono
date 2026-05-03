#!/bin/bash
echo "=== CRASH CHARACTERISTICS TEST (5 runs) ==="
for i in 1 2 3 4 5; do
  echo ""
  echo "=== Run $i ==="
  start=$(date +%s)
  timeout 30 cargo test --test test_pure_std_repro test_concurrent_string_and_vec_growth --release 2>&1 | grep -E "PASS|SIGSEGV|signal|test result|THREAD|error:"
  exit_code=$?
  end=$(date +%s)
  duration=$((end - start))
  echo "Exit code: $exit_code, Duration: ${duration}s"
done
