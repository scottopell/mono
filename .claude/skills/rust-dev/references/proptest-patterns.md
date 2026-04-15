# proptest Patterns Reference

Deep examples and advanced patterns for property-based testing in Rust.

## Table of Contents

1. [Strategy Combinators](#strategy-combinators)
2. [The Test Fixture Pattern](#the-test-fixture-pattern)
3. [Domain-Specific Generators](#domain-specific-generators)
4. [Common Properties to Test](#common-properties-to-test)
5. [Bridging to Benchmarks](#bridging-to-benchmarks)
6. [State Machine Testing](#state-machine-testing)
7. [Regression Files](#regression-files)

---

## Strategy Combinators

### prop_oneof -- weighted variant selection

```rust
fn arb_buffer_strategy() -> impl Strategy<Value = BufferStrategy> {
    prop_oneof![
        3 => (1usize..1024).prop_map(BufferStrategy::Bounded),
        1 => Just(BufferStrategy::Unbounded),
    ]
}
```

The `3 =>` / `1 =>` weights mean bounded is generated 3x more often than
unbounded. Use weights to bias toward interesting cases.

### prop_flat_map -- dependent generation

When step 2 depends on step 1's output:

```rust
fn arb_prefixed_keys() -> impl Strategy<Value = (Vec<Vec<u8>>, Vec<Vec<u8>>)> {
    // Step 1: generate prefix groups
    prop::collection::vec(
        prop::collection::vec(any::<u8>(), 2..6),
        2..5,
    ).prop_flat_map(|prefixes| {
        // Step 2: for each prefix, generate keys with that prefix
        let key_strats: Vec<_> = prefixes.iter().map(|p| {
            let p = p.clone();
            prop::collection::vec(
                prop::collection::vec(any::<u8>(), 0..8)
                    .prop_map(move |suffix| {
                        let mut key = p.clone();
                        key.extend(suffix);
                        key
                    }),
                1..8,
            )
        }).collect();

        (key_strats, Just(prefixes))
    })
}
```

### prop_filter -- reject invalid combinations

```rust
.prop_filter("need at least one query prefix", |v| !v.is_empty())
```

Use sparingly. If more than ~20% of generated values are rejected, restructure
the strategy to generate valid values directly. Excessive filtering slows
test execution.

### prop_map -- transform output

```rust
// Generate sorted, deduped pairs
arb_key_value_pairs()
    .prop_map(|mut pairs| {
        pairs.sort_by(|a, b| a.0.cmp(&b.0));
        pairs.dedup_by(|a, b| a.0 == b.0);
        pairs
    })
```

---

## The Test Fixture Pattern

The most important pattern in this skill. A single struct encapsulates:
1. The constructed artifact (the thing under test)
2. The source data it was built from (for reference comparison)
3. A ground-truth method (brute-force reference implementation)
4. Configuration knobs (block size, capacity, etc.)

```rust
#[derive(Debug, Clone)]
struct SsTableTestCase {
    table: SsTable,
    pairs: Vec<(Vec<u8>, Vec<u8>)>,
    all_prefixes: Vec<Vec<u8>>,
    query_prefixes: Vec<Vec<u8>>,
    block_size: usize,
}

impl SsTableTestCase {
    fn expected_filtered_entries(&self) -> Vec<Entry> {
        self.table.iter()
            .filter(|e| self.query_prefixes.iter().any(|p| e.key.starts_with(p)))
            .collect()
    }

    /// For benchmarks: build a large fixture deterministically.
    fn large(num_keys: usize, block_size: usize) -> Self {
        // Deterministic construction at scale, no proptest involved
        ...
    }
}
```

### Why this pattern works

- **Adding a new property is one function.** The fixture already has everything
  a new test needs. You write the assertion, not the setup.
- **The ground-truth method IS the spec.** `expected_filtered_entries` is a
  brute-force reference that's obviously correct. The optimized implementation
  must match it for all generated inputs.
- **The generator documents the data model.** A reader of the strategy function
  learns what SSTables look like, what prefix groups are, and what block sizes
  are valid.

---

## Domain-Specific Generators

### Parser testing -- realistic product text

```rust
pub fn valid_afd_product() -> impl Strategy<Value = String> {
    (
        afd_header(),
        prop::collection::vec(
            (afd_section_name(), afd_section_content()),
            1..8,
        ),
        afd_footer(),
    ).prop_map(|(header, sections, footer)| {
        let mut product = header;
        for (name, content) in sections {
            product.push_str(&format!("\n.{}\n{}", name, content));
        }
        product.push_str(&footer);
        product
    })
}
```

### Bimodal distributions -- data-dependent performance

```rust
fn arb_name(long: bool) -> impl Strategy<Value = String> {
    if long {
        "[a-z]{100,250}"  // buffer reuse matters here
    } else {
        "[a-z]{5,15}"     // allocation cost is negligible here
    }
}

// Generate a mix: 90% short, 10% long
fn arb_mixed_names() -> impl Strategy<Value = Vec<String>> {
    prop::collection::vec(
        prop_oneof![
            9 => arb_name(false),
            1 => arb_name(true),
        ],
        100..1000,
    )
}
```

### Edge case injection

```rust
fn arb_f64_with_edges() -> impl Strategy<Value = f64> {
    prop_oneof![
        8 => -1000f64..1000f64,       // normal range
        1 => Just(0.0),                // zero
        1 => Just(f64::NAN),           // NaN
        1 => Just(f64::INFINITY),      // infinity
        1 => Just(f64::NEG_INFINITY),  // negative infinity
        1 => Just(f64::MIN_POSITIVE),  // smallest positive
        1 => Just(f64::EPSILON),       // machine epsilon
    ]
}
```

---

## Common Properties to Test

### Roundtrip

```rust
fn prop_roundtrip(val in any::<u64>()) {
    let encoded = encode(val);
    let decoded = decode(&encoded).unwrap();
    prop_assert_eq!(decoded, val);
}
```

### Filter matches brute force

```rust
fn prop_filter_exact(case in arb_test_case()) {
    let optimized = case.table.iter_with_prefixes(&case.query_prefixes);
    let brute_force = case.expected_filtered_entries();
    prop_assert_eq!(optimized, brute_force);
}
```

### Idempotency

```rust
fn prop_idempotent(input in arb_input()) {
    let once = process(&input);
    let twice = process(&once);
    prop_assert_eq!(once, twice);
}
```

### Ordering preserved

```rust
fn prop_sorted(case in arb_test_case()) {
    let entries: Vec<_> = case.table.iter().collect();
    for w in entries.windows(2) {
        prop_assert!(w[0].key <= w[1].key);
    }
}
```

### Union of subsets

```rust
fn prop_multi_prefix_is_union(case in arb_test_case()) {
    let combined = case.table.iter_with_prefixes(&case.query_prefixes);
    let union: BTreeSet<_> = case.query_prefixes.iter()
        .flat_map(|p| case.table.iter_with_prefixes(&[p.clone()]))
        .collect();
    prop_assert_eq!(combined.into_iter().collect::<BTreeSet<_>>(), union);
}
```

### Capacity never exceeded

```rust
fn prop_capacity_bounded(ops in arb_ops(), cap in 1usize..100) {
    let mut buf = RingBuffer::new(cap);
    for op in ops {
        buf.apply(op);
        prop_assert!(buf.len() <= cap);
    }
}
```

---

## Bridging to Benchmarks

### Pattern 1: Fixture with a `large()` constructor

```rust
impl TestCase {
    fn large(n: usize) -> Self {
        // Deterministic, no proptest runtime
        let mut rng = StdRng::seed_from_u64(42);
        // ... build at scale ...
    }
}

fn bench(c: &mut Criterion) {
    let case = TestCase::large(100_000);
    c.bench_function("hot_path", |b| {
        b.iter(|| case.run(black_box(&case.input)))
    });
}
```

### Pattern 2: Proptest runner with fixed seed

```rust
// Use proptest's test runner with a deterministic config
let mut runner = TestRunner::new(ProptestConfig {
    cases: 1,
    ..ProptestConfig::default()
});
let case = arb_test_case()
    .new_tree(&mut runner)
    .unwrap()
    .current();
```

---

## State Machine Testing

For complex stateful systems, proptest can generate random sequences of
operations and verify invariants hold after each step.

```rust
#[derive(Debug, Clone)]
enum CacheOp {
    Insert(String, Vec<u8>),
    Get(String),
    Evict(String),
    Clear,
}

fn arb_cache_ops() -> impl Strategy<Value = Vec<CacheOp>> {
    prop::collection::vec(
        prop_oneof![
            ("[a-z]{1,10}", prop::collection::vec(any::<u8>(), 0..100))
                .prop_map(|(k, v)| CacheOp::Insert(k, v)),
            "[a-z]{1,10}".prop_map(CacheOp::Get),
            "[a-z]{1,10}".prop_map(CacheOp::Evict),
            Just(CacheOp::Clear),
        ],
        1..100,
    )
}

proptest! {
    #[test]
    fn cache_invariants(ops in arb_cache_ops()) {
        let mut cache = Cache::new(64);
        let mut reference = HashMap::new();

        for op in ops {
            match op {
                CacheOp::Insert(k, v) => {
                    cache.insert(k.clone(), v.clone());
                    reference.insert(k, v);
                }
                CacheOp::Get(k) => {
                    // Cache may evict, but if present must match reference
                    if let Some(cached) = cache.get(&k) {
                        prop_assert_eq!(cached, reference.get(&k).unwrap());
                    }
                }
                CacheOp::Evict(k) => {
                    cache.evict(&k);
                    reference.remove(&k);
                }
                CacheOp::Clear => {
                    cache.clear();
                    reference.clear();
                }
            }
            prop_assert!(cache.len() <= 64, "capacity exceeded");
        }
    }
}
```

---

## Regression Files

When proptest finds a minimal failing case, it writes to
`proptest-regressions/<module_path>/<test_name>.txt`. These files contain
the specific seeds that reproduce the failure.

**Always commit regression files.** They serve as permanent example tests --
proptest replays them on every run, ensuring the failure never recurs. They're
also documentation: each file records a bug that was found by generation, not
by a human.

```
# proptest-regressions/weather/parsers/afd.txt
# This regression was found by proptest during development.
# Shrunk to minimal case. See the corresponding property test.
cc 7a1b2c3d...
```
