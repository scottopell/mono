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
- **Allocation count thresholds** (Phase 5 binary search):
  - **Std-only**: 9.4-10.9M allocations before crash
  - **GeoJSON**: 7.9-9.0M allocations before crash (15-20% worse)
  - **Universal safe**: ≤7M allocations (22% safety margin)
- **Formula validation**: 95% accuracy (Phase 5)
- **100% effective workaround**: `MALLOC_ARENA_MAX=2`

### Known Test Results
| Pattern | Count/Thread | Size | Result |
|---------|-------------|------|--------|
| Single Vec | 1 | 4 MB | ✅ PASS |
| 4000 × 1KB | 4,000 | 4 MB | ✅ PASS |
| ~4M × tiny (byte.to_string) | ~4,000,000 | 4 MB | ❌ CRASH |

---

## Focused Objectives (3 Measurements)

**Note**: Phase 5 already measured precise allocation counts and crash thresholds. This investigation focuses on UNMEASURED aspects to complete the mechanistic understanding.

### Objective 1: Validate Phase 5 Thresholds (Optional)

**Question**: Do Phase 5 thresholds (9.4-10.9M std, 7.9-9.0M GeoJSON) reproduce in sandbox?

**Method**: Run existing tests and verify crash occurs at predicted thresholds

**Phase 5 Findings to Validate**:
- **GeoJSON**: Crashes at 7.9-9.0M allocations (total ~15.75M across threads)
- **Std-only**: Crashes at 9.4-10.9M allocations (total ~44M across threads)
- **Universal safe**: ≤7M allocations per thread

**Goal**: Confirm Phase 5 findings hold in current sandbox environment

**Deliverable**: Quick validation table (skip if time-constrained, Phase 5 already established this)

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

## Streamlined 2-Phase Methodology

**Note**: Phase 5 already measured allocation counts. Focus on size distributions, deallocation patterns, and fragmentation.

### Phase 1: Pattern Characterization (60-90 min)

**Step 1.1**: Measure size distributions
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

**Step 1.2**: Measure deallocation patterns
```rust
// Add to both test files
use std::time::Instant;
static START: Lazy<Instant> = Lazy::new(|| Instant::now());
static LIVE_ALLOCS: AtomicUsize = AtomicUsize::new(0);

// Track alloc/free, log periodically
eprintln!("[{}ms] Live: {}", START.elapsed().as_millis(), LIVE_ALLOCS.load(Ordering::Relaxed));
```

**Step 1.3**: Measure memory fragmentation
```bash
# Capture /proc/self/maps at intervals
cat /proc/self/maps > maps_checkpoint_${PCT}.txt

# Count VMAs
grep -E "(heap|anon)" maps_checkpoint_*.txt | wc -l
```

**Deliverable**: `PATTERN_CHARACTERIZATION.md`

### Phase 2: Model Refinement & Validation (30-60 min)

**Note**: Phase 5 already validated the formula at 95% accuracy. This phase focuses on understanding WHY patterns differ.

**Step 2.1**: Calculate metadata per allocation from measurements
```
Using Phase 5 thresholds and new size distribution data:
metadata_per_alloc = (VmSize_at_crash - arena_overhead - data_size) / allocation_count

GeoJSON: Higher metadata/alloc due to nested structures?
Std-only: Lower metadata/alloc due to uniform tiny strings?
```

**Step 2.2**: Explain the 15-20% GeoJSON penalty
```
Question: Why does GeoJSON crash 15-20% earlier than std-only?
Hypothesis: Nested structures → more malloc metadata overhead
Evidence: Size distribution + fragmentation measurements
```

**Step 2.3**: Document mechanistic understanding
```
Create clear explanation:
- What allocation pattern causes what system stress
- Why GeoJSON and std-only differ mechanistically
- What user-facing patterns to avoid
```

**Deliverable**: `MECHANISTIC_UNDERSTANDING.md`

---

## Specific Questions to Answer

### Question 1: Allocation Count Precision ✅ ANSWERED (Phase 5)
**Phase 5 Result**: Precise thresholds measured via binary search
- **GeoJSON**: 7.9-9.0M allocations before crash
- **Std-only**: 9.4-10.9M allocations before crash
- **Universal safe**: ≤7M allocations
- **Formula validation**: 95% accuracy

**Optional**: Validate these thresholds in current sandbox environment

### Question 2: Pattern Mechanisms (FOCUS HERE)
**Current**: "GeoJSON crashes 15-20% earlier" (Phase 5 quantified)
**Still Unknown**: WHY? What mechanistic differences cause this?
**Goal**: Quantified differences (size distribution, deallocation, fragmentation)
**Method**: Instrumentation + measurement
**Success**: Clear mechanistic explanation

### Question 3: Deallocation Impact (FOCUS HERE)
**Current**: Unknown if it matters
**Goal**: Does interleaved free() reduce pressure?
**Method**: Live allocation tracking
**Success**: Clear yes/no with evidence

### Question 4: Fragmentation Differences (FOCUS HERE)
**Current**: Unknown if patterns fragment differently
**Goal**: Measure VMA count differences between patterns
**Method**: /proc/self/maps analysis at intervals
**Success**: Quantified fragmentation comparison

---

## Deliverables (Evidence-Based)

**Note**: Phase 5 already measured allocation counts. Focus deliverables on unmeasured aspects.

### Primary: `PATTERN_CHARACTERIZATION.md`

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

### Secondary: `MECHANISTIC_UNDERSTANDING.md`

```markdown
# Why GeoJSON Crashes 15-20% Earlier Than Std-Only

## Phase 5 Baseline
- **GeoJSON threshold**: 7.9-9.0M allocations
- **Std-only threshold**: 9.4-10.9M allocations
- **Difference**: 15-20% worse for GeoJSON

## Size Distribution Analysis
[Histograms showing GeoJSON has more varied sizes vs std-only uniform tiny strings]

## Metadata Overhead Calculation
- GeoJSON metadata/alloc: XX bytes (from size distribution + VmSize)
- Std-only metadata/alloc: YY bytes
- **Explanation**: Nested structures carry ZZ% more overhead

## Deallocation Impact
[Does interleaved free() in GeoJSON help or hurt? Live allocation graphs]

## Fragmentation Impact
[VMA count comparison - does varied size distribution fragment more?]

## Conclusion
GeoJSON crashes earlier because: [Clear mechanistic explanation]
```

---

## Success Criteria (Refined)

### Must Achieve
✅ Size distributions documented with histograms (unmeasured)
✅ Deallocation patterns characterized (interleaved vs bulk) (unmeasured)
✅ Memory fragmentation quantified (VMA counts) (unmeasured)
✅ Mechanistic explanation for 15-20% GeoJSON penalty
✅ All measurements include methodology documentation

### Nice to Have
⭐ Phase 5 thresholds validated in current sandbox
⭐ Exact metadata per allocation calculated for each pattern
⭐ Allocation rate over time characterized

### Already Achieved (Phase 5)
✅ Allocation counts measured with ±10% precision
✅ Crash thresholds identified (GeoJSON 7.9-9.0M, Std-only 9.4-10.9M)
✅ Formula validated at 95% accuracy
✅ Universal safe threshold established (≤7M allocations)

### Explicitly NOT Required
❌ glibc source code analysis (out of scope)
❌ gVisor source analysis (out of scope)
❌ New workarounds (already have MALLOC_ARENA_MAX=2)
❌ Fixing the bug (not our goal)

---

## Time Budget (2-3 Hours)

**Note**: Reduced from 3-4 hours because Phase 5 already measured allocation counts and thresholds.

**Phase 1** (Pattern characterization): 60-90 min
- 30 min: Size distribution measurement (LD_PRELOAD logger)
- 30-60 min: Deallocation patterns + fragmentation analysis

**Phase 2** (Mechanistic understanding): 30-60 min
- 20 min: Calculate metadata per allocation from measurements
- 10-40 min: Document WHY GeoJSON crashes 15-20% earlier

**Total**: 90-150 minutes (vs 150-240 original)

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
🚩 Re-measuring allocation counts → NO, Phase 5 already did this (9.4-10.9M std, 7.9-9.0M GeoJSON)
🚩 Binary searching for thresholds → NO, Phase 5 already established precise thresholds
🚩 Skipping measurement methodology → NO, document HOW you measured
🚩 Not explaining WHY patterns differ → YES, this is the FOCUS

---

## Expected Outcome

At completion, you should be able to state:

1. **Allocation counts** ✅ KNOWN (Phase 5): "GeoJSON: 7.9-9.0M threshold, ~15.75M total; Std-only: 9.4-10.9M threshold, ~44M total"
2. **Size distribution** (MEASURE): "GeoJSON has varied sizes (4B-200B, nested structures); std-only has uniform tiny (1-3B strings)"
3. **Deallocation** (MEASURE): "GeoJSON [does/doesn't] free during parsing; std-only bulk frees at end"
4. **Fragmentation** (MEASURE): "GeoJSON creates XXX VMAs; std-only creates YYY VMAs"
5. **WHY GeoJSON 15-20% worse** (EXPLAIN): "GeoJSON crashes earlier because [mechanistic explanation based on size distribution + deallocation + fragmentation]"

---

**Begin investigation. Build on 40+ hours of prior work including Phase 5 precise thresholds.**

🎯 Focus: Understand WHY patterns differ mechanistically, not just that they crash at different thresholds.
