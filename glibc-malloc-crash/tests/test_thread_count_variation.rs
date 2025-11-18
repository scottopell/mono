//! Thread count variation tests to identify threshold
//!
//! Tests the same allocation pattern with varying thread counts
//! to determine if crash is thread-count dependent

fn run_test_with_threads(thread_count: usize) {
    eprintln!("\n[TEST] Running with {} threads", thread_count);

    // Create a 14MB string similar to the JSON file size
    let large_string = "x".repeat(14 * 1024 * 1024);

    let handles: Vec<_> = (0..thread_count)
        .map(|i| {
            let content = large_string.clone(); // Clone 14MB string
            std::thread::spawn(move || {
                eprintln!("[THREAD {}] Starting work...", i);

                // Simulate Vec growth pattern similar to JSON parsing
                let mut vecs: Vec<Vec<String>> = Vec::new();

                // Process the string in chunks, building Vecs
                for chunk in content.as_bytes().chunks(1000) {
                    let mut inner_vec = Vec::new();

                    for byte in chunk {
                        inner_vec.push(byte.to_string());
                    }

                    vecs.push(inner_vec);
                }

                eprintln!("[THREAD {}] Built {} vecs", i, vecs.len());
                vecs.len()
            })
        })
        .collect();

    let results: Vec<_> = handles
        .into_iter()
        .map(|h| h.join().expect("Thread panicked"))
        .collect();

    eprintln!("[TEST] All threads completed: {:?}", results);
}

#[test]
fn test_1_thread() {
    run_test_with_threads(1);
}

#[test]
fn test_2_threads() {
    run_test_with_threads(2);
}

#[test]
fn test_3_threads() {
    run_test_with_threads(3);
}

#[test]
fn test_4_threads() {
    run_test_with_threads(4);
}
