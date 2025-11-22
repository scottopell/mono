#!/bin/bash

# Analyze malloc size distributions

if [ $# -ne 2 ]; then
    echo "Usage: $0 <log_file> <output_prefix>"
    exit 1
fi

LOG_FILE=$1
OUTPUT_PREFIX=$2

echo "Analyzing $LOG_FILE..."

# Extract size data
grep "MALLOC_SIZE," "$LOG_FILE" | cut -d, -f2 > "${OUTPUT_PREFIX}_sizes_raw.txt"

# Count total allocations
TOTAL=$(wc -l < "${OUTPUT_PREFIX}_sizes_raw.txt")
echo "Total allocations: $TOTAL"

# Create histogram
sort -n "${OUTPUT_PREFIX}_sizes_raw.txt" | uniq -c | sort -rn > "${OUTPUT_PREFIX}_histogram.txt"

echo "Top 10 allocation sizes:"
head -10 "${OUTPUT_PREFIX}_histogram.txt"

# Calculate percentiles
sort -n "${OUTPUT_PREFIX}_sizes_raw.txt" > "${OUTPUT_PREFIX}_sizes_sorted.txt"
MIN=$(head -1 "${OUTPUT_PREFIX}_sizes_sorted.txt")
MAX=$(tail -1 "${OUTPUT_PREFIX}_sizes_sorted.txt")
P50=$(awk -v total=$TOTAL 'NR==int(total*0.5)' "${OUTPUT_PREFIX}_sizes_sorted.txt")
P90=$(awk -v total=$TOTAL 'NR==int(total*0.9)' "${OUTPUT_PREFIX}_sizes_sorted.txt")
P99=$(awk -v total=$TOTAL 'NR==int(total*0.99)' "${OUTPUT_PREFIX}_sizes_sorted.txt")

echo ""
echo "Size statistics:"
echo "  Min: $MIN bytes"
echo "  Max: $MAX bytes"
echo "  P50 (median): $P50 bytes"
echo "  P90: $P90 bytes"
echo "  P99: $P99 bytes"

# Count unique sizes
UNIQUE=$(wc -l < "${OUTPUT_PREFIX}_histogram.txt")
echo "  Unique sizes: $UNIQUE"

# Summary to file
{
    echo "=== Size Distribution Analysis ==="
    echo "Log file: $LOG_FILE"
    echo "Total allocations: $TOTAL"
    echo ""
    echo "Size statistics:"
    echo "  Min: $MIN bytes"
    echo "  Max: $MAX bytes"
    echo "  P50 (median): $P50 bytes"
    echo "  P90: $P90 bytes"
    echo "  P99: $P99 bytes"
    echo "  Unique sizes: $UNIQUE"
    echo ""
    echo "Top 20 allocation sizes:"
    head -20 "${OUTPUT_PREFIX}_histogram.txt"
} > "${OUTPUT_PREFIX}_summary.txt"

echo ""
echo "Summary saved to ${OUTPUT_PREFIX}_summary.txt"
