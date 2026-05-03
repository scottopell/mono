//! Precision boundary testing to understand the exact mechanism
//!
//! Key questions:
//! 1. Is the 3-4MB boundary exact or approximate?
//! 2. What happens at 3.5MB, 3.9MB, 4.1MB?
//! 3. Is it actually a per-arena address space limit?
//! 4. Does the pattern scale: size × threads × arena_count?

#[test]
fn test_3mb_boundary_precision() {
    eprintln!("\n[TEST] Testing 3MB boundary with default arena count");

    // This should PASS based on our findings
    let large_string = "x".repeat(3 * 1024 * 1024);
    eprintln!("[TEST] Allocation: {} bytes", large_string.len());

    let handles: Vec<_> = (0..3)
        .map(|i| {
            let content = large_string.clone();
            std::thread::spawn(move || {
                let mut vecs: Vec<Vec<String>> = Vec::new();
                for chunk in content.as_bytes().chunks(1000) {
                    let mut inner_vec = Vec::new();
                    for byte in chunk {
                        inner_vec.push(byte.to_string());
                    }
                    vecs.push(inner_vec);
                }
                vecs.len()
            })
        })
        .collect();

    let results: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
    eprintln!("[TEST] Results: {:?}", results);
}

#[test]
fn test_3_5mb_with_default_arenas() {
    eprintln!("\n[TEST] Testing 3.5MB (just above 3MB boundary)");

    let large_string = "x".repeat(3_500_000); // 3.5MB
    eprintln!("[TEST] Allocation: {} bytes", large_string.len());

    let handles: Vec<_> = (0..3)
        .map(|i| {
            let content = large_string.clone();
            std::thread::spawn(move || {
                let mut vecs: Vec<Vec<String>> = Vec::new();
                for chunk in content.as_bytes().chunks(1000) {
                    let mut inner_vec = Vec::new();
                    for byte in chunk {
                        inner_vec.push(byte.to_string());
                    }
                    vecs.push(inner_vec);
                }
                vecs.len()
            })
        })
        .collect();

    let results: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
    eprintln!("[TEST] Results: {:?}", results);
}

#[test]
fn test_4mb_with_single_thread() {
    eprintln!("\n[TEST] Testing 4MB with SINGLE thread (should pass?)");

    let large_string = "x".repeat(4 * 1024 * 1024);
    eprintln!("[TEST] Allocation: {} bytes", large_string.len());
    eprintln!("[TEST] Threads: 1 (not 3)");

    // Single thread
    let content = large_string.clone();
    let mut vecs: Vec<Vec<String>> = Vec::new();
    for chunk in content.as_bytes().chunks(1000) {
        let mut inner_vec = Vec::new();
        for byte in chunk {
            inner_vec.push(byte.to_string());
        }
        vecs.push(inner_vec);
    }

    eprintln!("[TEST] Single thread completed: {} vecs", vecs.len());
}

#[test]
fn test_14mb_with_two_threads() {
    eprintln!("\n[TEST] Testing 14MB with TWO threads (not 3)");
    eprintln!("[TEST] Theory: If it's allocation_size × thread_count, should pass");

    let large_string = "x".repeat(14 * 1024 * 1024);
    eprintln!("[TEST] Allocation: {} bytes", large_string.len());
    eprintln!("[TEST] Threads: 2");

    let handles: Vec<_> = (0..2)
        .map(|i| {
            let content = large_string.clone();
            std::thread::spawn(move || {
                let mut vecs: Vec<Vec<String>> = Vec::new();
                for chunk in content.as_bytes().chunks(1000) {
                    let mut inner_vec = Vec::new();
                    for byte in chunk {
                        inner_vec.push(byte.to_string());
                    }
                    vecs.push(inner_vec);
                }
                vecs.len()
            })
        })
        .collect();

    let results: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
    eprintln!("[TEST] Results: {:?}", results);
}

#[test]
fn test_14mb_with_single_thread_different_pattern() {
    eprintln!("\n[TEST] Testing 14MB single thread with VEC allocation pattern");
    eprintln!("[TEST] (instead of String clone)");

    let handles: Vec<_> = (0..1)
        .map(|_i| {
            std::thread::spawn(move || {
                let mut large_vec: Vec<u64> = Vec::with_capacity(14 * 1024 * 1024 / 8);

                for j in 0..(14 * 1024 * 1024 / 8) {
                    large_vec.push(j as u64);
                }

                large_vec.len()
            })
        })
        .collect();

    let results: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
    eprintln!("[TEST] Single thread vec results: {:?}", results);
}

#[test]
fn test_sequential_allocations_14mb() {
    eprintln!("\n[TEST] Testing sequential 14MB allocations in same thread");
    eprintln!("[TEST] (Does total_allocated matter, or concurrent allocations?)");

    // Allocate sequentially, not concurrently
    for i in 0..3 {
        eprintln!("[SEQUENTIAL] Allocation {}", i);
        let large_string = "x".repeat(14 * 1024 * 1024);
        let _len = large_string.len();
    }

    eprintln!("[TEST] Sequential allocations completed (total: 42MB allocated, but one at a time)");
}

#[test]
fn test_understanding_arena_mechanics() {
    eprintln!("\n=== ANALYSIS: WHAT DO THE OBSERVATIONS TELL US? ===\n");

    eprintln!("OBSERVED FACTS:");
    eprintln!("1. Arena=1,2: Pass with 14MB × 3 threads");
    eprintln!("2. Arena=3: Fails with 4MB × 3 threads, but passes with 3MB × 3 threads");
    eprintln!("3. Arena=4+: Fail even at lower sizes");
    eprintln!("");

    eprintln!("INTERPRETATION OPTIONS:");
    eprintln!("");
    eprintln!("Option A: Binary threshold at Arena=3");
    eprintln!("  - Arenas 1-2: One implementation/path in glibc");
    eprintln!("  - Arenas 3+: Different implementation that gVisor doesn't support well");
    eprintln!("  - Evidence: Hard binary boundary, not gradual degradation");
    eprintln!("");

    eprintln!("Option B: Address space per arena gets tighter");
    eprintln!("  - Arena=1: ~100-200MB address space available");
    eprintln!("  - Arena=2: ~100-200MB address space available");
    eprintln!("  - Arena=3: ~50MB or less address space available");
    eprintln!("  - Evidence: Works at 3MB (9MB total), crashes at 4MB (12MB total)");
    eprintln!("");

    eprintln!("Option C: Arena pool exhaustion");
    eprintln!("  - gVisor might have global memory pool for all arenas");
    eprintln!("  - 1-2 arenas: Within limits");
    eprintln!("  - 3+ arenas: Exceed pool, memory corruption");
    eprintln!("  - Evidence: Arena count matters, but size also matters");
    eprintln!("");

    eprintln!("KEY QUESTION: Does thread count matter independently?");
    eprintln!("  - Current test: 3 threads × large allocation");
    eprintln!("  - If crashes with 2 threads × 4MB: thread count independent");
    eprintln!("  - If passes with 2 threads × 4MB: thread count matters");
    eprintln!("");

    eprintln!("KEY QUESTION: Is it concurrent or total allocation?");
    eprintln!("  - If sequential 14MB × 3 passes: total allocation doesn't matter");
    eprintln!("  - If sequential 14MB × 3 crashes: total allocated matters");
}
