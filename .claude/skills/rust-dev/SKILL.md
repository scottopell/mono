---
name: rust-dev
description: |
  Rust development skill covering type-driven design, property-based testing
  with proptest, structured data generation, profiling, benchmarking, and
  hypothesis-driven optimization for macOS arm64 and Linux. Use this skill
  whenever the user works on Rust code and needs help with: writing property
  tests, designing proptest strategies, generating structured test data,
  profiling a binary, writing Criterion benchmarks, analyzing binary size or
  monomorphization bloat, running an optimization pass, reducing allocations,
  measuring memory usage, or interpreting profiling results. Also trigger when
  the user mentions proptest, Arbitrary, property-based testing, criterion,
  samply, perf, cargo-flamegraph, cargo-bloat, cargo-llvm-lines, dhat,
  heaptrack, flamegraph, hyperfine, or performance regression. Use this even
  for indirect requests like "this is slow", "prove this is correct", "write
  better tests", "why is memory so high", or "find the hot path".
---

# Rust Development

Type-driven design, property-based testing, and hypothesis-driven optimization
for Rust projects on macOS arm64 and Linux (arm64/amd64).

Read `CONSTITUTION.md` for the development values that drive all guidance here.
Every recommendation in this skill traces back to a constitutional principle.

## First Principles

1. **Data shapes first.** Begin with the types. Struct definitions and type
   signatures are the design document. If you don't know what the structs look
   like, you don't understand the problem yet.
2. **Push invariants into the type system.** Newtypes, enums, non-optional
   fields. If the compiler rejects invalid states, you don't need tests for
   them. The ideal test suite is small because the types did the hard work.
3. **Tests are the spec.** Property tests define what the system does. The
   implementation is one way to satisfy them. Prefer properties over examples.
4. **Measure before you optimize.** Hunches about hot paths are wrong more
   often than not. Profile first.
5. **Correctness enables performance.** Property tests are the safety net for
   aggressive optimization. Without them, you're afraid to change things.
6. **One variable at a time.** Each optimization is a hypothesis -- change one
   thing, measure, record the result.
7. **Record failures.** A rejected hypothesis has value. Revert the code, keep
   the benchmark. Write down what you tried and why it failed.

---

## Type-Driven Design

The type system is the first line of defense. Use it aggressively before
reaching for tests.

### Newtypes over primitives

```rust
// Bad: two f64 arguments that can be silently swapped
fn forward_geodetic(lat: f64, lon: f64, azimuth: f64, range: f64) -> (f64, f64)

// Good: the compiler catches swapped arguments
struct Latitude(f64);
struct Longitude(f64);
struct Azimuth(f64);
struct RangeKm(f64);

fn forward_geodetic(lat: Latitude, lon: Longitude, az: Azimuth, r: RangeKm) -> (Latitude, Longitude)
```

### Enums over stringly-typed flags

```rust
// Bad: any string accepted, runtime validation needed
fn set_buffer_strategy(strategy: &str) { ... }

// Good: exhaustive match, no invalid states
enum BufferStrategy { Bounded(usize), Unbounded }
fn set_buffer_strategy(strategy: BufferStrategy) { ... }
```

### Non-optional where None is impossible

```rust
// Bad: Option used because "it might not be set yet"
struct Config {
    database_url: Option<String>,  // always set after init
}

// Good: split into builder and validated config
struct ConfigBuilder { database_url: Option<String> }
struct Config { database_url: String }  // guaranteed present
```

### When NOT to over-type

Don't invest in typestate patterns for code that's changing weekly. Types
calcify APIs. If the domain is still being discovered, lean on property tests
instead -- they're cheaper to change. Invest in types for stable infrastructure;
use tests for evolving features.

---

## Property-Based Testing with proptest

Property tests are the primary specification mechanism for behavioral
invariants that the type system can't express.

### When to use property tests vs example tests

**Property tests:**
- Anything with an encode/decode roundtrip
- Filters or queries that should match a brute-force reference
- Data structures with ordering or uniqueness invariants
- Idempotent operations
- Parsers (robustness across generated inputs)

**Example tests:**
- Specific regression cases for known bugs
- Tests where the expected output is a known concrete value
- Integration tests with complex external setup

### Basic structure

```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn roundtrip(val in any::<u64>()) {
        let encoded = encode_varint(val);
        let (decoded, _) = decode_varint(&encoded, 0).unwrap();
        prop_assert_eq!(decoded, val);
    }

    #[test]
    fn filter_matches_brute_force(
        data in arb_dataset(),
        prefix in arb_prefix()
    ) {
        let filtered = data.iter_with_prefix(&prefix);
        let brute_force: Vec<_> = data.iter()
            .filter(|e| e.key.starts_with(&prefix))
            .collect();
        prop_assert_eq!(filtered, brute_force);
    }
}
```

### Strategy composition

```rust
// prop_oneof: pick one variant
prop_oneof![
    Just("SYNOPSIS".to_string()),
    Just("AVIATION".to_string()),
    "[A-Z][A-Z/ ]{2,25}".prop_map(|s| s.trim().to_string()),
]

// prop_flat_map: dependent generation (output of step 1 feeds step 2)
let prefixes = prop::collection::vec(
    prop::collection::vec(any::<u8>(), 2..6),
    2..5,
);
prefixes.prop_flat_map(|pfxs| {
    // generate keys that share these prefixes
    ...
})

// prop_filter: reject invalid combinations
.prop_filter("need at least one query prefix", |v| !v.is_empty())
```

### The Test Fixture Pattern

When multiple property tests share the same input structure, extract it into
a reusable fixture. This is the Arbitrary pattern -- a single struct that
encapsulates both the test data and a ground-truth method for verification.

```rust
#[derive(Debug, Clone)]
struct SsTableTestCase {
    table: SsTable,
    pairs: Vec<(Vec<u8>, Vec<u8>)>,      // source data
    all_prefixes: Vec<Vec<u8>>,           // prefix groups in the data
    query_prefixes: Vec<Vec<u8>>,         // subset to query
    block_size: usize,                     // entries per block
}

impl SsTableTestCase {
    /// Ground truth via brute force -- the reference implementation.
    fn expected_filtered_entries(&self) -> Vec<Entry> {
        self.table.iter()
            .filter(|e| self.query_prefixes.iter().any(|p| e.key.starts_with(p)))
            .collect()
    }
}

fn arb_sstable_test_case() -> impl Strategy<Value = SsTableTestCase> {
    // Step 1: generate 2-5 distinct prefix groups
    // Step 2: for each prefix, generate 1-8 keys = prefix + random suffix
    // Step 3: pick a non-empty subset of prefixes to query
    // Step 4: pick a block size (1-5, forces multi-block tables)
    // Step 5: build the SSTable, sort, dedup
    ...
}

// Now every property test reuses the same fixture:
proptest! {
    #[test]
    fn full_iter_sorted(case in arb_sstable_test_case()) {
        let entries: Vec<_> = case.table.iter().collect();
        for w in entries.windows(2) {
            prop_assert!(w[0].key <= w[1].key);
        }
    }

    #[test]
    fn prefix_filter_exact(case in arb_sstable_test_case()) {
        let actual = case.table.iter_with_prefixes(&case.query_prefixes);
        let expected = case.expected_filtered_entries();
        prop_assert_eq!(actual, expected);
    }
}
```

The fixture documents the data model, hits structural corners (multi-block
spanning, shared prefixes), and makes adding new properties trivial.

### Structured data generation

Random bytes rarely share prefixes, collide, or exhibit the patterns that
trigger real bugs. Build strategies with domain structure:

- **Prefix groups** for testing prefix filters and block-skipping
- **Bimodal distributions** for testing data-dependent performance (short
  names vs long names, where only one regime exercises buffer reuse)
- **Domain-specific formats** for parser testing (valid NWS product headers,
  realistic field values, correct section ordering)
- **Boundary sizes** for testing capacity limits and block boundaries

The generator also serves as documentation. A new developer reads
`arb_sstable_test_case()` and understands the SSTable data model better
than any comment would explain.

### Regression files

When proptest finds a failure, it writes a regression file to
`proptest-regressions/`. Commit these. They serve as example tests
automatically -- proptest replays them on every run, ensuring the specific
failure never recurs.

---

## From Properties to Benchmarks

The same data generation patterns that drive property tests can feed
Criterion benchmarks. The test fixture struct is the bridge.

### The pattern

Proptest owns the generator (strategies with shrinking, edge cases).
Benchmarks consume by calling the strategy with a fixed seed or by
constructing the fixture directly at the desired scale.

```rust
// In tests: proptest generates diverse, small inputs
proptest! {
    #[test]
    fn filter_correct(case in arb_sstable_test_case()) {
        // correctness at small scale
    }
}

// In benchmarks: same struct, production-scale data
fn bench_filter(c: &mut Criterion) {
    // Build a large fixture deterministically
    let case = SsTableTestCase::large(100_000, 16);

    let mut group = c.benchmark_group("prefix_filter");
    group.throughput(Throughput::Elements(case.pairs.len() as u64));

    group.bench_function("iter_with_prefixes", |b| {
        b.iter(|| case.table.iter_with_prefixes(black_box(&case.query_prefixes)))
    });

    group.bench_function("brute_force", |b| {
        b.iter(|| case.expected_filtered_entries())
    });

    group.finish();
}
```

### When to diverge

Proptest needs small, shrinkable inputs that explore edge cases quickly.
Benchmarks need large, deterministic inputs that produce stable timings.
The fixture struct stays the same; the construction parameters change.

If the benchmark generator becomes substantially different from the proptest
strategy, that's fine -- the types still enforce the same invariants. Don't
force shared code where the concerns genuinely diverge.

---

## Platform-Aware Tool Selection

The correct profiling tool depends on the OS and architecture. DTrace does not
work for userspace profiling on Apple Silicon. Valgrind has no arm64 macOS
support. Do not suggest either on macOS arm64.

Detect the platform and select tools accordingly:

```bash
OS=$(uname -s)      # Darwin or Linux
ARCH=$(uname -m)    # arm64/aarch64 or x86_64
```

### Tool Matrix

| Tool              | macOS arm64 | Linux arm64 | Linux amd64 | Install |
|-------------------|:-----------:|:-----------:|:-----------:|---------|
| samply            | YES         | YES         | YES         | `cargo install samply` |
| cargo flamegraph  | NO          | YES         | YES         | `cargo install flamegraph` |
| perf              | --          | YES         | YES         | `apt install linux-tools-$(uname -r)` |
| heaptrack         | --          | YES         | YES         | `apt install heaptrack` |
| Valgrind (DHAT)   | --          | YES         | YES         | `apt install valgrind` |
| dhat crate        | YES         | YES         | YES         | `cargo add --dev dhat` |
| Instruments       | YES         | --          | --          | Ships with Xcode |
| cargo-bloat       | YES         | YES         | YES         | `cargo install cargo-bloat` |
| cargo-llvm-lines  | YES         | YES         | YES         | `cargo install cargo-llvm-lines` |
| criterion         | YES         | YES         | YES         | dev-dependency |
| hyperfine         | YES         | YES         | YES         | `cargo install hyperfine` |

**Decision logic:**
- CPU flamegraph on macOS arm64 --> `samply`
- CPU flamegraph on Linux --> `cargo flamegraph` (perf backend) or `samply`
- Heap profiling on macOS arm64 --> `dhat` crate or Instruments Allocations
- Heap profiling on Linux --> `heaptrack`, `dhat` crate, or Valgrind DHAT
- Binary size --> `cargo-bloat` (all platforms)
- Monomorphization --> `cargo-llvm-lines` (all platforms)
- Microbenchmarks --> Criterion (all platforms)
- CLI benchmarks --> hyperfine (all platforms)

## Build Profiles for Profiling

Release optimizations with debug symbols are required for meaningful profiles.
Without debug info, stack frames show as hex addresses.

```toml
# Cargo.toml -- add alongside existing profiles

[profile.profiling]
inherits = "release"
debug = 2            # full debug symbols for line-level attribution

[profile.release]
debug = 1            # line tables only -- lighter, still useful for flamegraphs
```

For better call graphs with samply and perf, enable frame pointers:

```toml
# .cargo/config.toml
[build]
rustflags = ["-C", "force-frame-pointers=yes"]
```

## CPU Profiling

### samply (macOS arm64 + Linux)

The primary cross-platform CPU profiler. Opens the Firefox Profiler UI
automatically in a browser tab.

```bash
cargo install samply

# Profile a binary
cargo build --profile profiling
samply record ./target/profiling/myapp args

# Profile via cargo (builds + runs)
samply record cargo run --profile profiling -- args

# Profile a specific benchmark
samply record cargo bench --bench mybench -- --bench "specific_test"

# Profile a test binary
cargo test --profile profiling --no-run  # find the binary path
samply record ./target/profiling/deps/mytest-abc123 specific_test
```

samply uses `task_for_pid` on macOS (no DTrace, no SIP issues) and
`perf_event_open` on Linux. It produces a profile viewable in Firefox
Profiler with full Rust symbol demangling, inline frame expansion, and
source-level annotation.

### perf (Linux only)

Lower-level, scriptable, integrates with ecosystem tools.

```bash
# Prerequisites
sudo sh -c 'echo 1 > /proc/sys/kernel/perf_event_paranoid'
sudo sh -c 'echo 0 > /proc/sys/kernel/kptr_restrict'

# Record with call graphs
perf record -g -F 999 ./target/profiling/myapp args

# Interactive TUI
perf report

# Text summary
perf report --stdio --no-call-graph | head -40

# Annotate a specific function (shows assembly + source interleaved)
perf annotate myapp::hot_function

# Quick counters (may need hardware PMU -- check `perf list`)
perf stat ./target/release/myapp args

# Generate flamegraph from perf data
perf script | inferno-collapse-perf | inferno-flamegraph > flamegraph.svg
```

**Linux perf tips:**
- `debug = 1` (line tables only) gives faster builds with line-level attribution
- `RUSTFLAGS="-C force-frame-pointers=yes"` avoids expensive DWARF unwinding
- Disable ASLR for reproducible addresses: `setarch $(uname -m) -R ./myapp`
- In VMs (Lima, QEMU): hardware PMU counters may not be exposed -- check
  `perf list | grep hardware`. Software counters still work.

### cargo flamegraph (Linux only)

Convenience wrapper around perf + inferno. Do not use on macOS arm64 (DTrace
backend is broken).

```bash
cargo install flamegraph

# Basic usage
cargo flamegraph --profile profiling --bin myapp -- args

# Higher sampling rate (997 Hz avoids aliasing with timer interrupts)
cargo flamegraph --freq 997 --profile profiling --bin myapp

# Profile tests
cargo flamegraph --profile profiling --test integration_tests -- test_name

# Profile a benchmark
cargo flamegraph --profile profiling --bench mybench -- --bench
```

### Reading Flamegraphs

```
Wide frames  = more CPU time in that function (and its callees)
Tall stacks  = deep call chains
Plateau tops = leaf functions where CPU actually executes

x-axis: alphabetical within each stack level (NOT time)
y-axis: call stack depth (bottom = entry point)
```

What to look for:
- Wide frames near the top -- hot leaf functions, actual CPU consumers
- `alloc`, `clear_page`, `__pi_clear_page` -- allocation pressure / kernel
  page zeroing
- `Vec::push`, `Vec::extend`, `with_capacity` -- Rust heap allocations
- `clone()`, `to_vec()`, `to_owned()` -- unnecessary copies
- `<closure>` frames in tight loops -- closure dispatch overhead
- `fmt::write` with high copy count -- formatting overhead

## Heap / Allocation Profiling

### dhat crate (all platforms)

Pure Rust. No Valgrind, no SIP, no elevated privileges. The best option when
you need heap profiling on macOS arm64, and a good default everywhere.

```toml
# Cargo.toml
[features]
dhat-heap = ["dep:dhat"]

[dependencies]
dhat = { version = "0.3", optional = true }
```

```rust
#[cfg(feature = "dhat-heap")]
#[global_allocator]
static ALLOC: dhat::Alloc = dhat::Alloc;

fn main() {
    #[cfg(feature = "dhat-heap")]
    let _profiler = dhat::Profiler::new_heap();

    // ... rest of main
}
```

```bash
cargo run --profile profiling --features dhat-heap -- args
# Produces dhat-heap.json
# Open in browser: https://nnethercote.github.io/dh_view/dh_view.html
# (static page, no upload -- runs entirely in-browser)
```

dhat tells you what flamegraphs cannot: allocation site, count, total bytes,
and object lifetimes. A flamegraph says "40% of CPU is in page zeroing." dhat
says "function X allocated 47 MB across 12,000 calls, median lifetime 3ms --
these are the buffers to reuse."

### heaptrack (Linux only)

```bash
heaptrack ./target/profiling/myapp args
heaptrack_print heaptrack.myapp.*.zst | head -50
# Or use heaptrack_gui for interactive exploration
```

### Instruments Allocations (macOS only)

```bash
xcrun xctrace record --template Allocations \
  --launch -- ./target/profiling/myapp args
# Opens in Instruments.app
```

## Binary Size Analysis

### cargo-bloat

Shows which functions and crates contribute most to binary size. Useful for
finding unexpected dependencies or generic bloat.

```bash
cargo install cargo-bloat

# Top functions by size
cargo bloat --release -n 20

# Per-crate breakdown
cargo bloat --release --crates

# Diff before/after a change
cargo bloat --release --crates > before.txt
# ... make changes ...
cargo bloat --release --crates > after.txt
diff before.txt after.txt
```

### cargo-llvm-lines

Proxy for monomorphization cost -- shows how many LLVM IR lines each function
generates. High copy counts mean a generic is being stamped out many times.

```bash
cargo install cargo-llvm-lines

cargo llvm-lines --release | head -40
```

The fix for monomorphization bloat -- thin generic wrapper over concrete inner:

```rust
// Before: monomorphized for every T
fn process<T: AsRef<[u8]>>(data: T) -> usize {
    do_work(data.as_ref())  // entire function duplicated per T
}

// After: only the conversion is generic
fn process<T: AsRef<[u8]>>(data: T) -> usize {
    fn inner(data: &[u8]) -> usize { do_work(data) }
    inner(data.as_ref())
}
```

## Microbenchmarks with Criterion

```toml
# Cargo.toml
[dev-dependencies]
criterion = { version = "0.5", features = ["html_reports"] }

[[bench]]
name = "my_bench"
harness = false
```

```rust
// benches/my_bench.rs
use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId, Throughput};

fn bench_variants(c: &mut Criterion) {
    let mut group = c.benchmark_group("processing");

    for size in [100, 1000, 10_000] {
        let data = generate_data(size);
        group.throughput(Throughput::Elements(size as u64));

        group.bench_with_input(
            BenchmarkId::new("original", size),
            &data,
            |b, data| b.iter(|| original_impl(black_box(data))),
        );

        group.bench_with_input(
            BenchmarkId::new("optimized", size),
            &data,
            |b, data| b.iter(|| optimized_impl(black_box(data))),
        );
    }
    group.finish();
}

criterion_group!(benches, bench_variants);
criterion_main!(benches);
```

```bash
# Run all benchmarks
cargo bench

# Run specific benchmark with filter
cargo bench -- processing/original

# Save baseline, make changes, compare
cargo bench -- --save-baseline before
# ... make changes ...
cargo bench -- --baseline before

# View HTML report
open target/criterion/report/index.html
```

### CLI Benchmarking with hyperfine

```bash
hyperfine --warmup 3 \
    './target/release/app-before input.txt' \
    './target/release/app-after input.txt'

# With markdown export
hyperfine --warmup 3 --runs 10 --export-markdown bench.md \
    './target/release/app input.txt'
```

## Optimization Workflow

This is the core loop. Every optimization is a hypothesis with a predicted
outcome, tested against a measured baseline. Property tests provide the
correctness gate at every step.

### 1. Verify Correctness Baseline

Before touching anything, confirm property tests pass. These are the
invariants the optimization must preserve.

```bash
cargo test                    # all tests, including proptest
```

If there are no property tests for the code you're about to optimize,
write them first. You need a safety net before you start swinging.

### 2. Establish Performance Baseline

Run your workload and record current performance. Specify the machine, build
profile, dataset, and exact numbers.

```bash
cargo build --profile profiling
samply record ./target/profiling/myapp args    # or perf on Linux
cargo bench                                      # microbenchmarks
```

### 3. Identify Targets

Read the flamegraph or dhat output. Look for:
- Functions consuming disproportionate CPU
- Allocation sites with high count or total bytes
- Unnecessary copies (`clone`, `to_vec`, `to_owned`)
- Monomorphization bloat (via `cargo-llvm-lines`)

### 4. Hypothesize

For each identified target, state:
- **What** you think is causing the problem
- **Why** -- the mechanism (e.g., "per-record Vec allocation triggers kernel
  page zeroing on each call")
- **Proposed fix** -- the specific code change
- **Predicted impact** -- quantified (e.g., "5-15% PSS reduction")

### 5. Implement and Measure

One change at a time. After each change:

```bash
cargo test                    # correctness gate -- properties still hold
cargo bench                   # or profile with samply/perf
```

Compare against the baseline. A meaningful improvement is typically >5% for
the primary metric. Record the result regardless of outcome.

### 6. Record Result

Whether confirmed or rejected, document:
- Baseline numbers
- Experiment numbers
- Delta (percentage)
- Verdict: why it worked or didn't
- Commit hash (and revert hash if rejected)

If the hypothesis is rejected: revert the code, keep the benchmark
infrastructure. The measurement setup is reusable even when the hypothesis
fails.

### Hypothesis Tracking

For projects with ongoing optimization work, maintain a `hypothesis.yml` or
similar file:

```yaml
baseline:
  date: "2026-04-02"
  commit: "abc1234"
  machine: "M4 MacBook Pro, 16GB RAM"
  profile: "profiling"
  metric: "PSS peak"
  value: "2135 MB"

hypotheses:
  - id: H001
    status: confirmed  # proposed | testing | confirmed | rejected | inconclusive
    target: "Per-record bzip2 decompression buffer"
    hypothesis: "Reusing a single buffer across records eliminates repeated mmap/munmap"
    predicted_impact: "5-15% PSS reduction"
    result:
      delta_pct: -80.2
      verdict: "Buffer reuse eliminated fragmentation far beyond prediction"
      commit: "9a0e5e6"
```

## Common Optimization Patterns

### Reduce Allocations

```rust
// Before: allocates on every call
fn process(items: &[Item]) -> Vec<String> {
    items.iter().map(|i| i.name.clone()).collect()
}

// After: caller owns the buffer, reused across calls
fn process_into(items: &[Item], output: &mut Vec<String>) {
    output.clear();
    output.extend(items.iter().map(|i| i.name.clone()));
}
```

### Buffer Reuse in Loops

```rust
// Before: new Vec per iteration
for record in records {
    let mut buf = Vec::with_capacity(128 * 1024);
    decompress(record, &mut buf);
    process(&buf);
}

// After: hoist buffer, clear between iterations
let mut buf = Vec::with_capacity(128 * 1024);
for record in records {
    buf.clear();  // length to 0, capacity retained
    decompress(record, &mut buf);
    process(&buf);
}
```

### Zero-Copy with Cow

```rust
use std::borrow::Cow;

// Borrow when no transformation needed, allocate only when required
fn decompress<'a>(data: &'a [u8], compressed: bool, buf: &'a mut Vec<u8>) -> Cow<'a, [u8]> {
    if compressed {
        buf.clear();
        do_decompress(data, buf);
        Cow::Borrowed(buf.as_slice())
    } else {
        Cow::Borrowed(data)  // zero-copy path
    }
}
```

### Stack Arrays for Small Collections

```rust
// Before: heap allocation for at most 9 elements
let mut neighbors: Vec<f64> = Vec::with_capacity(9);
for dy in -1..=1 {
    for dx in -1..=1 {
        if let Some(v) = grid.get(y + dy, x + dx) {
            neighbors.push(v);
        }
    }
}

// After: fixed-size stack array
let mut neighbors = [0.0f64; 9];
let mut count = 0;
for dy in -1..=1 {
    for dx in -1..=1 {
        if let Some(v) = grid.get(y + dy, x + dx) {
            neighbors[count] = v;
            count += 1;
        }
    }
}
```

## PR Checklist

```
[ ] Types enforce as many invariants as practical
[ ] Property tests cover behavioral invariants the types can't express
[ ] Regression tests pass before AND after the change
[ ] If performance work:
    [ ] Benchmark script included (Criterion, hyperfine, or custom harness)
    [ ] Before/after numbers on the same machine
    [ ] Build profile explicitly noted
    [ ] If >50% improvement: flamegraph or profiling evidence included
    [ ] Hypothesis recorded with predicted vs actual impact
[ ] If unsafe code: invariants documented and tested
[ ] proptest-regressions/ committed if any new failures were found
```

## References

For detailed setup instructions and extended examples:
- `CONSTITUTION.md` -- development values driving all guidance
- `references/profiling-setup.md` -- platform-specific installation, Lima VM
  setup, perf sysctl configuration, Instruments usage
- `references/criterion-advanced.md` -- async benchmarks, throughput reporting,
  statistical configuration, baseline comparison workflow
- `references/proptest-patterns.md` -- deep strategy examples, state machine
  testing, custom Arbitrary implementations
