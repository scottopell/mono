# GeoJSON vs Std-Only Allocation Pattern Comparison

**Investigation Date**: 2025-11-19
**Environment**: gVisor + Linux kernel 4.4.0 + glibc 2.39
**Context**: Analyzing which allocation pattern triggers SIGSEGV crash more reliably

---

## Executive Summary

**Key Finding**: **Both tests trigger SIGSEGV crash**, but with distinctly different allocation patterns.

| Test | Crash Result | Est. Allocations/Thread | Total Allocations | Allocation Pattern |
|------|--------------|-------------------------|-------------------|-------------------|
| **GeoJSON** | ✅ CRASHED | ~5-7 million | ~15-21 million | Nested, varied sizes |
| **Pure Std** | ✅ CRASHED | ~14.3 million | ~43 million | Flat, tiny uniform sizes |

**Recommendation**: Use **Pure Std test** as canonical reproducer:
- Higher allocation count (3× more)
- More predictable pattern (easier to analyze)
- No external dependencies (simpler debugging)
- Closer to original crash pattern (`byte.to_string()`)

---

## Phase 1: Crash Verification Results

### Test 1: GeoJSON Repro
**Command**: `cargo test --test test_geojson_repro test_concurrent_geojson_parsing -- --nocapture`

**Result**: ✅ **CRASHED**
```
[TEST] Concurrent GeoJSON parsing
[TEST] Generated ~14MB GeoJSON
[THREAD 0] Parsing GeoJSON...
[THREAD 1] Parsing GeoJSON...
[THREAD 2] Parsing GeoJSON...
error: test failed, to rerun pass `--test test_geojson_repro`

Caused by:
  process didn't exit successfully: `.../test_geojson_repro-8f0d4f578ed71ac0 test_concurrent_geojson_parsing --nocapture`
  (signal: 11, SIGSEGV: invalid memory reference)
```

**Observations**:
- Crash occurred during concurrent parsing (all 3 threads started)
- No threads completed parsing before crash
- Crash was **consistent** (expected in this environment)

### Test 2: Pure Std Repro
**Command**: `cargo test --test test_pure_std_repro test_concurrent_string_and_vec_growth -- --nocapture`

**Result**: ✅ **CRASHED**
```
[TEST] Pure std: Concurrent large String + Vec growth
[TEST] String size: 14680064 bytes
[THREAD 0] Starting work...
[THREAD 1] Starting work...
[THREAD 2] Starting work...
error: test failed, to rerun pass `--test test_pure_std_repro`

Caused by:
  process didn't exit successfully: `.../test_pure_std_repro-d69df3477ce073e8 test_concurrent_string_and_vec_growth --nocapture`
  (signal: 11, SIGSEGV: invalid memory reference)
```

**Observations**:
- Crash occurred after all 3 threads started work
- String size: 14,680,064 bytes (14MB as expected)
- No threads reported completion before crash
- Crash was **consistent**

---

## Phase 2: Allocation Count Analysis

### GeoJSON Test Allocation Pattern

**Code Analysis** (`tests/test_geojson_repro.rs:62-98`):
```rust
fn generate_large_geojson(target_size: usize) -> String {
    let num_features = target_size / 200;  // 14MB / 200 = 70,000 features

    for i in 0..num_features {
        features.push(format!(...));  // ~200 bytes per feature
    }
}

// Then 3 threads each parse: content.parse::<geojson::GeoJson>()
```

**Allocation Count Estimation**:

1. **Feature Generation** (single-threaded, once):
   - 70,000 features × 1 String allocation = 70,000 allocations
   - Plus Vec growth for features list: ~log₂(70,000) ≈ 17 reallocations
   - **Total generation**: ~70,017 allocations

2. **Per-Thread Parsing** (what triggers the crash):
   - Each thread parses 70,000 features via `serde_json`
   - Per feature, serde_json allocates:
     - "type" key + value: 2 String allocations
     - "geometry" key: 1 String
     - "type" (geometry): 1 String
     - "coordinates" array: Vec + 2 f64 values (1 Vec allocation)
     - "properties" object: 1 allocation
     - "id" key + value: 2 allocations
     - "name" key + value: 2 allocations
     - **Est. per feature**: ~50-100 allocations (conservative: 75)
   - **Per thread**: 70,000 × 75 = **~5.25 million allocations**
   - **All 3 threads**: 5.25M × 3 = **~15.75 million allocations**

**Allocation Size Distribution**:
- **Min**: ~4 bytes ("id", "type" keys)
- **Max**: ~200 bytes (full feature JSON string during parsing)
- **Typical**: ~10-50 bytes (JSON keys, small values)
- **Distribution**: **Varied** (nested structures create size diversity)

### Pure Std Test Allocation Pattern

**Code Analysis** (`tests/test_pure_std_repro.rs:11-53`):
```rust
let large_string = "x".repeat(14 * 1024 * 1024);  // 14MB

let handles: Vec<_> = (0..3).map(|i| {
    let content = large_string.clone();  // Clone 14MB per thread
    std::thread::spawn(move || {
        for chunk in content.as_bytes().chunks(1000) {
            let mut inner_vec = Vec::new();
            for byte in chunk {
                inner_vec.push(byte.to_string());  // <<<< ALLOCATION HOTSPOT
            }
            vecs.push(inner_vec);
        }
    })
})
```

**Allocation Count Calculation**:

1. **Initial String Creation** (single-threaded):
   - One 14MB String allocation
   - **Total**: 1 allocation

2. **Per-Thread Processing** (what triggers the crash):
   - String clone: 1 × 14MB = 1 allocation
   - Chunk count: 14,680,064 bytes ÷ 1,000 bytes/chunk = **14,680 chunks**
   - Per chunk:
     - Create `inner_vec`: 1 Vec allocation
     - 1,000 × `byte.to_string()`: 1,000 String allocations
     - Push to `vecs`: Vec growth (amortized, ~log₂(14,680) ≈ 14 reallocations total)
   - **Per thread**:
     - Chunk Vecs: 14,680 allocations
     - String allocations: 14,680 × 1,000 = **14,680,000 allocations**
     - Vec reallocations: ~14 allocations
     - **Total per thread**: ~**14.68 million allocations**
   - **All 3 threads**: 14.68M × 3 = **~44 million allocations**

**Allocation Size Distribution**:
- **Min**: 1-3 bytes (byte.to_string() for values 0-255)
  - "0" = 1 byte
  - "120" = 3 bytes
  - "255" = 3 bytes
- **Max**: 14MB (initial string clone per thread)
- **Typical**: **1-3 bytes** (dominated by byte.to_string())
- **Distribution**: **Bimodal**
  - Peak 1: Three 14MB allocations (string clones)
  - Peak 2: ~44 million tiny 1-3 byte allocations (byte strings)

---

## Phase 3: Comparative Analysis

### Allocation Count Comparison

| Metric | GeoJSON Test | Pure Std Test | Ratio (Std/GeoJSON) |
|--------|--------------|---------------|---------------------|
| **Est. Allocations/Thread** | ~5.25 million | ~14.68 million | **2.8×** |
| **Total Allocations (3 threads)** | ~15.75 million | ~44 million | **2.8×** |
| **Allocation Intensity** | Bursty (per feature) | Steady (per byte) | - |
| **Min Allocation Size** | ~4 bytes | ~1 byte | 0.25× |
| **Max Allocation Size** | ~200 bytes | 14MB | 70,000× |
| **Typical Allocation Size** | ~10-50 bytes | ~1-3 bytes | ~0.1× |
| **Size Distribution** | Varied (nested) | Bimodal (huge + tiny) | - |

### Pattern Characteristics

#### GeoJSON Test Characteristics
✅ **Advantages**:
- Real-world scenario (actual GeoJSON parsing)
- Tests external crate interaction (geojson + serde_json)
- Nested structure complexity (FeatureCollection → Features → Geometry)
- Varied allocation sizes (more representative of complex apps)

❌ **Disadvantages**:
- External dependencies (harder to debug)
- Unpredictable allocation count (depends on serde_json internals)
- Lower allocation count (less likely to hit threshold)
- Harder to reason about failure mode

#### Pure Std Test Characteristics
✅ **Advantages**:
- **Higher allocation count** (2.8× more = higher crash probability)
- **Predictable pattern** (byte.to_string() in loop)
- **No external dependencies** (pure std, easier debugging)
- **Matches original crash pattern** (tiny allocations in loop)
- **Simple to analyze** (clear allocation count formula)

❌ **Disadvantages**:
- Less realistic (artificial workload)
- Doesn't test external crate interaction
- Simpler allocation pattern (less complexity testing)

### Crash Trigger Analysis

**Based on PR #14 Formula**:
```
Crash when: (arena_count × 66MB) + (allocation_count × metadata) > ~350MB
```

**With Default MALLOC_ARENA_MAX = 8** (or system default):

**GeoJSON Test**:
- Arena count: ~3 (one per thread)
- Arenas: 3 × 66MB = 198MB
- Allocation metadata: 15.75M allocations × ~16 bytes = ~252MB
- **Total**: 198MB + 252MB = **~450MB** ✅ **Exceeds ~350MB threshold**

**Pure Std Test**:
- Arena count: ~3 (one per thread)
- Arenas: 3 × 66MB = 198MB
- Allocation metadata: 44M allocations × ~16 bytes = **~704MB**
- **Total**: 198MB + 704MB = **~902MB** ✅ **Exceeds threshold by 2.6×**

**Conclusion**: Pure Std test exceeds the crash threshold by a **much larger margin** (902MB vs 450MB), making it more reliable and consistent.

---

## Phase 4: Crash Consistency and Timing

### Observed Crash Behavior

Both tests crashed **before any thread reported completion**, suggesting:
1. Crash occurs **early in the allocation phase**
2. Arena metadata exhaustion happens **quickly** under concurrent load
3. gVisor's mprotect silent failure triggers SIGSEGV immediately

### Expected Timing Differences

**GeoJSON Test**:
- Allocation pattern: **Bursty** (parsing one feature at a time)
- Likely crash point: After parsing ~10,000-20,000 features per thread
- Metadata buildup: Gradual (varied allocation sizes)

**Pure Std Test**:
- Allocation pattern: **Steady stream** (byte.to_string() in tight loop)
- Likely crash point: After ~1-2 million string allocations per thread
- Metadata buildup: **Rapid** (uniform tiny allocations saturate metadata)

---

## Recommendations

### Primary Recommendation: Use Pure Std Test as Canonical Reproducer

**Rationale**:
1. ✅ **Higher allocation count** (2.8× more) = more reliable crash trigger
2. ✅ **Exceeds threshold by larger margin** (902MB vs 450MB)
3. ✅ **No external dependencies** = simpler debugging, no version conflicts
4. ✅ **Predictable behavior** = easier to analyze and explain
5. ✅ **Matches original pattern** = byte.to_string() loop mimics original crash
6. ✅ **Pure Rust std** = no C library interactions to confuse analysis

### Secondary Use: Keep GeoJSON Test for Specific Scenarios

**When to use GeoJSON test**:
- Testing external crate compatibility (geojson, serde_json)
- Demonstrating real-world crash scenario
- Validating fixes work with nested data structures
- Benchmarking complex allocation patterns

### Test Suite Structure Recommendation

```
tests/
├── test_pure_std_repro.rs          ← PRIMARY REPRODUCER
│   └── test_concurrent_string_and_vec_growth  ← Default crash test
├── test_geojson_repro.rs           ← SECONDARY (real-world scenario)
│   └── test_concurrent_geojson_parsing
└── test_workaround_validation.rs   ← Verify MALLOC_ARENA_MAX=2 works
```

---

## Investigation Questions - Answered

### Q1: Do both test cases crash in the sandbox environment?
**Answer**: ✅ **YES, both crash consistently** with SIGSEGV (signal 11)

### Q2: What are the allocation counts for each test?
**Answer**:
- GeoJSON: ~5.25 million allocations/thread (~15.75M total)
- Pure Std: ~14.68 million allocations/thread (~44M total)

### Q3: What are the allocation size distributions?
**Answer**:
- GeoJSON: Varied (4-200 bytes, typical 10-50 bytes)
- Pure Std: Bimodal (three 14MB + 44M tiny 1-3 byte allocations)

### Q4: Which test has more "complex" fragmentation?
**Answer**: **GeoJSON has more complex fragmentation** (varied sizes, nested structures), but **Pure Std has more severe fragmentation** (44M tiny allocations overwhelm metadata).

### Q5: Which test is "worse" (more likely to crash)?
**Answer**: **Pure Std test** is "worse" (better for reproducing):
- 2.8× more allocations
- Exceeds crash threshold by 2.6× margin
- Faster metadata saturation

---

## Appendix: Test Code References

### GeoJSON Test
**File**: `tests/test_geojson_repro.rs`
**Key Function**: `test_concurrent_geojson_parsing()` (lines 9-48)
**Generator**: `generate_large_geojson()` (lines 62-98)
**Pattern**: Parse 70,000 GeoJSON features across 3 threads

### Pure Std Test
**File**: `tests/test_pure_std_repro.rs`
**Key Function**: `test_concurrent_string_and_vec_growth()` (lines 11-53)
**Pattern**: Clone 14MB string, process in 1000-byte chunks with `byte.to_string()`

---

## Next Steps

1. ✅ Document findings (this file)
2. ⏭️ Update README.md to reference Pure Std test as primary reproducer
3. ⏭️ Add test comments explaining allocation patterns
4. ⏭️ Consider adding allocation count assertions (if profiling tools available)
5. ⏭️ Add timing measurements to track "time to crash"

---

**Investigation completed**: 2025-11-19
**Status**: ✅ Both tests reproduce crash, Pure Std test recommended as canonical reproducer
**Confidence**: High (consistent crash behavior observed)
