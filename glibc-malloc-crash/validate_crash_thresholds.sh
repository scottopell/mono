#!/bin/bash
# Quick validation: Do the crash thresholds from Phase 5 reproduce?

echo "=== CRASH THRESHOLD VALIDATION ==="
echo ""
echo "Testing GeoJSON pattern with MALLOC_ARENA_MAX=3 (should crash)..."
timeout 120 bash -c 'MALLOC_ARENA_MAX=3 cargo test --test test_geojson_repro test_concurrent_geojson_parsing -- --nocapture 2>&1' > geojson_crash_test.log
GEOJSON_EXIT=$?

echo "GeoJSON exit code: $GEOJSON_EXIT (139 = SIGSEGV crash, 0 = pass, 124 = timeout)"
echo ""

echo "Testing std-only pattern with MALLOC_ARENA_MAX=3 (should crash, might take longer)..."
timeout 600 bash -c 'MALLOC_ARENA_MAX=3 cargo test --test test_pure_std_repro test_concurrent_string_and_vec_growth -- --nocapture 2>&1' > std_only_crash_test.log
STD_EXIT=$?

echo "Std-only exit code: $STD_EXIT (139 = SIGSEGV crash, 0 = pass, 124 = timeout)"
echo ""

echo "=== RESULTS ==="
if [ $GEOJSON_EXIT -eq 139 ]; then
    echo "✅ GeoJSON crashed as expected (SIGSEGV)"
else
    echo "❌ GeoJSON did NOT crash (exit code: $GEOJSON_EXIT)"
fi

if [ $STD_EXIT -eq 139 ]; then
    echo "✅ Std-only crashed as expected (SIGSEGV)"
else
    echo "⚠️  Std-only exit code: $STD_EXIT (may have timed out if still running)"
fi

echo ""
echo "Log files: geojson_crash_test.log, std_only_crash_test.log"
