#!/bin/bash
cd /home/user/mono/glibc-malloc-crash
for i in {1..5}; do
  echo "========== Run $i =========="
  start=$(date +%s)
  timeout 30 cargo test --test test_pure_std_repro test_concurrent_string_and_vec_growth --release -- --nocapture 2>&1 | grep -E "Running tests|PASS|SIGSEGV|signal|test result|THREAD"
  exit_code=$?
  end=$(date +%s)
  duration=$((end - start))
  echo "Exit code: $exit_code, Duration: ${duration}s"
  echo ""
done
