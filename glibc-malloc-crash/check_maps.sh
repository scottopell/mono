#!/bin/bash
# Launch test in background and quickly capture /proc/maps
MALLOC_ARENA_MAX=3 cargo test --test test_pure_std_repro test_concurrent_string_and_vec_growth --release -- --nocapture &
PID=$!

# Wait a moment for test to start
sleep 1.5

# Find the actual test process (not cargo)
TEST_PID=$(pgrep -P $PID test_pure_std)

if [ -n "$TEST_PID" ]; then
  echo "=== Capturing maps for PID $TEST_PID ==="
  cat /proc/$TEST_PID/maps 2>/dev/null > maps_arena3_crash.txt
  echo "Map count: $(wc -l < maps_arena3_crash.txt)"
  echo "Checking virtual memory usage:"
  cat /proc/$TEST_PID/status 2>/dev/null | grep -E "VmPeak|VmSize|VmRSS|VmData"
fi

wait $PID
echo "Test exit code: $?"
