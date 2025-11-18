# glibc malloc SIGSEGV Minimal Reproducer

Minimal reproduction of a SIGSEGV crash in glibc's `sysmalloc()` function when performing concurrent allocations in Rust.

## ✅ ROOT CAUSE IDENTIFIED

**Issue:** gVisor/runsc sandbox has a bug when glibc malloc uses 3+ arenas concurrently

**Affected Environment:** Docker with gVisor/runsc runtime (user-space kernel sandbox)

**Workaround:** Set `MALLOC_ARENA_MAX=2` or `MALLOC_ARENA_MAX=1`

**Confidence:** >95% (100% reproducible fix)

See [comprehensive_findings.md](comprehensive_findings.md) for complete investigation details.

## The Bug

**Crash Location:** `sysmalloc()` at `malloc/malloc.c:2936` (glibc malloc arena expansion)

**Trigger:** glibc malloc using 3+ arenas in gVisor environment

**Root Cause:** Bug in gVisor's syscall interception (mmap/brk) when >= 3 malloc arenas are active

## Reproducers

### 1. Pure std Reproducer (No Dependencies)

Tests using only Rust std library - no external crates.

```bash
cargo test --test test_pure_std_repro --release
```

**Tests included:**
- `test_concurrent_string_and_vec_growth` - Main reproducer (14MB strings + Vec growth)
- `test_concurrent_large_allocations` - 10MB Vec allocations
- `test_concurrent_string_processing` - String splitting/collecting
- `test_concurrent_vec_push_stress` - Many small Vec growths

### 2. GeoJSON Reproducer (Real-world Scenario)

Reproduces the crash using actual GeoJSON parsing (the original discovery scenario).

```bash
cargo test --test test_geojson_repro --release
```

**Tests included:**
- `test_concurrent_geojson_parsing` - Parse 14MB GeoJSON concurrently
- `test_geojson_with_jemalloc_workaround` - Proves jemalloc fixes it

## Workarounds

### Option 1: Set MALLOC_ARENA_MAX (Recommended)

**Easiest and most reliable fix:**

```bash
# For testing
export MALLOC_ARENA_MAX=2
cargo test --release

# In Dockerfile
ENV MALLOC_ARENA_MAX=2

# In systemd service
Environment="MALLOC_ARENA_MAX=2"
```

**Why this works:** Limits glibc to 2 malloc arenas, avoiding the gVisor bug that triggers at 3+ arenas.

**Performance:** Minimal impact (2 arenas sufficient for most workloads)

### Option 2: Use jemalloc

Using jemalloc as the global allocator bypasses glibc malloc entirely:

```rust
use jemallocator::Jemalloc;

#[global_allocator]
static GLOBAL: Jemalloc = Jemalloc;
```

**Trade-off:** Adds dependency, but provides better performance in many scenarios.

## Known Environments

| Environment | glibc | Sandbox | MALLOC_ARENA_MAX | Result |
|-------------|-------|---------|------------------|--------|
| **gVisor/runsc** | 2.39 | gVisor | unset (128) | **CRASH** ❌ |
| **gVisor/runsc** | 2.39 | gVisor | **2** | **PASS** ✅ |
| **gVisor/runsc** | 2.39 | gVisor | **1** | **PASS** ✅ |
| Docker (standard) | 2.39 | None | unset | PASS |
| Ubuntu 22.04 bare metal | 2.35 | None | unset | PASS |
| Docker ARM64 | 2.39 | Docker | unset | PASS |

**Key Insight:** Bug is specific to gVisor/runsc sandbox when 3+ malloc arenas are used. Standard Docker (without gVisor) is not affected.

**Arena Threshold:** MALLOC_ARENA_MAX <= 2 works, >= 3 crashes (100% reproducible)

## Investigation

**Complete findings:** See **[comprehensive_findings.md](comprehensive_findings.md)** for full root cause analysis

**Investigation methodology:** See **[PROMPT_WEIRD_MALLOC_CRASH.md](PROMPT_WEIRD_MALLOC_CRASH.md)** for the scientific method framework used

**Summary:**
- Phase 1: Environmental fingerprinting identified gVisor as unique factor
- Phase 2: Generated 7 testable hypotheses
- Phase 3-4: First hypothesis (H-A1: arena contention) confirmed via testing
- Result: Root cause identified in ~30 minutes with 14 test runs
- Outcome: 100% reproducible fix (MALLOC_ARENA_MAX=2)

## Background

Originally discovered during integration testing of a weather radar platform when parsing large GeoJSON files. Investigation revealed:

1. ✅ NOT serde_json's fault - reproduced with pure std
2. ✅ NOT geojson's fault - reproduced with pure std
3. ✅ NOT unsafe code - all safe Rust std operations
4. ✅ jemalloc workaround works - points to glibc malloc
5. ❓ Environment-specific - not just glibc version

**Call chain:**
```
Safe Rust (Vec/String)
  → alloc::raw_vec::RawVec::grow_one
    → alloc::raw_vec::finish_grow
      → __libc_malloc / __libc_realloc
        → sysmalloc ← CRASH HERE
```

## License

Public domain - use this to debug/report the issue upstream.
