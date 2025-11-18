#!/bin/bash
MALLOC_ARENA_MAX=2 cargo test --test test_pure_std_repro test_concurrent_string_and_vec_growth --release -- --nocapture &
PID=$!
sleep 2
TEST_PID=$(pgrep -P $PID test_pure_std)

if [ -n "$TEST_PID" ]; then
  echo "=== Capturing maps for PID $TEST_PID (ARENA_MAX=2) ==="
  cat /proc/$TEST_PID/maps 2>/dev/null > maps_arena2_working.txt
  echo "Map count: $(wc -l < maps_arena2_working.txt)"
  cat /proc/$TEST_PID/status 2>/dev/null | grep -E "VmPeak|VmSize|VmRSS|VmData"
fi

wait $PID
