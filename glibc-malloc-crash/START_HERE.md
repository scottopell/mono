# START HERE: GeoJSON vs Std-Only Allocation Pattern Investigation

**Branch**: `FRESH-analyze-geojson-vs-std-allocation-patterns`
**Investigation Type**: Precision measurement building on 5 prior investigations
**Duration**: 3-4 hours (streamlined, skips redundant testing)

---

## Quick Start

### Step 1: Read Prerequisites (15 min)

**REQUIRED READING** (in order):
1. `PRIOR_INVESTIGATIONS_SYNTHESIS.md` - What we ALREADY KNOW (95% confident root cause)
2. `PROMPT_GEOJSON_VS_STD_REFINED.md` - Investigation methodology

**Key Takeaway**: We have 95% confident root cause from PRs #10-14. This investigation measures PRECISE allocation counts and pattern differences to refine the model, NOT re-prove known facts.

### Step 2: Verify Environment (5 min)

```bash
# Must match prior investigation environment
getconf GNU_LIBC_VERSION  # Expected: 2.39
uname -r                   # Expected: gVisor kernel 4.4.0
echo $MALLOC_ARENA_MAX     # Expected: unset (defaults to 8×cores)

# Quick sanity check - should crash
cd glibc-malloc-crash
cargo test --test test_pure_std_repro test_concurrent_string_and_vec_growth -- --nocapture
# If doesn't crash: environment doesn't match, investigation invalid
```

### Step 3: Execute Investigation (3-4 hours)

Follow `PROMPT_GEOJSON_VS_STD_REFINED.md` phases:

**Phase 1** (60-90 min): Allocation count measurement
- Create LD_PRELOAD malloc counter (code provided in prompt)
- Run both tests, extract precise counts
- Deliverable: `ALLOCATION_COUNTS.md`

**Phase 2** (60-90 min): Pattern characterization
- Measure size distributions
- Measure deallocation patterns
- Measure memory fragmentation
- Deliverable: `PATTERN_CHARACTERIZATION.md`

**Phase 3** (30-60 min): Model refinement
- Calculate metadata per allocation from measurements
- Refine formula with measured coefficients
- Validate predictions
- Deliverable: `REFINED_MODEL.md`

### Step 4: Commit Findings

```bash
git add glibc-malloc-crash/ALLOCATION_COUNTS.md \
        glibc-malloc-crash/PATTERN_CHARACTERIZATION.md \
        glibc-malloc-crash/REFINED_MODEL.md \
        glibc-malloc-crash/malloc_counter.c \
        glibc-malloc-crash/malloc_counter.so

git commit -m "GeoJSON vs std-only pattern analysis: measured counts and refined model"
git push origin FRESH-analyze-geojson-vs-std-allocation-patterns
```

---

## What We're Measuring (Not Re-Testing)

### ✅ Measure (New Data)
- Precise allocation counts (±10% precision)
- Size distribution histograms
- Deallocation timing patterns
- Memory fragmentation (VMA counts)
- Refined model coefficients

### ❌ Skip (Already Known)
- Arena threshold (KNOWN: ≥3, 100% reproducible)
- Thread count effects (KNOWN: irrelevant)
- Root cause mechanism (KNOWN: mprotect silent failure)
- Workaround validation (KNOWN: MALLOC_ARENA_MAX=2 100% effective)

---

## Success Criteria

At completion, you should state precisely:

1. **Allocation counts**: "GeoJSON: X.XX ± Y.YY million, Std-only: A.AA ± B.BB million"
2. **Pattern difference**: "GeoJSON: [rate, size profile, deallocation]; Std-only: [same]"
3. **Refined model**: "(arenas × AA MB ± X%) + (count × BB bytes ± Y%) > CCC MB ± Z%"
4. **Validation**: "Model predicted crash at W million, observed at V million (±D%)"

---

## Key Files on This Branch

- `PRIOR_INVESTIGATIONS_SYNTHESIS.md` - Comprehensive summary of PRs #10-14
- `PROMPT_GEOJSON_VS_STD_REFINED.md` - Detailed methodology (READ THIS)
- `INVESTIGATION_BRANCHES.md` - Guide to investigation workflow
- `tests/test_geojson_repro.rs` - GeoJSON test case
- `tests/test_pure_std_repro.rs` - Std-only test case

---

## Red Flags (Stop If You Find Yourself...)

🚩 Re-testing arena threshold → It's definitive (≥3), skip it
🚩 Re-testing thread count → It's irrelevant, skip it
🚩 Estimating instead of measuring → Use LD_PRELOAD to measure
🚩 Taking >4 hours → You're re-testing known facts, refocus

---

**Begin with Step 1. Read the prerequisites before starting measurements.**
