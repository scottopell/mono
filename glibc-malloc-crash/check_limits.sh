#!/bin/bash
MALLOC_ARENA_MAX=3 cargo test --test test_pure_std_repro test_concurrent_string_and_vec_growth --release -- --nocapture & PID=$!
sleep 1.5
TEST_PID=$(pgrep -P $PID test_pure_std)

if [ -n "$TEST_PID" ]; then
  echo "=== /proc/$TEST_PID/limits ==="
  cat /proc/$TEST_PID/limits 2>/dev/null
  echo ""
  echo "=== Checking for any memory-related kernel messages ==="
  dmesg | tail -20
fi

wait $PID
