# Investigation Prompt: GeoJSON vs Std-Only Pattern Analysis (Refined)

**Investigation ID**: Pattern Comparison Building on PRs #10-14
**Date**: 2025-11-18
**Focus**: MEASURE specific differences, SKIP redundant testing
**Environment**: Sandbox with gVisor + kernel 4.4.0 + glibc 2.39

**⚠️ REQUIRED READING**: `PRIOR_INVESTIGATIONS_SYNTHESIS.md` - Contains 95% confident root cause from 5 prior investigations

---

## Investigation Philosophy

### What We're NOT Doing (Skip These)
❌ Re-testing arena threshold (KNOWN: ≥3 required, 100% reproducible)
❌ Re-testing thread count (KNOWN: Irrelevant, tested 2-6 threads)
❌ Proving allocation count matters (KNOWN: PR #14 breakthrough)
❌ Environmental fingerprinting (DONE: 5 prior investigations)
❌ Hypothesis generation from scratch (BUILD ON: existing hypotheses)

### What We ARE Doing (Focus Here)
✅ **Measure precise allocation counts** for both patterns (±10%)
✅ **Characterize HOW patterns differ** mechanistically
✅ **Refine root cause formula** with measured coefficients
✅ **Determine deallocation pattern effects** (if any)
✅ **Quantify fragmentation differences**
✅ **Validate/improve predictive model**

**Duration**: 3-4 hours (not 8-12) because we're skipping known facts

---

## Known Facts (DO NOT RE-TEST)

### Root Cause (95% Confidence from PRs #10-14)

**Formula**:
```
Crash when: (arena_count × 66MB) + (allocation_count × metadata) > ~350MB
```

**Required Factors** (ALL 5 must be present):
1. Kernel 4.4.0
2. gVisor/runsc
3. glibc 2.39
4. MALLOC_ARENA_MAX ≥ 3
5. Millions of tiny allocations (~4M+ per thread)

### Known Measurements
- **Arena overhead**: ~66 MB (measured, PR #14)
- **Address space limit**: ~300-350 MB (gVisor constraint)
- **Allocation count threshold**: ~3-9 million (rough range, needs precision)
- **100% effective workaround**: `MALLOC_ARENA_MAX=2`

### Known Test Results
| Pattern | Count/Thread | Size | Result |
|---------|-------------|------|--------|
| Single Vec | 1 | 4 MB | ✅ PASS |
| 4000 × 1KB | 4,000 | 4 MB | ✅ PASS |
| ~4M × tiny (byte.to_string) | ~4,000,000 | 4 MB | ❌ CRASH |

---

## Focused Objectives (4 Measurements)

### Objective 1: Measure Exact Allocation Counts

**Question**: How many malloc() calls does each pattern make?

**Method**:
```c
// LD_PRELOAD malloc counter
static atomic_size_t malloc_count = 0;
void* malloc(size_t size) {
    atomic_fetch_add(&malloc_count, 1);
    return real_malloc(size);
}
```

**Expected**:
- **GeoJSON**: ~5-10M allocations/thread (70K features × ~70-140 allocs/feature)
- **Std-only**: ~14M allocations/thread (14MB ÷ 1000 bytes × 1000 to_string calls)

**Goal**: ±10% precision on these counts

**Deliverable**: Table with measured counts and methodology

### Objective 2: Measure Size Distributions

**Question**: What allocation sizes does each pattern use?

**Method**:
```c
// LD_PRELOAD size logger
void* malloc(size_t size) {
    fprintf(stderr, "MALLOC,%zu\n", size);
    return real_malloc(size);
}
// Parse: histogram of sizes
```

**Expected**:
- **GeoJSON**: Varied distribution (4B-200B, nested structures)
- **Std-only**: Bimodal (1-3B tiny strings + one 14MB clone)

**Goal**: Histograms showing distribution shape

**Deliverable**: Size distribution comparison with histograms

### Objective 3: Measure Deallocation Patterns

**Question**: When do allocations get freed?

**Method**:
```rust
static LIVE_ALLOCS: AtomicUsize = AtomicUsize::new(0);

// After each allocation
LIVE_ALLOCS.fetch_add(1, Ordering::Relaxed);

// Log periodically
eprintln!("[{}ms] Live: {}",
          elapsed_ms, LIVE_ALLOCS.load(Ordering::Relaxed));
```

**Expected**:
- **GeoJSON**: Interleaved (serde_json frees during parse?)
- **Std-only**: Bulk at end (all kept until thread completion)

**Goal**: Live allocation count over time graph

**Deliverable**: Deallocation timing comparison

### Objective 4: Measure Memory Fragmentation

**Question**: How fragmented does memory get?

**Method**:
```bash
# Capture /proc/self/maps at intervals
cat /proc/self/maps > maps_checkpoint_${PCT}.txt

# Count VMAs
grep -E "(heap|stack|anon)" maps_checkpoint_*.txt | wc -l
```

**Expected**:
- **GeoJSON**: More VMAs (varied sizes = more fragmentation?)
- **Std-only**: Fewer VMAs (uniform tiny allocations)

**Goal**: VMA count at 25%, 50%, 75%, 100% completion

**Deliverable**: Fragmentation comparison table

---

## Streamlined 3-Phase Methodology

### Phase 1: Allocation Count Measurement (60-90 min)

**Step 1.1**: Create LD_PRELOAD malloc counter
```c
// malloc_counter.c
#define _GNU_SOURCE
#include <dlfcn.h>
#include <stdio.h>
#include <stdatomic.h>

static void* (*real_malloc)(size_t) = NULL;
static atomic_size_t count = 0;

void* malloc(size_t size) {
    if (!real_malloc) real_malloc = dlsym(RTLD_NEXT, "malloc");
    size_t c = atomic_fetch_add(&count, 1);
    if (c % 100000 == 0) {
        fprintf(stderr, "[MALLOC_COUNT] %zu\n", c);
    }
    return real_malloc(size);
}

// Compile: gcc -shared -fPIC malloc_counter.c -o malloc_counter.so -ldl
```

**Step 1.2**: Run both tests with counter
```bash
# GeoJSON test
LD_PRELOAD=./malloc_counter.so cargo test --test test_geojson_repro \
  test_concurrent_geojson_parsing -- --nocapture 2>&1 | tee geojson_count.log

# Std-only test
LD_PRELOAD=./malloc_counter.so cargo test --test test_pure_std_repro \
  test_concurrent_string_and_vec_growth -- --nocapture 2>&1 | tee std_count.log

# Extract final counts
grep "MALLOC_COUNT" geojson_count.log | tail -1
grep "MALLOC_COUNT" std_count.log | tail -1
```

**Step 1.3**: Validate counts match expectations
- GeoJSON: 5-10M range?
- Std-only: ~14M?

**Deliverable**: `ALLOCATION_COUNTS.md`

### Phase 2: Pattern Characterization (60-90 min)

**Step 2.1**: Measure size distributions
```bash
# Modify malloc_counter.c to log sizes
void* malloc(size_t size) {
    fprintf(stderr, "SIZE,%zu\n", size);
    return real_malloc(size);
}

# Run tests, create histograms
LD_PRELOAD=./malloc_logger.so cargo test ... 2> sizes.log
grep "SIZE," sizes.log | cut -d, -f2 | sort -n | uniq -c > histogram.txt
```

**Step 2.2**: Measure allocation rate over time
```rust
// Add to both test files
use std::time::Instant;
static START: Lazy<Instant> = Lazy::new(|| Instant::now());

// Log periodically
eprintln!("[{}ms] Checkpoint", START.elapsed().as_millis());
```

**Step 2.3**: Measure live allocations
```rust
static LIVE_ALLOCS: AtomicUsize = AtomicUsize::new(0);
// Track alloc/free, log periodically
```

**Deliverable**: `PATTERN_CHARACTERIZATION.md`

### Phase 3: Model Refinement & Validation (30-60 min)

**Step 3.1**: Calculate metadata per allocation
```
From allocation counts and VmSize measurements:
metadata_per_alloc = (VmSize_at_crash - arena_overhead - data_size) / allocation_count

Example:
(350MB - 198MB - 14MB) / 14M allocs = 138MB / 14M = ~10 bytes/alloc
```

**Step 3.2**: Refine formula with measured values
```
Original: (arenas × 66MB) + (count × metadata) > 350MB
Refined:  (arenas × 66MB ± X%) + (count × YY bytes ± Z%) > 350MB ± W%
```

**Step 3.3**: Validate predictive power
```rust
// Create test with predicted crash count
// If model accurate: should crash at predicted count ±10%
```

**Deliverable**: `REFINED_MODEL.md`

---

## Specific Questions to Answer

### Question 1: Allocation Count Precision
**Current**: ~3-9M allocation range (vague)
**Goal**: X.XX million ± Y% (precise)
**Method**: LD_PRELOAD counting
**Success**: ±10% precision

### Question 2: Pattern Mechanisms
**Current**: "Patterns differ" (qualitative)
**Goal**: Quantified differences (rate, size distribution, deallocation)
**Method**: Instrumentation + measurement
**Success**: Clear mechanistic distinction

### Question 3: Model Accuracy
**Current**: Formula with estimates
**Goal**: Formula with measured coefficients
**Method**: Calculate from measurements
**Success**: Predict crash for new pattern within ±15%

### Question 4: Deallocation Impact
**Current**: Unknown if it matters
**Goal**: Does interleaved free() reduce pressure?
**Method**: Live allocation tracking
**Success**: Clear yes/no with evidence

---

## Deliverables (Evidence-Based)

### Primary: `ALLOCATION_COUNTS.md`

```markdown
# Allocation Count Measurements

## Methodology
[LD_PRELOAD malloc counter implementation]

## Results

| Test Pattern | Allocations/Thread | Total (3 threads) | Measurement Method |
|--------------|-------------------|------------------|-------------------|
| GeoJSON | X.XX million | Y.YY million | LD_PRELOAD counter |
| Std-only | A.AA million | B.BB million | LD_PRELOAD counter |

## Analysis
[How do these compare to threshold? Why the difference?]
```

### Secondary: `PATTERN_COMPARISON.md`

```markdown
# GeoJSON vs Std-Only: Mechanistic Comparison

## Allocation Rate
| Pattern | Rate (allocs/sec) | Profile |
|---------|------------------|---------|
| GeoJSON | XXk/sec | [Bursty/Steady] |
| Std-only | YYk/sec | [Bursty/Steady] |

## Size Distribution
[Histograms showing allocation size frequency]

## Deallocation Pattern
[Live allocation count over time graphs]

## Fragmentation
| Pattern | VMA Count at Crash | Interpretation |
|---------|-------------------|----------------|
| GeoJSON | XXX | [More/Less fragmented] |
| Std-only | YYY | [More/Less fragmented] |
```

### Tertiary: `REFINED_MODEL.md`

```markdown
# Refined Root Cause Model

## Original (PR #14)
Crash when: (arenas × 66MB) + (count × metadata) > 350MB

## Refined (This Investigation)
Crash when: (arenas × AA.A MB ± X%) + (count × BB bytes ± Y%) > CCC MB ± Z%

## Measured Coefficients
- arena_overhead: AA.A MB (measured via /proc/self/maps, N=5 runs)
- metadata_per_alloc: BB bytes (calculated from VmSize and count)
- address_space_limit: CCC MB (measured at crash, N=5 runs)

## Validation
Predicted crash at X.XX million allocs → Observed crash at Y.YY million (within ±ZZ%)
```

---

## Success Criteria (Refined)

### Must Achieve
✅ Allocation counts measured with ±10% precision
✅ Size distributions documented with histograms
✅ Deallocation patterns characterized (interleaved vs bulk)
✅ Memory fragmentation quantified (VMA counts)
✅ Model coefficients refined from measurements
✅ All measurements include methodology documentation

### Nice to Have
⭐ Predictive model validates on new test pattern
⭐ Exact metadata per allocation calculated
⭐ Address space limit measured with ±5% precision

### Explicitly NOT Required
❌ glibc source code analysis (out of scope)
❌ gVisor source analysis (out of scope)
❌ New workarounds (already have MALLOC_ARENA_MAX=2)
❌ Fixing the bug (not our goal)

---

## Time Budget (3-4 Hours)

**Phase 1** (Allocation counts): 60-90 min
- 20 min: Write/compile LD_PRELOAD counter
- 40-70 min: Run tests, extract counts, validate

**Phase 2** (Pattern characterization): 60-90 min
- 30 min: Size distribution measurement
- 30 min: Deallocation + fragmentation analysis

**Phase 3** (Model refinement): 30-60 min
- 20 min: Calculate coefficients from data
- 10-40 min: Validate predictions

**Total**: 150-240 minutes

---

## Tools & Commands Quick Reference

```bash
# LD_PRELOAD malloc counter
gcc -shared -fPIC malloc_counter.c -o malloc_counter.so -ldl
LD_PRELOAD=./malloc_counter.so cargo test ...

# Memory map analysis
cat /proc/self/maps > maps.txt
grep -E "(heap|anon)" maps.txt | wc -l

# VmSize tracking
grep "VmSize" /proc/self/status

# Size histogram
grep "SIZE," log.txt | cut -d, -f2 | sort -n | uniq -c

# Allocation rate
# [Add timing to test code]

# Workaround (for comparison)
MALLOC_ARENA_MAX=3 cargo test ...  # Should crash
MALLOC_ARENA_MAX=2 cargo test ...  # Should pass
```

---

## Red Flags (Stop If You Find Yourself...)

🚩 Re-testing arena threshold → NO, it's definitive (MALLOC_ARENA_MAX ≥ 3)
🚩 Re-testing thread count → NO, it's irrelevant (tested in PRs #11-13)
🚩 Speculating about counts → NO, measure them with LD_PRELOAD
🚩 "Approximately X million" → NO, we need ±10% precision
🚩 Skipping measurement methodology → NO, document HOW you measured

---

## Expected Outcome

At completion, you should be able to state:

1. **Allocation counts**: "GeoJSON: X.XX ± 0.YY million, Std-only: A.AA ± 0.BB million"
2. **Pattern difference**: "GeoJSON allocates in bursts at ZZ k/sec with varied sizes; std-only steady at WW k/sec with uniform tiny sizes"
3. **Deallocation**: "GeoJSON [does/doesn't] free during parsing; std-only bulk frees at end"
4. **Fragmentation**: "GeoJSON creates XXX VMAs; std-only creates YYY VMAs"
5. **Model**: "(arenas × AA MB) + (count × BB bytes) > CCC MB with ±DD% error"

---

**Begin investigation. Build on 40+ hours of prior work. Measure precisely, skip redundant tests.**

🎯 Focus: Precision measurements to refine the model, not re-proving known facts.
