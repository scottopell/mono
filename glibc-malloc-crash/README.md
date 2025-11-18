# glibc malloc SIGSEGV Minimal Reproducer

Minimal reproduction of a SIGSEGV crash in glibc's `sysmalloc()` function when performing concurrent allocations in Rust.

## The Bug

**Crash Location:** `sysmalloc()` at `malloc/malloc.c:2936` (glibc malloc arena expansion)

**Trigger:** Concurrent allocation of large strings and many small Vecs across 3+ threads

**Environment:** Specific to certain sandboxed/containerized environments (not all systems)

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

## Workaround

Using jemalloc as the global allocator prevents the crash:

```rust
use jemallocator::Jemalloc;

#[global_allocator]
static GLOBAL: Jemalloc = Jemalloc;
```

## Known Environments

| Environment | Result |
|-------------|--------|
| Specific sandboxed environments | **CRASH** |
| Ubuntu 22.04 x86_64 (bare metal) | PASS |
| Docker ARM64 | PASS |
| Docker x86_64 (emulated) | PASS |

**Key Insight:** Not glibc version alone - requires specific environment/sandbox configuration.

## Investigation

For systematic root cause analysis, see the investigation framework in the weather-radar-platform repo:
- `PROMPT_WEIRD_MALLOC_CRASH.md` - Scientific method investigation guide
- Covers hypothesis generation, testing protocol, stopping criteria

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
