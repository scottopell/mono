# Sandbox LLM Agent Prompt: GeoJSON vs Std-Only Pattern Analysis

You are an AI agent running in a gVisor sandbox environment with kernel 4.4.0 and glibc 2.39. Your task is to conduct a precision measurement investigation of malloc allocation patterns.

## Your Mission

Execute a 3-4 hour investigation comparing two malloc allocation patterns (GeoJSON vs std-only) to refine a 95% confident root cause model from 5 prior investigations.

## Getting Started

```bash
# Step 1: Checkout the investigation branch
git fetch origin FRESH-analyze-geojson-vs-std-allocation-patterns
git checkout FRESH-analyze-geojson-vs-std-allocation-patterns
cd glibc-malloc-crash

# Step 2: Read the START_HERE.md guide
cat START_HERE.md
```

## What You'll Find on the Branch

1. **START_HERE.md** - Your step-by-step guide (READ THIS FIRST)
2. **PRIOR_INVESTIGATIONS_SYNTHESIS.md** - Summary of 5 prior investigations, known facts with 95% confidence
3. **PROMPT_GEOJSON_VS_STD_REFINED.md** - Detailed investigation methodology with code examples

## Your Objectives

Measure 4 things with precision:

1. **Allocation counts** (±10% precision) - Use LD_PRELOAD malloc counter
2. **Size distributions** - Create histograms of allocation sizes
3. **Deallocation patterns** - Track live allocations over time
4. **Memory fragmentation** - Count VMAs from /proc/self/maps

## Known Facts (DO NOT RE-TEST)

From 5 prior investigations (PRs #10-14):
- ✅ Root cause: `(arenas × 66MB) + (count × metadata) > ~350MB`
- ✅ Arena threshold: MALLOC_ARENA_MAX ≥ 3 (100% reproducible)
- ✅ Allocation COUNT matters, not SIZE (PR #14 breakthrough)
- ✅ Thread count irrelevant (tested 2-6 threads)
- ✅ Workaround: `MALLOC_ARENA_MAX=2` (100% effective)

**Your job**: Refine the model with PRECISE measurements, not re-prove these facts.

## Expected Deliverables

Create 3 markdown files:

1. **ALLOCATION_COUNTS.md** - Measured counts with ±10% precision
2. **PATTERN_CHARACTERIZATION.md** - Size distributions, deallocation patterns, fragmentation
3. **REFINED_MODEL.md** - Updated formula with measured coefficients

## Success Looks Like

At completion, you should state:

- "GeoJSON: X.XX ± 0.YY million allocations; Std-only: A.AA ± 0.BB million"
- "GeoJSON allocates at ZZ k/sec with varied sizes; Std-only at WW k/sec with tiny sizes"
- "Refined model: (arenas × AA MB) + (count × BB bytes) > CCC MB with ±DD% error"
- "Validated: predicted crash at V million, observed at W million (within ±E%)"

## Time Budget

- Phase 1 (Allocation counts): 60-90 min
- Phase 2 (Pattern characterization): 60-90 min
- Phase 3 (Model refinement): 30-60 min
- **Total**: 3-4 hours

## Critical Instructions

🎯 **Follow START_HERE.md step-by-step**
📖 **Read PRIOR_INVESTIGATIONS_SYNTHESIS.md before testing** (skip redundant work)
📏 **Measure precisely** (±10% precision, not rough estimates)
🚫 **Don't re-test arena threshold or thread count** (already definitive)
💾 **Commit your findings** before finishing

## Quick Environment Check

```bash
# Verify you're in the right environment
getconf GNU_LIBC_VERSION  # Should be 2.39
uname -r                   # Should be 4.4.0 (gVisor)

# Sanity check - this should crash
cargo test --test test_pure_std_repro test_concurrent_string_and_vec_growth -- --nocapture
```

If the test doesn't crash, your environment doesn't match. Investigation results will be invalid.

---

**Begin by reading glibc-malloc-crash/START_HERE.md and following its 4-step process.**

Build on 40 hours of prior rigorous investigation. Measure precisely. Document methodology. Create reproducible evidence.

🔬 Scientific rigor. ⏱️ Time efficiency. 📊 Precision measurements.
