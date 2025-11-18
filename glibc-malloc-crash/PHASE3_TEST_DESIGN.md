# Phase 3: TEST DESIGN - Plan Experiments

Designing specific tests for top-priority hypotheses.

---

## Test T1: MALLOC_ARENA_MAX=1 (Single Arena)

**Hypothesis:** H4 - MALLOC_ARENA_MAX unset causes arena contention

**Rationale:** If the crash is caused by multiple malloc arenas competing for memory via concurrent sysmalloc() calls, forcing a single arena should eliminate contention and prevent the crash.

**Test Procedure:**
```bash
cd /home/user/mono/glibc-malloc-crash
MALLOC_ARENA_MAX=1 cargo test --test test_pure_std_repro test_concurrent_string_and_vec_growth --release -- --nocapture
```

**Expected Outcomes:**
- If H4 TRUE: Test PASSES (no crash)
- If H4 FALSE: Test CRASHES (SIGSEGV)

**Success Criteria:**
- Run 3 times to confirm consistency
- If 3/3 pass: Strong evidence for H4
- If 3/3 crash: H4 ruled out
- If mixed: Suggests timing-related issue, need more investigation

**Controls:**
- Baseline: Same test without MALLOC_ARENA_MAX (already confirmed crashes)
- Variables changed: Only MALLOC_ARENA_MAX environment variable
- All other factors: Unchanged

**Data to Collect:**
- [x] Exit code
- [x] Stderr/stdout
- [x] Backtrace if crash
- [x] Time to completion/crash
- [x] Thread startup messages
- [x] Run 3 times for consistency

---

## Test T2: MALLOC_ARENA_MAX=2 and MALLOC_ARENA_MAX=4

**Hypothesis:** H4 - Arena count affects crash rate

**Rationale:** If T1 shows MALLOC_ARENA_MAX=1 prevents crash, test intermediate values to understand the relationship between arena count and crash behavior.

**Test Procedure:**
```bash
cd /home/user/mono/glibc-malloc-crash

echo "Testing ARENA_MAX=2:"
MALLOC_ARENA_MAX=2 cargo test --test test_pure_std_repro test_concurrent_string_and_vec_growth --release -- --nocapture

echo "Testing ARENA_MAX=4:"
MALLOC_ARENA_MAX=4 cargo test --test test_pure_std_repro test_concurrent_string_and_vec_growth --release -- --nocapture
```

**Expected Outcomes:**
- If crash rate varies with arena count: Supports arena contention theory
- If all crash: Arena count not the issue
- If all pass: Arena count threshold exists

**Success Criteria:**
- Run each config 3 times
- Document crash rate for each

---

## Test T3: Single Thread (No Concurrency)

**Hypothesis:** H8 - Thread count/concurrency triggers race condition

**Rationale:** If crash requires concurrent memory operations, removing concurrency (single thread) should prevent crash.

**Test Procedure:**

Create modified test file:
```rust
// tests/test_single_thread.rs
#[test]
fn test_single_thread_string_and_vec_growth() {
    println!("[TEST] Single thread: Large String + Vec growth");

    let target_size = 14_680_064;
    let mut s = String::new();
    let mut v: Vec<u8> = Vec::new();

    // Grow string
    for _ in 0..target_size {
        s.push('A');
    }

    // Grow vec
    for i in 0..target_size {
        v.push((i % 256) as u8);
    }

    println!("String size: {} bytes", s.len());
    println!("Vec size: {} bytes", v.len());
    println!("Test completed successfully");
}
```

Run test:
```bash
cd /home/user/mono/glibc-malloc-crash
cargo test --test test_single_thread test_single_thread_string_and_vec_growth --release -- --nocapture
```

**Expected Outcomes:**
- If H8 TRUE: Test PASSES (no crash)
- If H8 FALSE: Test CRASHES (SIGSEGV)

**Success Criteria:**
- Run 3 times to confirm
- If passes: Concurrency is necessary factor
- If crashes: Concurrency not required, issue is simpler

---

## Test T4: Smaller Allocation Size (7MB)

**Hypothesis:** H7 - 14MB allocation size crosses threshold

**Rationale:** If crash is triggered by specific allocation size, reducing to 7MB should prevent crash.

**Test Procedure:**

Create modified test:
```rust
// tests/test_smaller_alloc.rs
use std::thread;

#[test]
fn test_concurrent_smaller_allocation() {
    println!("[TEST] Concurrent threads with 7MB allocations");

    let target_size = 7_340_032; // Half of original (7MB)

    let handles: Vec<_> = (0..3)
        .map(|i| {
            thread::spawn(move || {
                println!("[THREAD {}] Starting work...", i);
                let mut s = String::new();
                let mut v: Vec<u8> = Vec::new();

                for _ in 0..target_size {
                    s.push('A');
                }

                for j in 0..target_size {
                    v.push((j % 256) as u8);
                }

                println!("[THREAD {}] Completed. String: {}B, Vec: {}B",
                         i, s.len(), v.len());
            })
        })
        .collect();

    for handle in handles {
        handle.join().unwrap();
    }
}
```

Run test:
```bash
cd /home/user/mono/glibc-malloc-crash
cargo test --test test_smaller_alloc test_concurrent_smaller_allocation --release -- --nocapture
```

**Expected Outcomes:**
- If H7 TRUE: Test PASSES (no crash)
- If H7 FALSE: Test CRASHES (SIGSEGV)

---

## Test T5: MALLOC_ARENA_TEST Variation

**Hypothesis:** H4 variant - Arena creation threshold matters

**Rationale:** MALLOC_ARENA_TEST controls how many threads trigger arena creation. Testing different values reveals if arena creation timing matters.

**Test Procedure:**
```bash
cd /home/user/mono/glibc-malloc-crash

MALLOC_ARENA_TEST=1 cargo test --test test_pure_std_repro test_concurrent_string_and_vec_growth --release -- --nocapture
```

**Expected Outcomes:**
- Different behavior than MALLOC_ARENA_MAX
- May reveal arena creation is the issue, not count

---

## Test Execution Order

### Phase 3A: Quick Environment Variable Tests (Run First)
1. **T1**: MALLOC_ARENA_MAX=1 (highest priority, easiest test)
2. **T2**: MALLOC_ARENA_MAX=2,4 (if T1 shows effect)
3. **T5**: MALLOC_ARENA_TEST=1 (related to T1)

**Why first:** Zero code changes, instant results, directly tests arena hypothesis

### Phase 3B: Code Modification Tests (Run Second)
4. **T3**: Single thread test
5. **T4**: Smaller allocation test

**Why second:** Requires writing new test files, but still within same environment

### Phase 3C: Analysis Phase
6. Analyze results from T1-T5
7. Update hypothesis confidence levels
8. Decide if further testing needed or if boundary reached

---

## Success Metrics

**Ideal outcome:** One or more tests consistently prevent crash (0/3 crashes vs 3/3 baseline)

**Evidence hierarchy:**
- **Strong evidence:** 3/3 prevention with single variable change
- **Moderate evidence:** 2/3 prevention or variable results
- **Weak evidence:** 1/3 prevention or inconsistent
- **Ruled out:** 0/3 prevention (still crashes)

---

## Next Steps

Proceed to **Phase 4: ANALYZE** - Execute tests T1-T5 and document results.
