#!/bin/bash

# Find exact address space limit by monitoring /proc/self/maps

echo "======================================================================"
echo "FINDING EXACT ADDRESS SPACE LIMIT IN gVisor"
echo "======================================================================"
echo ""

# Test matrix: Different combinations to find the limit
declare -a tests=(
    # Format: "ARENA:MMAP_THRESH:SIZE:DESC"
    "default:default:4MB:Baseline crash (4MB × 3)"
    "default:default:14MB:Known crash (14MB × 3)"
    "2:default:14MB:Known working (arena=2, 14MB)"
    "3:default:14MB:Known crash (arena=3, 14MB)"
    "default:64MB:4MB:Passed earlier (64MB thresh, 4MB)"
    "default:64MB:14MB:Does brk help at 14MB?"
    "3:64MB:14MB:Combined: arena=3 + brk strategy"
    "4:default:4MB:Does arena=4 crash with smaller alloc?"
)

for test_config in "${tests[@]}"; do
    IFS=':' read -r arena mmap_thresh size desc <<< "$test_config"

    echo "======================================================================"
    echo "TEST: $desc"
    echo "Config: MALLOC_ARENA_MAX=$arena MALLOC_MMAP_THRESHOLD=$mmap_thresh"
    echo "Allocation: $size per thread × 3 threads"
    echo "======================================================================"

    # Set test size
    case $size in
        "4MB") test_name="test_concurrent_4mb_allocation" ;;
        "14MB") test_name="test_concurrent_string_and_vec_growth" ;;
        *) test_name="test_concurrent_string_and_vec_growth" ;;
    esac

    # Build environment
    env_vars=""
    [[ "$arena" != "default" ]] && env_vars="MALLOC_ARENA_MAX=$arena"
    [[ "$mmap_thresh" == "64MB" ]] && env_vars="$env_vars MALLOC_MMAP_THRESHOLD=67108864"
    [[ "$mmap_thresh" == "128MB" ]] && env_vars="$env_vars MALLOC_MMAP_THRESHOLD=134217728"

    # Run test
    echo "Running: $env_vars cargo test ..."
    timeout 30 bash -c "$env_vars cargo test --release --test test_pure_std_repro $test_name -- --nocapture" 2>&1 | tee "limit_test_${arena}_${mmap_thresh}_${size}.log" | grep -E "PASS|CRASH|signal|error:|Built"

    result=$?
    if [ $result -eq 0 ]; then
        echo "✅ PASSED"
    else
        echo "❌ CRASHED (exit code: $result)"
    fi
    echo ""
done

echo "======================================================================"
echo "SUMMARY"
echo "======================================================================"
echo "Check the log files for address space details:"
ls -lh limit_test_*.log
