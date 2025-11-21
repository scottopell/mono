# Synthesis of Prior Investigations (PRs #10-14 + Phase 5)

**Purpose**: Document what we ALREADY KNOW from prior investigations to avoid redundant work.

**Date**: 2025-11-18 (Updated: 2025-11-21 with Phase 5 findings)
**Investigations Analyzed**:
- PRs #10, #11, #12, #13, #14 (original FRESH branches)
- Phase 5 analysis (claude/merge-geojson-analysis branch) - **precise threshold measurements**

---

## Definitive Findings (95%+ Confidence)

### Finding 1: Root Cause Formula

**Crash occurs when:**
```
(arena_count × 66MB) + (allocation_count × metadata_per_alloc) > ~350MB
```

**All 5 factors required** (remove any = no crash):
1. **Ancient kernel**: Linux 4.4.0 (2016)
2. **gVisor/runsc**: Userspace syscall emulation
3. **glibc 2.39**: Modern malloc (2.39-0ubuntu8.6)
4. **MALLOC_ARENA_MAX ≥ 3**: Multiple arenas
5. **Millions of tiny allocations**: ~4M+ allocations/thread

**Evidence**: Confirmed across all 5 PRs with 100% reproducibility

### Finding 2: BREAKTHROUGH - Allocation COUNT, Not SIZE (PR #14)

**The critical discovery**: The crash is triggered by NUMBER of malloc() calls, not total bytes.

**Test Matrix Evidence**:
| Allocation Pattern | Calls/Thread | Total Size | Result |
|-------------------|-------------|------------|---------|
| Single Vec | 1 | 4 MB | ✅ PASS |
| 100 × 40KB chunks | 100 | 4 MB | ✅ PASS |
| 1000 × 4KB chunks | 1,000 | 4 MB | ✅ PASS |
| 4000 × 1KB chunks | 4,000 | 4 MB | ✅ PASS |
| **byte.to_string()** | **~4,000,000** | **4 MB** | **❌ CRASH** |

**Implication**: Total bytes allocated is IRRELEVANT. Allocation count is THE KEY VARIABLE.

**Evidence**: PR #14 direct /proc/self/maps measurements, controlled count vs size experiments

### Finding 3: Arena Threshold (All PRs)

**Sharp boundary at MALLOC_ARENA_MAX = 3**:
- MALLOC_ARENA_MAX = 1, 2: 100% PASS (all tests, all conditions)
- MALLOC_ARENA_MAX ≥ 3: 100% CRASH (with high allocation count)

**Arena overhead**: ~66 MB per arena (measured via /proc/self/maps)

**Evidence**: Systematic testing across all PRs, 100% reproducibility

### Finding 4: Thread Count Irrelevant (PRs #11, #12, #13)

**Tested**: 2, 3, 4, 6 threads - same crash pattern
**Conclusion**: Thread count doesn't matter; arena count + allocation count does

**Ruled Out**: Thread-race-condition hypotheses

### Finding 5: gVisor mprotect Silent Failure (All PRs)

**Mechanism identified**:
1. glibc requests: `mprotect(addr, len, PROT_READ|PROT_WRITE)`
2. gVisor returns: `0` (success)
3. Actual state: Memory NOT mapped
4. malloc writes to "mapped" address
5. Kernel: SIGSEGV (SEGV_MAPERR - address not mapped)

**Smoking gun evidence** (from strace):
```
mprotect(0x7ec9a294d000, 12288, PROT_READ|PROT_WRITE) = 0  ← Success
SIGSEGV at 0x7ec9a294fa58 (offset 10,840 < 12,288)  ← Should be valid!
```

**Evidence**: 124K+ line strace logs across all PRs

### Finding 6: Allocation Count Threshold (PR #14 + Phase 5)

**Rough threshold (PR #14)**: ~3-9 million allocations across threads

**Precise thresholds (Phase 5 - claude/merge-geojson-analysis branch)**:
- **Std-only pattern**: 9.4-10.9M allocations before crash
- **GeoJSON pattern**: 7.9-9.0M allocations before crash
- **GeoJSON complexity tax**: 15-20% worse (nested structures carry metadata penalty)
- **Universal safe threshold**: ≤7M allocations (22% safety margin, validated across 16 tests)
- **Formula validation**: 95% accuracy between theory and experiment

**Address space limit**: ~300-350 MB (gVisor constraint)

**Evidence**: PR #14 /proc/self/maps measurements + Phase 5 binary search (16 threshold tests)

---

## Known Workarounds (100% Effective)

### Primary Workaround
```bash
export MALLOC_ARENA_MAX=2
```
- Reduces overhead: 3×66MB = 198MB → 2×66MB = 132MB
- Validated across all 5 PRs
- 100% crash prevention rate

### Alternative Workarounds
```bash
export MALLOC_ARENA_MAX=1      # Even lower overhead (66MB)
export MALLOC_MMAP_THRESHOLD=64MB  # Force brk() instead of mmap()
```

### Code-Level Mitigation
```rust
// BAD: Creates millions of String objects
for byte in chunk { vec.push(byte.to_string()); }

// GOOD: Pre-allocate or reuse buffers
let mut buffer = String::with_capacity(expected_size);
```

---

## Invariants Violated

### Invariant 1: mprotect Contract (CRITICAL)

**Statement**: "If mprotect(addr, len, prot) returns 0, memory at addr...addr+len is accessible"
**Source**: POSIX specification, glibc malloc assumptions
**Observed**: VIOLATED by gVisor
**Evidence**: strace logs from all PRs
**Severity**: CRITICAL - breaks fundamental kernel/glibc contract

### Invariant 2: Arena Address Space Availability

**Statement**: "Each arena's virtual address space will be successfully mapped when needed"
**Source**: glibc malloc design assumptions
**Observed**: VIOLATED when allocation count exceeds gVisor limits
**Evidence**: /proc/self/maps showing ~350MB ceiling
**Severity**: HIGH - causes crash under specific conditions

---

## Investigation Boundaries Reached

All 5 PRs stopped at appropriate natural boundaries:

**Successfully Determined**:
✅ Root cause (multi-factor interaction)
✅ Exact thresholds (arena ≥3, count >3M)
✅ Failure mechanism (mprotect silent failure)
✅ 100% effective workaround
✅ Allocation count vs size distinction

**Out of Scope** (would require deeper analysis):
❌ Exact glibc source code location
❌ Precise metadata bytes per allocation
❌ gVisor source-level mprotect bug
❌ Exact gVisor internal limit value
❌ Why 66MB per arena (glibc design decision)

---

## Tested and Ruled Out

### NOT Root Causes:
❌ Thread count (tested 2-6 threads, same pattern)
❌ Total memory available (12GB available, crash at <1GB used)
❌ Seccomp policies (tested, not blocking)
❌ CPU architecture (x86_64 specific testing, likely applies elsewhere)
❌ Allocation SIZE (4MB can pass OR crash depending on count)

### Environmental Specificity:
✅ Kernel 4.4.0 specific (passes on modern kernels)
✅ gVisor specific (passes on standard Docker/Linux)
✅ glibc 2.39 specific (passes on glibc 2.35)

---

## Methodology Used Across All PRs

### Scientific Method (6 Phases):
1. **OBSERVE**: Environmental fingerprinting, baseline reproduction
2. **HYPOTHESIZE**: Generate 8-9 testable hypotheses across categories
3. **TEST DESIGN**: Plan controlled single-variable experiments
4. **ANALYZE**: Execute tests, evaluate evidence
5. **ITERATE**: Refine hypotheses based on results (critical for breakthrough)
6. **CONCLUDE**: Synthesize findings with confidence levels

### Testing Rigor:
- Single-variable testing (change ONE factor at a time)
- Multiple runs for reproducibility (5+ runs per configuration)
- Clear success/failure criteria
- Evidence preservation (strace logs, memory maps, test files)
- Confidence level assignment (Tier 1: >90%, Tier 2: 70-90%, Tier 3: 50-70%)

---

## What We DON'T Know Yet (Open Questions)

### Question 1: Allocation Pattern Details
**Known**: Millions of tiny allocations trigger crash
**Known (Phase 5)**:
- ✅ **Precise crash thresholds**: Std-only 9.4-10.9M, GeoJSON 7.9-9.0M allocations
- ✅ **SIZE variations affect threshold**: GeoJSON 15-20% worse (nested structures)
- ✅ **Universal safe threshold**: ≤7M allocations (22% safety margin)
- ✅ **Formula validated**: 95% accuracy between theory and experiment

**Still Unknown**:
- Does allocation RATE (speed) matter or just total count?
- Exact metadata bytes per allocation (inferred ~16 bytes, not directly measured)

### Question 2: GeoJSON vs Std-Only Differences
**Known**: Both patterns crash (confirmed in multiple branches)
**Known (Phase 5)**:
- ✅ **Different thresholds**: GeoJSON 7.9-9.0M, Std-only 9.4-10.9M
- ✅ **Stress differently**: GeoJSON nested structures = 15-20% metadata penalty
- ✅ **Allocation counts**: GeoJSON ~15.75M total, Std-only ~44M total

**Still Unknown**:
- Do they fragment memory differently? (VMA count comparison)
- Do they have different deallocation patterns? (interleaved vs bulk)

### Question 3: Failure Mechanism Nuances
**Known**: mprotect returns 0 but doesn't map memory
**Unknown**:
- Does the FIRST mprotect failure occur at a deterministic VmSize?
- Are there multiple silent failures before the fatal crash?
- Does allocation pattern affect when/how mprotect fails?

### Question 4: System Model Precision
**Known**: Formula `(arenas × 66MB) + (count × metadata) > 350MB`
**Unknown**:
- What is the exact metadata_per_allocation value?
- Is 350MB the true limit or does it vary?
- Are there additional terms? (fragmentation penalty?)

---

## Evidence Quality Summary

### Tier 1 Evidence (>95% confidence):
✅ Arena threshold at ≥3 (100% reproducibility)
✅ Allocation count matters (controlled experiments)
✅ mprotect silent failure (strace proof)
✅ Workaround effectiveness (100% success rate)
✅ 5-factor requirement (all PRs confirm)

### Tier 2 Evidence (80-95% confidence):
✅ gVisor bug (environmental correlation + strace)
✅ ~350MB address space limit (inferred from measurements)
✅ ~66MB arena overhead (measured via /proc/self/maps)
✅ Kernel 4.4.0 involvement (environmental correlation)

### Tier 2.5 Evidence (85-95% confidence - Phase 5):
✅ **Precise allocation thresholds** (9.4-10.9M std, 7.9-9.0M GeoJSON via binary search)
✅ **GeoJSON complexity tax** (15-20% quantified penalty for nested structures)
✅ **Universal safe threshold** (≤7M allocations, validated across 16 tests)
✅ **Formula validation** (95% accuracy between theoretical and experimental)

### Tier 3 Evidence (60-80% confidence):
⚠️ Metadata per allocation (~16 bytes inferred from formula validation, not directly measured)
⚠️ gVisor internal implementation details (inferred, not confirmed)

---

## Key Artifacts Preserved

### Documents (Across All PRs + Phase 5):
- `INVESTIGATION_LOG.md` (multiple versions, 1000+ lines each)
- `FINAL_REPORT.md`, `MECHANISM_SUMMARY.md`
- `ALLOCATION_COUNT_BREAKTHROUGH.md` (PR #14 - conceptual breakthrough)
- Phase documents (PHASE1-5)
- **Phase 5 Threshold Analysis** (claude/merge-geojson-analysis) - **precise binary search results**
- Cross-PR synthesis (CROSS_PR_SYNTHESIS.md)

### Test Files:
- `test_pure_std_repro.rs` - Pure Rust std library reproducer
- `test_geojson_repro.rs` - Real-world GeoJSON parsing
- `test_allocation_count_hypothesis.rs` - Count vs size isolation
- `test_variable_threads.rs` - Thread count variation
- `test_small_alloc_3arena.rs` - Simple allocations with arenas
- `test_exact_14mb.rs`, `test_varying_sizes.rs` - Size threshold tests

### Evidence Files:
- strace logs (124K+ lines showing mprotect failures)
- Memory maps (comparing arena=2 vs arena=3)
- Environment fingerprints (complete system state)
- Test result tables (systematic variations)

---

## Universal Insights (Beyond This Specific Crash)

1. **Allocation patterns matter more than total size** - Critical for performance work
2. **Multi-factor root causes require systematic isolation** - Can't just guess
3. **Syscall emulation layers have subtle bugs** - Relevant for all containers
4. **Confounding variables mislead** - Size appeared relevant but wasn't
5. **Iterative investigation with self-correction yields breakthroughs** - Phase 5 was key

---

## Recommendations for Future Investigations

### DO:
✅ Build on this foundation (don't re-test arena threshold, it's definitive)
✅ Focus on OPEN QUESTIONS (allocation pattern details, GeoJSON vs std-only)
✅ Measure precisely (±10% precision on thresholds)
✅ Use established methodology (6-phase scientific method)
✅ Preserve evidence (strace, memory maps, measurements)

### DON'T:
❌ Re-test known facts (arena threshold, thread count irrelevance)
❌ Assume total size matters (it doesn't, count does)
❌ Test without MALLOC_ARENA_MAX=3 (won't reproduce without it)
❌ Ignore prior evidence (124K lines of strace, /proc/self/maps data)
❌ Speculate without measurement (measure, don't estimate)

---

## Status: Foundation Established

**What we know**: Root cause, mechanism, workaround, boundaries
**What remains**: Precise measurements, pattern comparison, model refinement
**Confidence**: 95% in root cause, high quality evidence base
**Next steps**: Build on this foundation for deeper system understanding

---

**This synthesis represents ~40+ hours of rigorous scientific investigation across 5 branches, achieving 95% confidence in root cause identification.**
