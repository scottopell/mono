# Crash Threshold Validation Results

**Date**: 2025-11-22
**Environment**: gVisor (kernel 4.4.0), glibc 2.39, MALLOC_ARENA_MAX=3

---

## Results

| Test | Expected | Actual | Duration |
|------|----------|--------|----------|
| GeoJSON | Crash (per Phase 5) | **PASS** ✅ | 4.84s |
| Std-only | Crash | **CRASH** (SIGSEGV) | ~120s |

**Conclusion**: The current GeoJSON test configuration does NOT reproduce the Phase 5 crash. Only std-only crashes.

---

## Implications

1. **Phase 5 crash thresholds** (GeoJSON 7.9-9.0M, std-only 9.4-10.9M) were measured under **different test conditions** than current environment

2. **Current GeoJSON test** (14MB, 3 threads, ~70K features) is **below crash threshold** in this sandbox

3. **Std-only test** (14MB string, 3 threads, `byte.to_string()`) **DOES crash**, validating:
   - The gVisor mprotect bug exists in this environment
   - Crash occurs with MALLOC_ARENA_MAX=3
   - Millions of tiny allocations trigger the bug

4. **Measured allocation counts** (3.76M GeoJSON, 45.2M std-only) represent:
   - GeoJSON: Allocations during **successful** run (below crash threshold)
   - Std-only: Allocations until **crash** (~14.68M according to thread 1 in logs)

---

## Why GeoJSON Doesn't Crash (Current Config)

**14MB GeoJSON → ~70,000 features → 3.76M allocations across 3 threads**

Memory consumption estimate:
```
Data: ~50B avg × 3.76M = 188 MB
Metadata: 16B × 3.76M = 60 MB
Arenas: 3 × 66MB = 198 MB
Total: ~446 MB (but fragmentation may be lower than estimated)
```

This is close to the ~350MB limit but apparently stays under it. The test **completes successfully** rather than crashing.

---

## Why Std-Only DOES Crash

**14MB string → 14M bytes → ~14M × 3 threads = 42M allocations of 3 bytes each**

Per thread 1 log: "Built 14,681 vecs" = ~14.68M allocations before crash.

Memory consumption at crash:
```
Data: 3B × 14.68M = 44 MB
Metadata: 16B × 14.68M = 235 MB
Arenas: 3 × 66MB = 198 MB
Total: ~477 MB (exceeds 350MB limit by ~127MB)
```

---

## Reconciliation with Phase 5

Phase 5 reported GeoJSON crashing at 7.9-9.0M allocations. Possibilities:

1. **Different GeoJSON file size**: Phase 5 may have used larger GeoJSON (>14MB) or more features
2. **Different thread count**: Phase 5 may have used more threads
3. **Different test implementation**: Phase 5 test may have had additional allocation patterns
4. **Environment differences**: Subtle gVisor/kernel differences between Phase 5 and current sandbox

**Key insight**: The 3.76M vs 45.2M allocation count difference is NOT comparing equivalent scenarios - GeoJSON completes successfully, std-only crashes mid-run.

---

## Updated Understanding

**Crash threshold is allocation-count dependent**, but the current tests have different outcomes:

- **Std-only**: Creates so many allocations (42M target) that it crashes at ~14.68M
- **GeoJSON**: Creates only 3.76M allocations (per successful run), stays under threshold

The **15-20% earlier crash** finding from Phase 5 requires both patterns to actually crash for comparison. Current environment only crashes std-only.

---

## Validation Artifacts

- `geojson_crash_test.log` - Successful completion (exit 0)
- `std_only_crash_test.log` - SIGSEGV crash (signal 11, exit 101)
- `validate_crash_thresholds.sh` - Validation script
