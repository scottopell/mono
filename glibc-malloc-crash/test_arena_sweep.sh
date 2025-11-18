#!/bin/bash
echo "=== T-5: Arena Count Sweep ==="
echo ""
echo "| MALLOC_ARENA_MAX | Run 1 | Run 2 | Run 3 | Result |"
echo "|---|---|---|---|---|"

for ARENA_COUNT in default 1 2 3 4 8 16; do
  if [ "$ARENA_COUNT" = "default" ]; then
    ENV_VAR=""
    DISPLAY_COUNT="(unset)"
  else
    ENV_VAR="MALLOC_ARENA_MAX=$ARENA_COUNT"
    DISPLAY_COUNT="$ARENA_COUNT"
  fi
  
  RESULTS=""
  for RUN in 1 2 3; do
    if [ -z "$ENV_VAR" ]; then
      OUTPUT=$(timeout 30 cargo test --test test_pure_std_repro test_concurrent_string_and_vec_growth --release 2>&1 | grep -E "test result|SIGSEGV")
    else
      OUTPUT=$($ENV_VAR timeout 30 cargo test --test test_pure_std_repro test_concurrent_string_and_vec_growth --release 2>&1 | grep -E "test result|SIGSEGV")
    fi
    
    if echo "$OUTPUT" | grep -q "ok"; then
      RESULTS="$RESULTS ✅"
    else
      RESULTS="$RESULTS ❌"
    fi
  done
  
  # Determine overall result
  if echo "$RESULTS" | grep -q "❌"; then
    OVERALL="CRASH"
  else
    OVERALL="PASS"
  fi
  
  echo "| $DISPLAY_COUNT | $(echo $RESULTS | cut -d' ' -f2) | $(echo $RESULTS | cut -d' ' -f3) | $(echo $RESULTS | cut -d' ' -f4) | $OVERALL |"
done

echo ""
