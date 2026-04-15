# Criterion Advanced Usage

Extended patterns for Criterion benchmarks beyond the basics in SKILL.md.

## Table of Contents

- [Throughput Reporting](#throughput-reporting)
- [Statistical Configuration](#statistical-configuration)
- [Async Benchmarks](#async-benchmarks)
- [Baseline Comparison Workflow](#baseline-comparison-workflow)
- [Custom Measurement Time](#custom-measurement-time)
- [Profiling a Specific Benchmark](#profiling-a-specific-benchmark)

---

## Throughput Reporting

Report throughput in bytes/sec or elements/sec so Criterion's HTML report
shows throughput alongside timing.

```rust
use criterion::{Criterion, BenchmarkId, Throughput};

fn bench_throughput(c: &mut Criterion) {
    let mut group = c.benchmark_group("parsing");

    for size in [1024usize, 4096, 65536] {
        let data = vec![0u8; size];

        // Criterion will compute and report bytes/sec
        group.throughput(Throughput::Bytes(size as u64));
        group.bench_with_input(
            BenchmarkId::from_parameter(size),
            &data,
            |b, data| b.iter(|| parse(black_box(data))),
        );
    }
    group.finish();
}
```

## Statistical Configuration

Tune measurement parameters for noisy or fast benchmarks.

```rust
use std::time::Duration;

fn configured_bench(c: &mut Criterion) {
    let mut group = c.benchmark_group("precise");

    group.measurement_time(Duration::from_secs(10));  // longer measurement
    group.sample_size(200);                            // more samples
    group.warm_up_time(Duration::from_secs(3));        // warm up caches
    group.noise_threshold(0.05);                       // 5% noise tolerance
    group.significance_level(0.05);                    // p < 0.05
    group.confidence_level(0.95);                      // 95% CI

    group.bench_function("fast_op", |b| {
        b.iter(|| fast_operation(black_box(42)))
    });

    group.finish();
}
```

**When to adjust:**
- `measurement_time`: increase for benchmarks with high variance
- `sample_size`: increase when you need tighter confidence intervals
- `noise_threshold`: increase if your CI runner is noisy and you're getting
  false "performance changed" reports

## Async Benchmarks

### Tokio

```toml
[dev-dependencies]
criterion = { version = "0.5", features = ["async_tokio"] }
tokio = { version = "1", features = ["full"] }
```

```rust
use criterion::async_executor::TokioExecutor;

fn bench_async(c: &mut Criterion) {
    c.bench_function("async_fetch", |b| {
        b.to_async(TokioExecutor).iter(|| async {
            fetch_data(black_box("key")).await
        })
    });
}
```

### Custom Runtime

```rust
fn bench_async_custom(c: &mut Criterion) {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(4)
        .build()
        .unwrap();

    c.bench_function("async_with_runtime", |b| {
        b.to_async(&rt).iter(|| async {
            process_batch(black_box(&data)).await
        })
    });
}
```

## Baseline Comparison Workflow

Compare performance across branches or before/after a change.

```bash
# On the baseline branch (e.g., main)
cargo bench -- --save-baseline main-branch

# Switch to feature branch
git checkout my-optimization

# Run and compare
cargo bench -- --baseline main-branch
```

Criterion output shows the delta with statistical significance:

```
processing/1000     time:   [12.345 us 12.456 us 12.567 us]
                    change: [-5.23% -4.90% -4.56%] (p = 0.00 < 0.05)
                    Performance has improved.
```

**For CI regression detection:**

```bash
# In CI, save baseline on main merge
cargo bench -- --save-baseline ci-main

# On PR, compare against it
cargo bench -- --baseline ci-main
# Exit code is always 0 -- parse the output or use criterion-compare
```

## Custom Measurement Time

For very fast operations (< 1ns), Criterion's default may not be enough
iterations. For very slow operations (> 1s each), reduce sample size.

```rust
fn bench_extremes(c: &mut Criterion) {
    // Very fast: increase measurement time
    let mut fast_group = c.benchmark_group("nanosecond_ops");
    fast_group.measurement_time(Duration::from_secs(15));
    fast_group.bench_function("bitwise", |b| b.iter(|| black_box(42u64).count_ones()));
    fast_group.finish();

    // Very slow: reduce sample size
    let mut slow_group = c.benchmark_group("heavy_ops");
    slow_group.sample_size(10);
    slow_group.measurement_time(Duration::from_secs(30));
    slow_group.bench_function("full_pipeline", |b| b.iter(|| full_pipeline(black_box(&data))));
    slow_group.finish();
}
```

## Profiling a Specific Benchmark

To profile a single benchmark function with samply or perf:

```bash
# Build the benchmark binary without running it
cargo bench --bench my_bench --no-run

# Find the binary (Criterion benchmarks are in target/release/deps/)
BENCH_BIN=$(find target/release/deps -name 'my_bench-*' -type f -perm +111 | head -1)

# Profile with samply (all platforms)
samply record $BENCH_BIN --bench "processing/original/1000"

# Profile with perf (Linux)
perf record -g -F 999 $BENCH_BIN --bench "processing/original/1000"
perf script | inferno-collapse-perf | inferno-flamegraph > bench-flamegraph.svg
```

The `--bench` flag after `--` tells Criterion to run in benchmark mode (with
measurement), not test mode.
