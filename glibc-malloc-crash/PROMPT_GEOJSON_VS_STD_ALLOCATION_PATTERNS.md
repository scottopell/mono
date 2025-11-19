# Investigation Prompt: GeoJSON vs Std-Only Allocation Pattern Analysis

**Investigation ID**: Allocation Pattern Comparison
**Date**: 2025-11-18
**Context**: Building on PR #14's breakthrough that allocation COUNT (not SIZE) triggers crash
**Environment**: Requires sandbox with gVisor + kernel 4.4.0 + glibc 2.39

---

## Objective

Compare allocation patterns between two reproduction test cases to understand:
1. **Do both trigger the crash?** (or just one?)
2. **What are the allocation count differences?**
3. **What are the allocation pattern characteristics?**
4. **Which is "worse" in terms of triggering the crash?**

---

## Background: Critical Insight from PR #14

**BREAKTHROUGH DISCOVERY**: The crash is triggered by **allocation COUNT**, not total bytes allocated.

**Evidence from PR #14:**

| Allocation Pattern | Calls/Thread | Total Size | Result |
|-------------------|-------------|------------|---------|
| Single Vec | 1 | 4 MB | ✅ PASS |
| 100 × 40KB chunks | 100 | 4 MB | ✅ PASS |
| 1000 × 4KB chunks | 1,000 | 4 MB | ✅ PASS |
| 4000 × 1KB chunks | 4,000 | 4 MB | ✅ PASS |
| **byte.to_string()** | **~4,000,000** | **4 MB** | **❌ CRASH** |

**Root Cause Formula:**
```
Crash when: (arena_count × 66MB) + (allocation_count × metadata) > ~350MB
```

**Known Crash Triggers:**
- MALLOC_ARENA_MAX ≥ 3 (default)
- ~44 million tiny allocations across 3 threads (from original `byte.to_string()` pattern)
- gVisor + kernel 4.4.0 + glibc 2.39

---

## Test Cases to Compare

### Test Case 1: GeoJSON Repro
**File**: `tests/test_geojson_repro.rs`
**Function**: `test_concurrent_geojson_parsing()`

**Pattern:**
- Generates ~14MB GeoJSON string (70,000 features × 200 bytes each)
- 3 threads concurrently parse with `geojson::GeoJson::parse()`
- Uses `serde_json` internally for deserialization
- Creates nested data structures (FeatureCollection → Features → Geometry/Properties)

**Key Characteristics:**
- External dependency: `geojson` crate + `serde_json`
- Complex nested allocations (JSON parsing builds tree structures)
- Unknown allocation count (needs measurement)

### Test Case 2: Pure Std Repro
**File**: `tests/test_pure_std_repro.rs`
**Function**: `test_concurrent_string_and_vec_growth()`

**Pattern:**
- Creates 14MB string (`"x".repeat(14 * 1024 * 1024)`)
- 3 threads each clone the 14MB string
- Each thread: `for chunk in content.chunks(1000)` → processes each byte with `byte.to_string()`
- Creates nested Vecs of Strings

**Key Characteristics:**
- Pure std library (no external dependencies)
- Known to crash (similar to original crash pattern)
- **Estimated allocation count**: 14MB ÷ 1000 bytes/chunk × 1000 bytes/chunk = ~14,000,000 `to_string()` calls × 3 threads = **~42 million allocations**

---

## Investigation Questions

### Primary Questions

**Q1**: Do both test cases crash in the sandbox environment?
- [ ] GeoJSON test crashes
- [ ] Std-only test crashes
- [ ] Both crash
- [ ] Neither crashes (unexpected)

**Q2**: What are the allocation counts for each test?
- GeoJSON test: ??? allocations/thread
- Std-only test: ~14 million allocations/thread (estimate to verify)

**Q3**: What are the allocation size distributions?
- GeoJSON: What's the typical allocation size? (JSON strings, objects, arrays)
- Std-only: Dominated by tiny String allocations (~1-3 bytes each from `byte.to_string()`)

**Q4**: Which test has more "complex" fragmentation?
- GeoJSON: Nested structures (Feature → Geometry → coordinates) = varied sizes
- Std-only: Uniform tiny allocations = predictable pattern

### Secondary Questions

**Q5**: Can we measure exact allocation counts?
- Use allocation profiling tools (e.g., `strace -e brk,mmap,mprotect`, `MALLOC_TRACE`)
- Count `malloc()` calls directly if possible

**Q6**: Are there allocation "bursts" vs steady streams?
- GeoJSON: Parsing likely allocates in bursts (per feature)
- Std-only: Steady stream (loop-driven)

**Q7**: What's the "allocation intensity" (allocations/second)?
- Which test saturates the arena metadata structures faster?

---

## Investigation Methodology

### Phase 1: Baseline Crash Verification

**Test both cases with default settings:**

```bash
cd glibc-malloc-crash

# Test 1: GeoJSON repro
cargo test --test test_geojson_repro test_concurrent_geojson_parsing -- --nocapture

# Test 2: Std-only repro
cargo test --test test_pure_std_repro test_concurrent_string_and_vec_growth -- --nocapture
```

**Record:**
- Which tests crash?
- Crash consistency (run each 3 times)
- Any error messages or patterns

### Phase 2: Allocation Count Measurement

**Approach A: strace malloc counting**

```bash
# GeoJSON test
strace -e brk,mmap,mprotect -o geojson_strace.log \
  cargo test --test test_geojson_repro test_concurrent_geojson_parsing -- --nocapture 2>&1

# Count mprotect calls (proxy for arena activity)
grep "mprotect" geojson_strace.log | wc -l

# Std-only test
strace -e brk,mmap,mprotect -o std_strace.log \
  cargo test --test test_pure_std_repro test_concurrent_string_and_vec_growth -- --nocapture 2>&1

# Count mprotect calls
grep "mprotect" std_strace.log | wc -l
```

**Approach B: Manual calculation from code**

**GeoJSON test:**
- Count: Number of features × (allocations per feature parsing)
- Need to estimate: How many allocations does `serde_json` make per feature?
  - String allocations for keys ("type", "geometry", "properties", etc.)
  - Value allocations (objects, arrays, numbers)
  - Estimate: ~50-100 allocations per feature?
  - Total: 70,000 features × ~75 allocations = **~5.25 million allocations/thread**

**Std-only test:**
- Count: 14MB ÷ 1000 bytes/chunk = 14,336 chunks
- Per chunk: 1000 `byte.to_string()` calls = 1000 allocations
- Total: 14,336 × 1000 = **~14.3 million allocations/thread**
- Across 3 threads: **~43 million total**

**Record:**
- Actual vs estimated allocation counts
- Which test has higher allocation count?

### Phase 3: Allocation Size Distribution

**Method: Code analysis + sampling**

For each test, document:
- **Minimum allocation size**: Smallest String/Vec allocated
- **Maximum allocation size**: Largest single allocation
- **Typical allocation size**: Most common size
- **Distribution**: Uniform vs varied

**GeoJSON expected:**
- Min: ~4 bytes (JSON keys like "id")
- Max: ~200 bytes (feature JSON string)
- Typical: ~20-50 bytes (varied object fields)
- Distribution: **Varied** (nested structures have different sizes)

**Std-only expected:**
- Min: ~1-3 bytes (`byte.to_string()` for 0-255)
- Max: 14MB (initial string clone)
- Typical: ~1-3 bytes (dominated by `to_string()`)
- Distribution: **Bimodal** (one huge clone + millions of tiny strings)

### Phase 4: Timing and Intensity Analysis

**Measure:**
- Total test duration
- Allocations per second
- When does crash occur (early vs late in test)?

```bash
# Add timestamps to strace
strace -tt -e brk,mmap,mprotect -o geojson_timed.log \
  cargo test --test test_geojson_repro test_concurrent_geojson_parsing -- --nocapture 2>&1

# Analyze crash timing
tail -100 geojson_timed.log  # See final syscalls before crash
```

### Phase 5: Comparative Analysis

**Create comparison table:**

| Metric | GeoJSON Test | Std-Only Test | Winner (Worse) |
|--------|--------------|---------------|----------------|
| **Crashes?** | Yes/No | Yes/No | - |
| **Crash Rate** (3 runs) | X/3 | Y/3 | - |
| **Est. Allocations/Thread** | ~5.3M | ~14.3M | Std-only |
| **Total Allocations (3 threads)** | ~16M | ~43M | Std-only |
| **Min Allocation Size** | ~4 bytes | ~1 byte | Std-only |
| **Max Allocation Size** | ~200 bytes | 14MB | GeoJSON |
| **Typical Size** | ~20-50 bytes | ~1-3 bytes | Std-only (smaller) |
| **Size Distribution** | Varied | Bimodal | - |
| **mprotect Call Count** | ??? | ??? | TBD |
| **Test Duration** | ??? sec | ??? sec | TBD |
| **Allocation Intensity** | ???/sec | ???/sec | TBD |

---

## Expected Findings

### Hypothesis 1: Std-only test is "worse" (more likely to crash)

**Reasoning:**
- 3× higher allocation count (~43M vs ~16M)
- Smaller allocations = more fragmentation
- Matches original crash pattern (`byte.to_string()`)

**Evidence needed:**
- ✅ Std-only crashes more consistently
- ✅ Higher mprotect call count
- ✅ More arena metadata overhead

### Hypothesis 2: GeoJSON test might not crash (or less consistently)

**Reasoning:**
- Lower allocation count (~16M)
- Larger average allocation size (less fragmentation)
- Different allocation pattern (burst vs stream)

**Evidence needed:**
- ✅ GeoJSON crashes less often or not at all
- ✅ Lower mprotect call count
- ✅ Lower memory pressure

### Hypothesis 3: Both crash, but for slightly different reasons

**Reasoning:**
- Both exceed threshold, but via different paths
- GeoJSON: Nested complexity (tree depth)
- Std-only: Sheer volume (allocation count)

**Evidence needed:**
- ✅ Both crash consistently
- ✅ Different strace patterns
- ✅ Different crash timings

---

## Deliverables

### Required Outputs

1. **Test Results Table**
   - Crash rates for both tests
   - Actual allocation counts (measured or estimated)
   - Size distributions

2. **strace Analysis**
   - mprotect call counts
   - Memory map snapshots (`cat /proc/self/maps` before crash)
   - Syscall patterns (bursts vs steady)

3. **Comparative Summary**
   - Which test is "worse" for triggering crash?
   - Why? (allocation count, size, fragmentation)
   - Which test better represents real-world scenarios?

4. **Recommendations**
   - Which test should be used as canonical reproducer?
   - Should we keep both or consolidate?
   - Are there other allocation patterns to test?

### Optional Deep Dives

5. **Allocation Profiling** (if tools available)
   - Use `MALLOC_TRACE` or custom allocator hooks
   - Get exact allocation counts and sizes

6. **Modified Tests**
   - Create "light GeoJSON" (fewer features)
   - Create "light std-only" (fewer chunks)
   - Find minimal crash thresholds for each

7. **Hybrid Test**
   - Combine characteristics of both
   - Test if nested structures + high count = worse

---

## Investigation Scope & Boundaries

### In Scope
✅ Crash verification for both tests
✅ Allocation count estimation/measurement
✅ Comparative analysis of patterns
✅ Recommendation on which test to use

### Out of Scope
❌ Fixing the crash (workaround already known: `MALLOC_ARENA_MAX=2`)
❌ Deep gVisor source analysis
❌ Creating new reproduction methods
❌ Performance optimization of tests

### Success Criteria
✅ Understand which test has higher allocation count
✅ Document allocation pattern differences
✅ Provide clear recommendation on test selection
✅ Preserve evidence (strace logs, timing data)

---

## Context from Previous Investigations

### Known Facts (95% confidence)
- Allocation COUNT is root trigger (not size)
- Threshold: ~4+ million allocations/thread triggers crash
- Arena count ≥ 3 required
- gVisor mprotect silent failure mechanism
- Formula: `(arenas × 66MB) + (count × metadata) > ~350MB`

### Known Workarounds (100% effective)
```bash
export MALLOC_ARENA_MAX=2
```

### Tools & Commands Reference
```bash
# Crash verification
cargo test --test <test_file> <test_name> -- --nocapture

# strace syscall monitoring
strace -e brk,mmap,mprotect -o output.log cargo test ...

# Memory map inspection
cat /proc/self/maps > maps_snapshot.txt

# mprotect counting
grep "mprotect" strace.log | wc -l

# Timing analysis
strace -tt -e trace=memory ... # timestamp every syscall
```

---

## Expected Investigation Duration

**Phase 1** (Crash verification): 15-30 min
**Phase 2** (Allocation counting): 30-45 min
**Phase 3** (Size distribution): 20-30 min
**Phase 4** (Timing analysis): 20-30 min
**Phase 5** (Comparative analysis): 30-45 min

**Total**: ~2-3 hours for thorough investigation

---

## Starting Point

1. Read this prompt thoroughly
2. Run Phase 1: Crash verification for both tests
3. Based on crash results, prioritize remaining phases
4. Document findings in `GEOJSON_VS_STD_COMPARISON.md`
5. Create comparison table and recommendation

---

**Begin investigation when ready. Focus on allocation COUNT as the key differentiator.**

Good luck, investigator! 🔍
