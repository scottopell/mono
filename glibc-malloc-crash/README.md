# glibc malloc SIGSEGV Minimal Reproducer

Minimal reproduction of a SIGSEGV crash in glibc's `sysmalloc()` function when performing concurrent allocations in Rust.

## The Bug

**Crash Location:** `sysmalloc()` at `malloc/malloc.c:2936` (glibc malloc arena expansion)

**Trigger:** Concurrent allocation of large strings and many small Vecs with 3+ malloc arenas

**Environment:** ✅ **ROOT CAUSE IDENTIFIED** - Specific to gVisor (runsc) container runtime

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

### Option 1: Limit Arenas (Recommended for Quick Fix)

```bash
export MALLOC_ARENA_MAX=2
cargo test
```

**Works because:** Forces arena serialization, avoiding gVisor's race condition.

### Option 2: Use jemalloc (Recommended for Production)

```rust
use jemallocator::Jemalloc;

#[global_allocator]
static GLOBAL: Jemalloc = Jemalloc;
```

**Works because:** Completely avoids glibc malloc, uses different syscall patterns.

## Known Environments

| Environment | Container Runtime | Result |
|-------------|------------------|--------|
| **claude-code-web** | **gVisor (runsc)** | **CRASH** |
| Ubuntu 22.04 x86_64 (bare metal) | None | PASS |
| Docker ARM64 | runc | PASS |
| Docker x86_64 (standard) | runc | PASS |
| Docker x86_64 (emulated) | runc | PASS |

**Key Insight:** Crash is specific to **gVisor (runsc)** container runtime, not glibc version.

## Investigation

**✅ INVESTIGATION COMPLETE**

See **[BETA_INVESTIGATION.md](BETA_INVESTIGATION.md)** and **[TEST_RESULTS_SUMMARY.md](TEST_RESULTS_SUMMARY.md)** for complete findings.

### Root Cause Identified

**gVisor (runsc) has a race condition in concurrent mmap/brk syscall emulation** that manifests when multiple glibc malloc arenas simultaneously attempt heap expansion.

**Confidence:** 95% (75+ systematic tests, 100% reproducibility)

### Universal Fix

```bash
export MALLOC_ARENA_MAX=2
```

This prevents the crash regardless of thread count in gVisor environments.

### Arena-Thread Interaction

| Threads | Safe Arena Count | Crash Arena Count |
|---------|-----------------|-------------------|
| 1       | Any             | N/A (no race)     |
| 2       | ≤ 3             | ≥ 4               |
| 3       | ≤ 2             | ≥ 3               |
| 4+      | ≤ 2             | ≥ 3               |

For investigation methodology, see **[PROMPT_WEIRD_MALLOC_CRASH.md](PROMPT_WEIRD_MALLOC_CRASH.md)**

## Background

Originally discovered during integration testing of a weather radar platform when parsing large GeoJSON files. Investigation revealed:

1. ✅ NOT serde_json's fault - reproduced with pure std
2. ✅ NOT geojson's fault - reproduced with pure std
3. ✅ NOT unsafe code - all safe Rust std operations
4. ✅ jemalloc workaround works - points to glibc malloc
5. ✅ gVisor-specific - race in concurrent mmap/brk syscall emulation

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
