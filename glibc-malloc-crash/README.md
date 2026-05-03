# glibc malloc SIGSEGV Investigation

Reproduction and root cause analysis of SIGSEGV crashes in glibc malloc when performing millions of tiny allocations in a gVisor sandbox environment.

---

## Root Cause (95% Confidence)

**Crash occurs when:**
```
(arena_count × 66MB) + (allocation_overhead × allocation_count) > ~350MB
```

**Required factors** (ALL must be present):
1. Ancient kernel: Linux 4.4.0 (2016)
2. gVisor/runsc userspace syscall emulation
3. glibc 2.39
4. MALLOC_ARENA_MAX ≥ 3
5. Millions of tiny allocations (~4M+ per thread)

**Mechanism**: gVisor's `mprotect()` returns success but fails to map memory, causing SIGSEGV when malloc writes to "mapped" address.

**100% effective workaround**: `export MALLOC_ARENA_MAX=2`

---

## Investigation Documents

### Core Findings
- **[PRIOR_INVESTIGATIONS_SYNTHESIS.md](PRIOR_INVESTIGATIONS_SYNTHESIS.md)** - Synthesis of 40+ hours investigation (PRs #10-14, Phase 5)
- **[ALLOCATION_PATTERN_ANALYSIS.md](ALLOCATION_PATTERN_ANALYSIS.md)** - Size distributions, stress mechanisms, practical implications
- **[CRASH_VALIDATION.md](CRASH_VALIDATION.md)** - Current environment crash threshold validation

### Key Insights
- **Allocation COUNT matters**, not total size (3-byte allocations crash, 4MB doesn't)
- **Metadata overhead dominates** for tiny allocations (5.3x ratio for 3-byte strings)
- **Thread count irrelevant**, arena count is critical
- **Pattern matters**: Uniform vs varied sizes stress malloc differently

---

## Reproducers

### Std-Only Pattern (CRASHES)
```bash
# Creates 42M tiny 3-byte allocations, crashes at ~14.68M
MALLOC_ARENA_MAX=3 cargo test --test test_pure_std_repro test_concurrent_string_and_vec_growth
```

**Pattern**: `byte.to_string()` creates millions of uniform 3-byte strings ("0", "42", "255")
- 97.6% of allocations are identical size
- Metadata overhead: 5.3x (16 bytes overhead / 3 bytes data)
- Crashes via metadata accumulation

### GeoJSON Pattern (current config: doesn't crash)
```bash
# Parses 14MB GeoJSON, creates 3.76M varied allocations
MALLOC_ARENA_MAX=3 cargo test --test test_geojson_repro test_concurrent_geojson_parsing
```

**Pattern**: Nested JSON structures create varied allocation sizes (1B-632B range)
- 872 unique allocation sizes
- Higher fragmentation overhead (~20% estimated)
- Current 14MB test stays below crash threshold

---

## Workaround

```bash
# Reduce arena overhead: 3×66MB → 2×66MB
export MALLOC_ARENA_MAX=2
```

Or use alternative allocator:
```rust
#[global_allocator]
static GLOBAL: jemallocator::Jemalloc = jemallocator::Jemalloc;
```

---

## For Developers

**Avoid**:
```rust
// Creates 45M allocations for 14MB data
for byte in data {
    vec.push(byte.to_string());  // 5.3x metadata overhead!
}
```

**Prefer**:
```rust
// Amortized allocation
let mut buffer = String::with_capacity(expected_size);
for byte in data {
    use std::fmt::Write;
    write!(buffer, "{}", byte).unwrap();
}
```

**Key principle**: In constrained environments, allocation count and metadata overhead matter more than total data size.

---

## Investigation History

- **PRs #10-14**: Root cause identification (5 factors, mprotect failure)
- **Phase 5**: Precise crash thresholds (GeoJSON 7.9-9.0M, std-only 9.4-10.9M allocations)
- **Current**: Allocation pattern characterization via LD_PRELOAD instrumentation

**Total investigation time**: 40+ hours across 6 investigation branches

---

## Environment Specificity

| Environment | Result |
|-------------|--------|
| gVisor + kernel 4.4.0 + glibc 2.39 + MALLOC_ARENA_MAX≥3 | **CRASH** |
| Same with MALLOC_ARENA_MAX=2 | PASS |
| Modern Linux kernel | PASS |
| Docker (standard) | PASS |

**This is a gVisor-specific bug** in environments with ancient kernels.
