# Investigation Prompt: System Invariant Analysis via GeoJSON vs Std-Only Patterns

**Investigation ID**: System Invariant & Boundary Condition Analysis
**Date**: 2025-11-18
**Focus**: UNDERSTAND the system, not just reproduce the crash
**Environment**: Requires sandbox with gVisor + kernel 4.4.0 + glibc 2.39

---

## Core Philosophy

**NOT INTERESTED IN**: "Does it crash?" (We already know crashes are reproducible)

**INTERESTED IN**:
- What INVARIANTS does the system assume that get violated?
- What are the PRECISE conditions required for each invariant violation?
- How do DIFFERENT allocation patterns stress the system DIFFERENTLY?
- What are the BOUNDARIES and THRESHOLDS where behavior changes?
- What does this reveal about malloc arena management, gVisor emulation, and their interaction?

---

## Primary Investigation Objectives

### Objective 1: Identify System Invariants Being Violated

**Question**: What assumptions/invariants exist in the malloc → gVisor → kernel chain?

**Potential Invariants to Test**:
1. **Arena address space assumption**: "Each arena's virtual address space will be successfully mapped when needed"
2. **mprotect reliability**: "mprotect returning 0 means memory is now accessible"
3. **Arena metadata capacity**: "Arena metadata structures can handle arbitrary allocation counts"
4. **Virtual memory budget**: "Process can allocate virtual address space up to RLIMIT_AS"
5. **Thread-local arena binding**: "Each thread has stable arena assignment"

**Deliverable**: List of specific invariants violated, with evidence

### Objective 2: Determine Precise Boundary Conditions

**Question**: What are the EXACT thresholds where the system transitions from working to broken?

**Measurements Needed**:
- **Allocation count threshold**: At what count does crash occur? (±10% precision)
- **Arena count interaction**: How does threshold change with 2 vs 3 vs 4 arenas?
- **Allocation size sensitivity**: Does threshold change with different allocation sizes?
- **Virtual memory consumption**: What's the VmSize at crash? (from /proc/self/maps)
- **mprotect call frequency**: How many mprotect calls before failure?

**Deliverable**: Quantified boundaries with measurement methodology

### Objective 3: Characterize Allocation Pattern Differences

**Question**: How do GeoJSON vs std-only patterns stress the system DIFFERENTLY?

**Not just "which crashes more" but**:
- **Allocation rate over time**: Burst vs steady stream
- **Allocation size entropy**: Uniform vs varied distribution
- **Allocation locality**: Sequential vs scattered addresses
- **Deallocation patterns**: Interleaved free() or bulk at end?
- **Memory map fragmentation**: Number of distinct VMA (Virtual Memory Areas) created

**Deliverable**: Pattern characterization showing HOW they differ mechanistically

### Objective 4: Understand the Failure Mechanism Per Pattern

**Question**: Does the failure mechanism differ between patterns, or just the path to reach it?

**Investigate**:
- Do both patterns fail at the same mprotect call site? Or different ones?
- Is the virtual address space exhausted the same way in both?
- Are arena metadata structures stressed differently?
- Does one pattern trigger earlier failure than the other at same allocation count?

**Deliverable**: Mechanism comparison showing convergent vs divergent failure paths

---

## Background: Known Facts from Prior Investigations

### PR #14 Breakthrough: Allocation COUNT is Key Variable

**Discovery**: The crash is triggered by **allocation COUNT**, not total bytes allocated.

**Evidence**:
| Pattern | Calls/Thread | Total Size | Result |
|---------|-------------|------------|---------|
| 4000 × 1KB | 4,000 | 4 MB | ✅ PASS |
| ~4M × tiny | ~4,000,000 | 4 MB | ❌ CRASH |

**Working Hypothesis**: `(arena_count × arena_overhead) + (allocation_count × metadata_per_alloc) > address_space_limit`

### Known System State at Crash

**From /proc/self/maps observations (PR #14)**:
- Baseline VmSize: ~77 MB
- After 3 arenas created: ~275 MB (+198 MB = 66 MB/arena overhead)
- At crash: ~350 MB (inferred gVisor limit)

**From strace observations (PRs #10-14)**:
- mprotect returns 0 (success) but memory isn't actually mapped
- Crash: SIGSEGV with SEGV_MAPERR (address not mapped)
- Crash site: malloc.c:2936 in sysmalloc()

### Unknown/Uncertain

**What we DON'T fully understand yet**:
- Why does gVisor's mprotect fail silently? (Internal limit? Bug?)
- What is the exact per-allocation metadata cost?
- How do allocation patterns affect arena metadata structure growth?
- Are there secondary factors beyond count (e.g., fragmentation effects)?
- Does allocation rate (speed) matter or just total count?

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

## Deep Investigation Questions

### Category 1: Invariant Identification

**Q1.1**: What does glibc's malloc ASSUME about mprotect behavior?
- Read arena.c source or documentation
- Document expected contract: "If mprotect returns 0, memory at addr is accessible"
- How does malloc verify this assumption? (It doesn't - therein lies the bug)

**Q1.2**: What does gVisor ASSUME about address space availability?
- At what point does gVisor decide to fail mprotect?
- Is there a documented limit on virtual address space per process?
- Is this limit configurable?

**Q1.3**: What invariants exist around arena metadata growth?
- How much metadata per allocation? (malloc_chunk structure size)
- Is there a maximum capacity for arena metadata?
- What happens when metadata structures need to grow?

### Category 2: Boundary Condition Measurement

**Q2.1**: What is the minimum allocation count that triggers crash?
- For std-only pattern: Test with varying chunk counts
- For GeoJSON pattern: Test with varying feature counts
- Find the boundary: "N allocations pass, N+1000 crash"

**Q2.2**: How does allocation SIZE affect the count threshold?
- Test: 1-byte allocations vs 10-byte vs 100-byte
- Does smaller size = lower count threshold? (more metadata overhead)
- Or is threshold independent of size?

**Q2.3**: What is the virtual memory consumption curve?
- Measure VmSize at intervals: 0%, 25%, 50%, 75%, 100% of allocations
- Is growth linear? Exponential? Step-wise (per arena)?
- Where is the inflection point?

**Q2.4**: When does the first mprotect failure occur?
- Are there earlier silent failures before the crash?
- How many successful mprotect calls before the fatal one?
- Is there a pattern to which mprotect calls fail?

### Category 3: Pattern Characterization (Mechanistic)

**Q3.1**: Allocation timing profile
- For GeoJSON: When do allocations occur? (bursts per feature? steady?)
- For std-only: Is it truly steady or are there pauses?
- Plot: allocations over time (if measurable)

**Q3.2**: Allocation size distribution
- GeoJSON: Measure actual sizes (histogram of allocation requests)
- Std-only: Measure actual sizes (should be bimodal: 14MB clone + tiny strings)
- Compare: entropy of size distribution

**Q3.3**: Memory map fragmentation
- GeoJSON: How many distinct VMA regions at crash?
- Std-only: How many distinct VMA regions at crash?
- Compare: fragmentation level (lower = more consolidated)

**Q3.4**: Deallocation interleaving
- GeoJSON: Are allocations freed during parsing? (serde_json internals)
- Std-only: All allocations kept until end, then bulk free?
- Impact: Does interleaved free() reduce pressure?

### Category 4: Failure Mechanism Divergence

**Q4.1**: Do both patterns crash at the same instruction?
- Compare strace logs: last syscall before SIGSEGV
- Is it always mprotect? Or sometimes brk/mmap?

**Q4.2**: Do both patterns reach the same virtual memory limit?
- GeoJSON VmSize at crash: ???
- Std-only VmSize at crash: ???
- Are they within 5% of each other?

**Q4.3**: Do both patterns have the same arena utilization?
- How are 3 threads distributed across arenas?
- Does one pattern create more arenas than the other?

**Q4.4**: Do both patterns stress metadata the same way?
- Number of malloc_chunk structures created
- Size of arena metadata overhead
- Are there different bottlenecks?

---

## Investigation Methodology

### Phase 0: System State Baseline (Before Any Testing)

**Understand the clean slate:**

```bash
# Document glibc malloc configuration
getconf GNU_LIBC_VERSION
cat /proc/sys/vm/max_map_count  # Kernel limit on VMAs

# Document gVisor version (if available)
runsc --version

# Document resource limits
ulimit -a > baseline_ulimits.txt

# Document baseline process memory
cat /proc/self/maps | wc -l  # Number of VMAs at startup
```

**Establish baseline measurements**:
- Clean process VmSize: ??? MB
- Number of VMAs at startup: ???
- MALLOC_ARENA_MAX default: ??? (likely 8 × cores)

### Phase 1: Invariant Documentation

**Before running tests, document what SHOULD be true:**

**Step 1.1: Read glibc malloc source (or documentation)**
```bash
# Find glibc source if available, or read online
# Focus on: malloc/arena.c, malloc/malloc.c
# Document:
# - Arena creation logic
# - mprotect usage and assumptions
# - Metadata structures (malloc_chunk, heap_info, malloc_state)
```

**Expected invariants to document**:
1. "mprotect(addr, len, PROT_READ|PROT_WRITE) == 0 implies addr..addr+len is accessible"
2. "Each arena can grow up to HEAP_MAX_SIZE (default 64MB on 64-bit)"
3. "malloc_chunk metadata is 16 bytes per allocation"
4. "Arena count is limited by MALLOC_ARENA_MAX"

**Step 1.2: Read gVisor mprotect implementation (if accessible)**
- Is there source code available?
- Is there documentation on address space limits?
- What are the known gVisor bugs around memory management?

**Step 1.3: Create invariant hypothesis table**

| Invariant | Source | Should Hold? | Will Test |
|-----------|--------|--------------|-----------|
| mprotect==0 → memory accessible | POSIX spec | YES | Observe violation in strace |
| VmSize < RLIMIT_AS | kernel | YES | Measure at crash |
| Arena count ≤ MALLOC_ARENA_MAX | glibc | YES | Observe in /proc/maps |
| Each arena ≤ HEAP_MAX_SIZE | glibc | YES | Measure arena sizes |

**Deliverable**: `SYSTEM_INVARIANTS.md` documenting assumptions

### Phase 2: Boundary Condition Measurement

**Goal**: Find EXACT thresholds, not just "it crashes"

**Step 2.1: Virtual memory consumption tracking**

Create instrumented tests that checkpoint memory usage:

```rust
// Add to both test files
fn log_vmsize(label: &str) {
    let status = std::fs::read_to_string("/proc/self/status").unwrap();
    for line in status.lines() {
        if line.starts_with("VmSize:") {
            eprintln!("[VMSIZE] {}: {}", label, line);
        }
    }
}

// Call at checkpoints:
log_vmsize("start");
// ... allocate 25% ...
log_vmsize("25%");
// ... allocate 50% ...
log_vmsize("50%");
// etc.
```

**Step 2.2: Binary search for minimum crashing allocation count**

For std-only test (more controllable):

```bash
# Modify test to parameterize chunk count
# Test sequence:
# - 14336 chunks (original, crashes)
# - 7168 chunks (half, crashes?)
# - 3584 chunks (quarter, crashes?)
# ... binary search until you find boundary

# Goal: "N chunks passes, N+100 crashes" precision
```

**Step 2.3: Arena count sweep with measurement**

```bash
# For each arena count 1-5:
for ARENAS in 1 2 3 4 5; do
  export MALLOC_ARENA_MAX=$ARENAS

  # Run test with full strace
  strace -ff -tt -o trace_arena${ARENAS}.log \
    cargo test --test test_pure_std_repro ... 2>&1 | tee arena${ARENAS}_output.txt

  # Extract final VmSize before crash/completion
  grep "VmSize" arena${ARENAS}_output.txt | tail -1

  # Count mprotect calls
  grep mprotect trace_arena${ARENAS}.log.* | wc -l
done
```

**Step 2.4: Allocation size sensitivity test**

Modify std-only test to vary allocation sizes:

```rust
// Instead of byte.to_string() (1-3 bytes)
// Try:
// - 1 byte: inner_vec.push(String::from("x"));
// - 10 bytes: inner_vec.push(String::from("xxxxxxxxxx"));
// - 100 bytes: inner_vec.push("x".repeat(100));

// Measure: Does threshold change?
```

**Deliverable**: `BOUNDARY_CONDITIONS.md` with precise measurements

### Phase 3: Deep Pattern Characterization

**Step 3.1: Allocation size distribution (MEASURED, not assumed)**

Use LD_PRELOAD to intercept malloc and log sizes:

```c
// Create malloc_logger.c
#define _GNU_SOURCE
#include <dlfcn.h>
#include <stdio.h>

static void* (*real_malloc)(size_t) = NULL;

void* malloc(size_t size) {
    if (!real_malloc) real_malloc = dlsym(RTLD_NEXT, "malloc");
    fprintf(stderr, "MALLOC,%zu\n", size);
    return real_malloc(size);
}

// Compile: gcc -shared -fPIC malloc_logger.c -o malloc_logger.so -ldl

// Run test:
// LD_PRELOAD=./malloc_logger.so cargo test ... 2> malloc_log.txt
// Parse: grep "MALLOC," malloc_log.txt | cut -d, -f2 | sort -n | uniq -c
```

**Or use strace with filtering:**

```bash
strace -e trace=brk,mmap -o trace.log cargo test ...
# Analyze mmap calls for sizes
grep "mmap.*PROT_READ|PROT_WRITE" trace.log | extract sizes
```

**Step 3.2: Allocation timing profile**

Add timestamps to understand rate:

```rust
use std::time::Instant;

let start = Instant::now();
let mut last_log = start;

for (i, chunk) in content.chunks(1000).enumerate() {
    // ... allocations ...

    if i % 1000 == 0 {
        let now = Instant::now();
        let elapsed = now.duration_since(last_log).as_millis();
        eprintln!("[TIMING] Chunk {}: +{}ms, {}k allocs/sec",
                  i, elapsed, 1000000 / elapsed);
        last_log = now;
    }
}
```

**Analyze**: Is allocation rate constant? Slowing down? Bursty?

**Step 3.3: Memory map fragmentation analysis**

Capture /proc/self/maps at multiple points:

```bash
# In test, periodically:
cat /proc/self/maps > maps_checkpoint_${ITERATION}.txt

# After crash, analyze:
for f in maps_checkpoint_*.txt; do
  echo "$f: $(wc -l < $f) VMAs, $(grep heap $f | wc -l) heap regions"
done
```

**Questions**:
- How many distinct heap regions?
- Are they contiguous or scattered?
- How does fragmentation grow over time?

**Step 3.4: Deallocation pattern analysis**

Instrument to track free():

```rust
// Track allocations kept vs freed
static ALLOC_COUNT: AtomicUsize = AtomicUsize::new(0);

// After each allocation
ALLOC_COUNT.fetch_add(1, Ordering::Relaxed);

// Log periodically
eprintln!("[ALLOCS] Live allocations: {}", ALLOC_COUNT.load(Ordering::Relaxed));
```

**Questions**:
- Does GeoJSON test free during parsing (interleaved)?
- Does std-only test keep everything until end?
- Impact on arena pressure?

**Deliverable**: `PATTERN_CHARACTERIZATION.md` with measurements

### Phase 4: Failure Mechanism Comparison

**Step 4.1: Compare strace logs at failure point**

```bash
# Capture full strace for both
strace -ff -tt -s 200 -o geojson_fail.log cargo test ... 2>&1
strace -ff -tt -s 200 -o std_fail.log cargo test ... 2>&1

# Find the crashing thread
grep SIGSEGV geojson_fail.log.*  # Which thread crashed?

# Extract last 200 syscalls before crash
# Are they similar or different?
diff <(grep mprotect geojson_fail.log.* | tail -200) \
     <(grep mprotect std_fail.log.* | tail -200)
```

**Questions**:
- Same syscall sequence before crash?
- Same mprotect addresses being requested?
- Same failure signature?

**Step 4.2: Compare virtual memory states at crash**

```bash
# Capture memory maps right before crash
# (Add to test: cat /proc/self/maps when detecting imminent crash)

# Compare:
diff geojson_maps_at_crash.txt std_maps_at_crash.txt

# Analyze:
# - Total VmSize
# - Number of heap regions
# - Size of largest heap region
# - Gaps in address space
```

**Step 4.3: Compare arena utilization**

```bash
# From /proc/self/maps, identify arena regions
# Typically: [heap] regions around specific addresses

# Count distinct arenas
grep "\[heap\]" maps_at_crash.txt

# Measure arena sizes
grep "\[heap\]" maps_at_crash.txt | awk '{print $1}' | calculate_sizes

# Compare: Same number of arenas? Same sizes?
```

**Step 4.4: Identify divergence points**

Create timeline comparison:

| Time Point | GeoJSON State | Std-Only State | Divergence? |
|------------|---------------|----------------|-------------|
| 0% complete | VmSize: ??? MB, Arenas: ??? | VmSize: ??? MB, Arenas: ??? | - |
| 25% complete | VmSize: ??? MB, mprotect: ??? calls | VmSize: ??? MB, mprotect: ??? calls | ??? |
| 50% complete | ... | ... | ??? |
| 75% complete | ... | ... | ??? |
| At crash | VmSize: ??? MB | VmSize: ??? MB | ??? |

**Deliverable**: `FAILURE_MECHANISM_COMPARISON.md` showing convergence/divergence

### Phase 5: Synthesis & Model Refinement

**Step 5.1: Update the root cause model**

From PR #14: `(arena_count × 66MB) + (allocation_count × metadata) > ~350MB`

**Refine with measurements**:
- Is 66MB/arena accurate for both patterns?
- What is the actual metadata_per_allocation value? (measure it)
- Is 350MB the true limit or does it vary?
- Are there additional terms? (fragmentation penalty? deallocation effects?)

**Step 5.2: Create invariant violation report**

For each invariant from Phase 1:

| Invariant | Violated? | By Which Pattern? | Evidence | Severity |
|-----------|-----------|-------------------|----------|----------|
| mprotect==0 → accessible | YES | Both | strace shows return 0, crash at addr | CRITICAL |
| VmSize < RLIMIT_AS | NO? | Neither | Measured VmSize < ulimit | - |
| Arena count ≤ MALLOC_ARENA_MAX | NO | Neither | Observed ≤ MAX | - |
| ... | ... | ... | ... | ... |

**Step 5.3: Document system behavior boundaries**

Create phase diagram:

```
Allocation Count (millions)
        ^
        |
    10  |                    CRASH ZONE
        |                  /
     5  |                /
        |              /
     1  |  SAFE    /
        |        /
        +-------------------> Arena Count
           1   2   3   4   5

Boundary line: f(arenas, count) = threshold
```

**Deliverable**: `SYSTEM_MODEL.md` with refined understanding

---

## Hypotheses to Test (Not Assumptions)

**Do NOT assume these are true - MEASURE to confirm or refute**

### Hypothesis 1: Both patterns violate the same invariant (mprotect contract)

**Prediction**: Both crash with same failure signature (mprotect returns 0, SEGV_MAPERR)
**Alternative**: Different failure modes (one via mprotect, one via brk/mmap)
**Test**: Compare strace logs at crash point

### Hypothesis 2: Allocation count threshold is independent of pattern

**Prediction**: If both reach same allocation count, both crash (pattern doesn't matter)
**Alternative**: Pattern characteristics (size, rate, fragmentation) affect threshold
**Test**: Normalize both tests to same allocation count, observe different crash behavior

### Hypothesis 3: Virtual memory limit is the bottleneck (not metadata)

**Prediction**: Both crash at ~350MB VmSize regardless of allocation count
**Alternative**: Metadata structures exhaust before VmSize limit
**Test**: Measure VmSize at crash for different allocation sizes (more small = earlier crash?)

### Hypothesis 4: GeoJSON has lower allocation count due to serde_json efficiency

**Prediction**: GeoJSON < 10M allocations/thread (vs std-only ~14M)
**Alternative**: GeoJSON actually higher due to nested structure overhead
**Test**: Measure actual allocation counts via LD_PRELOAD or strace analysis

### Hypothesis 5: Deallocation pattern affects crash timing

**Prediction**: GeoJSON deallocates during parsing, reducing pressure (later/no crash)
**Alternative**: Both keep allocations until end, same pressure
**Test**: Instrument to track live allocation count over time

### Hypothesis 6: Arena overhead is constant (66MB per arena)

**Prediction**: Arena overhead same for both patterns
**Alternative**: Pattern characteristics affect arena structure size
**Test**: Measure actual arena sizes from /proc/self/maps for both patterns

### Hypothesis 7: mprotect failure is deterministic (always at same VmSize)

**Prediction**: First mprotect failure occurs at same VmSize across runs/patterns
**Alternative**: Failure point varies based on allocation history
**Test**: Run multiple times, record VmSize at first mprotect failure

---

## Deliverables (Evidence-Based)

### Primary Deliverable: `SYSTEM_INVARIANTS.md`

**Structure**:
```markdown
# System Invariants and Violations

## Invariants Tested

### Invariant 1: mprotect Contract
**Statement**: "If mprotect(addr, len, prot) returns 0, then memory at addr...addr+len is accessible with permissions prot"
**Source**: POSIX specification, glibc malloc assumptions
**Expected**: ALWAYS TRUE
**Observed**: VIOLATED (evidence: strace line 12845, mprotect returns 0, SIGSEGV at offset 10840)
**Patterns Affected**: Both GeoJSON and std-only
**Severity**: CRITICAL - breaks fundamental kernel/glibc contract

### Invariant 2: ...
[Continue for each invariant]

## Novel Invariants Discovered

[Document any NEW invariants discovered during investigation]
```

### Secondary Deliverable: `BOUNDARY_CONDITIONS.md`

**Structure**:
```markdown
# Precise Boundary Conditions

## Allocation Count Threshold

**Measurement Method**: Binary search with std-only test, varied chunk counts
**Result**: Crash occurs at N ± X allocations/thread
**Confidence**: ±Y% (based on measurement precision)

**Arena Count Interaction**:
| Arenas | Min Crashing Count | VmSize at Crash |
|--------|-------------------|-----------------|
| 1      | N/A (never crashes) | - |
| 2      | N/A (never crashes) | - |
| 3      | XXX million | YYY MB |
| 4      | ZZZ million | WWW MB |

## Virtual Memory Limit

**Measured Limit**: ~XXX MB ± YY MB
**Evidence**: [multiple runs data]
**Confidence**: ±Z%

[Continue with other boundaries]
```

### Tertiary Deliverable: `PATTERN_COMPARISON.md`

**Structure**:
```markdown
# GeoJSON vs Std-Only: Mechanistic Comparison

## Pattern Characteristics (MEASURED)

| Characteristic | GeoJSON | Std-Only | Measurement Method |
|----------------|---------|----------|-------------------|
| Allocation count/thread | X.X million | Y.Y million | [method] |
| Allocation rate | XX k/sec | YY k/sec | Timestamp analysis |
| Size distribution | [histogram] | [histogram] | LD_PRELOAD logging |
| Fragmentation (VMAs) | XX regions | YY regions | /proc/self/maps |
| Deallocation pattern | Interleaved | Bulk | Instrumentation |

## Failure Mechanism Comparison

**GeoJSON Failure Path**:
1. [Step by step with evidence]
2. [...]

**Std-Only Failure Path**:
1. [Step by step with evidence]
2. [...]

**Divergence Points**: [Where do they differ?]
**Convergence Points**: [Where are they the same?]

## Hypothesis Testing Results

| Hypothesis | Result | Evidence | Confidence |
|------------|--------|----------|------------|
| H1: Same invariant violated | CONFIRMED/REFUTED | [evidence] | XX% |
| H2: Count threshold independent | CONFIRMED/REFUTED | [evidence] | YY% |
[...]
```

### Quaternary Deliverable: `SYSTEM_MODEL_REFINED.md`

**Structure**:
```markdown
# Refined System Model

## Original Model (from PR #14)

Crash when: `(arena_count × 66MB) + (allocation_count × metadata) > ~350MB`

## Refined Model (based on measurements)

Crash when: `f(arena_count, allocation_count, size_distribution, rate) > limit`

**Refined formula**:
[Mathematical expression with measured coefficients]

**Coefficient Values**:
- arena_overhead: XX.X MB (measured, was 66MB estimate)
- metadata_per_alloc: Y.YY bytes (measured)
- fragmentation_factor: Z.ZZ (new term discovered)
- address_space_limit: WWW MB (measured, was ~350MB estimate)

**Model Accuracy**: Tested against N data points, error ±X%

## Phase Diagram

[ASCII or description of safe vs crash zones]

## Predictive Power

**Can we predict crash for new patterns?**
- Test case A: Predicted [crash/safe], Actual [crash/safe] ✓/✗
- Test case B: ...
```

---

## Investigation Scope & Boundaries

### In Scope (Deep Understanding)
✅ **Invariant identification** - What assumptions are violated?
✅ **Precise boundary measurement** - Exact thresholds (±10% precision)
✅ **Mechanistic comparison** - HOW do patterns stress system differently?
✅ **Model refinement** - Improve predictive formula from PR #14
✅ **Evidence preservation** - All measurements, logs, analysis scripts
✅ **Hypothesis testing** - Confirm or refute 7 hypotheses listed above

### Out of Scope (Acknowledged Limitations)
❌ Fixing the crash (workaround known: `MALLOC_ARENA_MAX=2`)
❌ gVisor source code modification
❌ glibc source code modification
❌ Developing new allocator
❌ Performance optimization (not the goal)

### Explicitly NOT Success (Avoid These)
❌ "Both tests crash" → Too shallow, we need WHY and HOW
❌ "Std-only is worse" → Need quantified measurements, not rankings
❌ "Use test X as canonical" → Not the goal, understanding is the goal
❌ "It crashes at ~350MB" → Too vague, need precision and variance

### Success Criteria (Evidence-Based)
✅ **At least 3 invariants** documented with violation evidence
✅ **Allocation count threshold** measured with ±10% precision
✅ **Virtual memory limit** measured across 5+ runs with variance
✅ **Both patterns characterized** with measured (not estimated) data
✅ **Refined model** that predicts crash for new patterns (testable)
✅ **Hypothesis test results** for all 7 hypotheses (confirmed/refuted with confidence)
✅ **Mechanistic understanding** of divergence points between patterns

### Quality Bar
- All measurements documented with methodology
- All conclusions supported by specific evidence (line numbers, log excerpts)
- All estimates accompanied by confidence intervals
- All code modifications committed with explanation
- All negative results documented (what DIDN'T work or apply)

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

## Investigation Duration Estimate

**Phase 0** (System baseline): 30-45 min
**Phase 1** (Invariant documentation): 1-2 hours (includes reading glibc source/docs)
**Phase 2** (Boundary measurement): 2-3 hours (includes binary search, multiple runs)
**Phase 3** (Pattern characterization): 2-3 hours (includes instrumentation)
**Phase 4** (Failure mechanism comparison): 1-2 hours (includes strace analysis)
**Phase 5** (Synthesis & model refinement): 1-2 hours (includes hypothesis testing)

**Total**: ~8-12 hours for rigorous, scientific investigation

**Shallow investigation** (just crash verification): 1-2 hours - **NOT ACCEPTABLE**
**Deep investigation** (understanding system): 8-12 hours - **REQUIRED**

---

## Starting Point

### Before You Begin
1. **Read this entire prompt** (don't skip to testing)
2. **Understand the philosophy**: We're studying the SYSTEM, not just reproducing crashes
3. **Prepare for measurement**: Have tools ready (strace, LD_PRELOAD malloc logger, /proc access)
4. **Set expectations**: This is scientific investigation, not QA testing

### Phase Execution Order (STRICT)
1. **Phase 0**: Baseline (understand clean state)
2. **Phase 1**: Invariants (document assumptions BEFORE testing)
3. **Phase 2**: Boundaries (measure precisely, not approximately)
4. **Phase 3**: Patterns (characterize mechanistically)
5. **Phase 4**: Mechanisms (compare failure paths)
6. **Phase 5**: Synthesis (refine model, test hypotheses)

**Do NOT skip phases.** Each builds on the previous.

### Commit Strategy
- Commit after each phase with findings
- Commit instrumentation code changes
- Commit raw data (strace logs, measurements)
- Commit analysis scripts

### Documentation Standard
Every deliverable must include:
- **Measurement methodology**: HOW was this measured?
- **Raw data**: Where is the source data?
- **Confidence assessment**: How certain are we?
- **Limitations**: What couldn't be measured?

---

## Red Flags (Stop and Reassess If You Find Yourself...)

🚩 "It crashes, investigation complete" → NO, understand WHY
🚩 "I'll estimate this instead of measuring" → NO, measure it
🚩 "This is close enough" → NO, we need precision
🚩 "Pattern X is worse" → NO, quantify the difference mechanistically
🚩 "I'll skip this phase, it's not important" → NO, follow methodology
🚩 "Both tests behave the same" → Probably missed something, dig deeper

---

## Success Looks Like

At the end, you should be able to answer:

1. **What invariants are violated?** → "mprotect contract violated: returns 0 but addr unmapped"
2. **What are the precise boundaries?** → "Crash at 4.2M ± 0.3M allocations/thread with 3 arenas"
3. **How do patterns differ?** → "GeoJSON: 3.1M allocs at 45k/sec, Std: 14.3M at 120k/sec"
4. **Why does it crash?** → "Formula: (3 × 68MB) + (14.3M × 24B) > 547MB, gVisor limit exceeded"
5. **Can we predict new patterns?** → "Yes, test with 5M allocs predicted crash, observed crash ✓"

---

**Begin investigation when ready. Remember: UNDERSTAND the system, don't just verify crashes.**

Scientific rigor is non-negotiable. 🔬
