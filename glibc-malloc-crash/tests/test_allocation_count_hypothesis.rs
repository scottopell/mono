/// Test hypothesis: Crash is caused by NUMBER of allocations, not total size
///
/// The crashing tests do thousands of small allocations (byte.to_string())
/// while the passing tests do single large allocations.

use std::thread;

#[test]
fn test_single_large_allocation_per_thread() {
    println!("\n=== Single Large Allocation (4MB) per Thread ===");
    println!("Expected: PASS - Only 1 allocation per thread\n");

    let handles: Vec<_> = (0..3)
        .map(|i| {
            thread::spawn(move || {
                println!("[THREAD {}] Allocating 4MB as single Vec...", i);
                let data = vec![b'X'; 4 * 1024 * 1024];
                println!("[THREAD {}] Completed: {} bytes", i, data.len());
                data.len()
            })
        })
        .collect();

    for handle in handles {
        handle.join().unwrap();
    }

    println!("\n✅ PASSED");
}

#[test]
fn test_many_small_allocations_low_count() {
    println!("\n=== Many Small Allocations (100 × 40KB) per Thread ===");
    println!("Total: 4MB per thread, 100 allocations per thread");
    println!("Expected: PASS - Low allocation count\n");

    let handles: Vec<_> = (0..3)
        .map(|i| {
            thread::spawn(move || {
                println!("[THREAD {}] Allocating 100 × 40KB...", i);
                let mut chunks = Vec::new();
                for j in 0..100 {
                    let chunk = vec![b'X'; 40 * 1024];
                    chunks.push(chunk);
                    if j % 25 == 0 {
                        println!("[THREAD {}] Progress: {}/100", i, j);
                    }
                }
                println!("[THREAD {}] Completed: {} chunks", i, chunks.len());
                chunks.len()
            })
        })
        .collect();

    for handle in handles {
        handle.join().unwrap();
    }

    println!("\n✅ PASSED");
}

#[test]
fn test_many_small_allocations_medium_count() {
    println!("\n=== Many Small Allocations (1000 × 4KB) per Thread ===");
    println!("Total: 4MB per thread, 1000 allocations per thread");
    println!("Expected: Uncertain - Medium allocation count\n");

    let handles: Vec<_> = (0..3)
        .map(|i| {
            thread::spawn(move || {
                println!("[THREAD {}] Allocating 1000 × 4KB...", i);
                let mut chunks = Vec::new();
                for j in 0..1000 {
                    let chunk = vec![b'X'; 4 * 1024];
                    chunks.push(chunk);
                    if j % 250 == 0 {
                        println!("[THREAD {}] Progress: {}/1000", i, j);
                    }
                }
                println!("[THREAD {}] Completed: {} chunks", i, chunks.len());
                chunks.len()
            })
        })
        .collect();

    for handle in handles {
        handle.join().unwrap();
    }

    println!("\n✅ PASSED");
}

#[test]
fn test_many_small_allocations_high_count() {
    println!("\n=== Many Small Allocations (4000 × 1KB) per Thread ===");
    println!("Total: 4MB per thread, 4000 allocations per thread");
    println!("Expected: CRASH? - High allocation count\n");

    let handles: Vec<_> = (0..3)
        .map(|i| {
            thread::spawn(move || {
                println!("[THREAD {}] Allocating 4000 × 1KB...", i);
                let mut chunks = Vec::new();
                for j in 0..4000 {
                    let chunk = vec![b'X'; 1024];
                    chunks.push(chunk);
                    if j % 1000 == 0 {
                        println!("[THREAD {}] Progress: {}/4000", i, j);
                    }
                }
                println!("[THREAD {}] Completed: {} chunks", i, chunks.len());
                chunks.len()
            })
        })
        .collect();

    for handle in handles {
        handle.join().unwrap();
    }

    println!("\n✅ PASSED");
}

#[test]
fn test_many_tiny_string_allocations() {
    println!("\n=== Many Tiny String Allocations (Replica of Crashing Pattern) ===");
    println!("Creating thousands of String allocations like byte.to_string()");
    println!("Expected: CRASH - Matches crashing test pattern\n");

    // First create the base content
    let large_string = "x".repeat(4 * 1024 * 1024);
    println!("Base string size: {} bytes", large_string.len());

    let handles: Vec<_> = (0..3)
        .map(|i| {
            let content = large_string.clone();
            thread::spawn(move || {
                println!("[THREAD {}] Starting thousands of String allocations...", i);

                let mut vecs: Vec<Vec<String>> = Vec::new();
                let mut count = 0;

                // This is the crashing pattern - thousands of tiny allocations
                for chunk in content.as_bytes().chunks(1000) {
                    let mut inner_vec = Vec::new();
                    for byte in chunk {
                        inner_vec.push(byte.to_string());  // Many tiny allocations!
                        count += 1;
                    }
                    vecs.push(inner_vec);

                    if vecs.len() % 1000 == 0 {
                        println!("[THREAD {}] Progress: {} vec groups, {} total strings", i, vecs.len(), count);
                    }
                }

                println!("[THREAD {}] Completed: {} vec groups, {} total strings", i, vecs.len(), count);
                vecs.len()
            })
        })
        .collect();

    for handle in handles {
        handle.join().unwrap();
    }

    println!("\n✅ PASSED (or crashed above)");
}
