//! Binary search for the exact crash boundary
//!
//! Goal: Find exact MB value where crash begins
//! Current findings:
//! - 3.0MB: ✅ PASS
//! - 3.5MB: ❌ CRASH
//! - Therefore boundary is: 3.0 < X < 3.5

#[test]
fn test_3_2mb_boundary() {
    eprintln!("\n[TEST] Testing 3.2MB");
    let large_string = "x".repeat(3_200_000);
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
    eprintln!("[TEST] 3.2MB Results: {:?}", results);
}

#[test]
fn test_3_3mb_boundary() {
    eprintln!("\n[TEST] Testing 3.3MB");
    let large_string = "x".repeat(3_300_000);
    eprintln!("[TEST] Allocation: {} bytes", large_string.len());

    let handles: Vec<_> = (0..3)
        .map(|_i| {
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
    eprintln!("[TEST] 3.3MB Results: {:?}", results);
}

#[test]
fn test_4mb_single_thread() {
    eprintln!("\n[TEST] Testing 4MB with SINGLE thread");
    eprintln!("[HYPOTHESIS] Thread count might matter independently");

    let large_string = "x".repeat(4 * 1024 * 1024);
    eprintln!("[TEST] Allocation: {} bytes", large_string.len());

    let content = large_string.clone();
    let mut vecs: Vec<Vec<String>> = Vec::new();

    for chunk in content.as_bytes().chunks(1000) {
        let mut inner_vec = Vec::new();
        for byte in chunk {
            inner_vec.push(byte.to_string());
        }
        vecs.push(inner_vec);
    }

    eprintln!("[TEST] 4MB single-thread Results: {} vecs", vecs.len());
}

#[test]
fn test_14mb_two_threads() {
    eprintln!("\n[TEST] Testing 14MB with TWO threads");
    eprintln!("[HYPOTHESIS] If thread_count matters: 14MB × 2 = 28MB total");
    eprintln!("[HYPOTHESIS] vs 14MB × 3 = 42MB total");

    let large_string = "x".repeat(14 * 1024 * 1024);
    eprintln!("[TEST] Allocation: {} bytes × 2 threads", large_string.len());

    let handles: Vec<_> = (0..2)
        .map(|_i| {
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
    eprintln!("[TEST] 14MB 2-thread Results: {:?}", results);
}

#[test]
fn test_14mb_sequential_allocations() {
    eprintln!("\n[TEST] Testing sequential 14MB allocations in single thread");
    eprintln!("[HYPOTHESIS] Concurrent vs total allocation difference");
    eprintln!("[HYPOTHESIS] Total = 42MB (3 × 14MB), but allocated sequentially");

    for alloc_num in 0..3 {
        eprintln!("[SEQUENTIAL ALLOC {}] Allocating 14MB...", alloc_num);
        let large_string = "x".repeat(14 * 1024 * 1024);
        eprintln!("[SEQUENTIAL ALLOC {}] Allocated {} bytes", alloc_num, large_string.len());
    }

    eprintln!("[TEST] Sequential allocation completed - no crash");
}

#[test]
fn test_arena_3_exact_size_boundary() {
    eprintln!("\n=== TESTING ARENA=3 SPECIFIC BOUNDARY ===\n");
    eprintln!("We know:");
    eprintln!("  - Arena=1,2: Safe at 14MB × 3 threads");
    eprintln!("  - Arena=3: Crashes at 4MB × 3 threads");
    eprintln!("");
    eprintln!("Question: What's the exact boundary for Arena=3?");
    eprintln!("Theory: Arena pool fills up at exactly 3 arenas?");
}

#[test]
fn test_single_thread_multiple_sequential_arenas() {
    eprintln!("\n[TEST] Understanding arena lifecycle");
    eprintln!("[THEORY] Each arena is created on-demand");
    eprintln!("[QUESTION] Do sequential allocations reuse arena 1?");

    eprintln!("\nAllocating 1MB sequentially 5 times (single thread):");
    for i in 0..5 {
        let small_vec: Vec<u8> = vec![0; 1_000_000];
        eprintln!("  Iteration {}: Allocated {} bytes", i, small_vec.len());
    }

    eprintln!("\nNow allocating 14MB sequentially once:");
    let large_string = "x".repeat(14 * 1024 * 1024);
    eprintln!("  Allocated {} bytes", large_string.len());

    eprintln!("\n[TEST] Single-threaded sequential passes - arena reuse works");
}
