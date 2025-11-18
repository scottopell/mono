//! Test the same allocation pattern with different thread counts
//! to validate thread + arena interaction hypothesis

#[test]
fn test_concurrent_string_and_vec_growth_2_threads() {
    eprintln!("\n[TEST] Pure std: Concurrent large String + Vec growth (2 THREADS)");

    // Create a 14MB string similar to the JSON file size
    let large_string = "x".repeat(14 * 1024 * 1024);
    eprintln!("[TEST] String size: {} bytes", large_string.len());

    let handles: Vec<_> = (0..2)  // Changed from 3 to 2
        .map(|i| {
            let content = large_string.clone(); // Clone 14MB string
            std::thread::spawn(move || {
                eprintln!("[THREAD {}] Starting work...", i);

                // Simulate Vec growth pattern similar to JSON parsing
                // JSON parsing builds nested Vecs (arrays, objects)
                let mut vecs: Vec<Vec<String>> = Vec::new();

                // Process the string in chunks, building Vecs
                for chunk in content.as_bytes().chunks(1000) {
                    let mut inner_vec = Vec::new();

                    // This simulates building up data structures
                    // Similar to serde_json building Value trees
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
fn test_concurrent_string_and_vec_growth_4_threads() {
    eprintln!("\n[TEST] Pure std: Concurrent large String + Vec growth (4 THREADS)");

    // Create a 14MB string similar to the JSON file size
    let large_string = "x".repeat(14 * 1024 * 1024);
    eprintln!("[TEST] String size: {} bytes", large_string.len());

    let handles: Vec<_> = (0..4)  // Changed from 3 to 4
        .map(|i| {
            let content = large_string.clone(); // Clone 14MB string
            std::thread::spawn(move || {
                eprintln!("[THREAD {}] Starting work...", i);

                // Simulate Vec growth pattern similar to JSON parsing
                // JSON parsing builds nested Vecs (arrays, objects)
                let mut vecs: Vec<Vec<String>> = Vec::new();

                // Process the string in chunks, building Vecs
                for chunk in content.as_bytes().chunks(1000) {
                    let mut inner_vec = Vec::new();

                    // This simulates building up data structures
                    // Similar to serde_json building Value trees
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
fn test_concurrent_string_and_vec_growth_6_threads() {
    eprintln!("\n[TEST] Pure std: Concurrent large String + Vec growth (6 THREADS)");

    // Create a 14MB string similar to the JSON file size
    let large_string = "x".repeat(14 * 1024 * 1024);
    eprintln!("[TEST] String size: {} bytes", large_string.len());

    let handles: Vec<_> = (0..6)  // Changed from 3 to 6
        .map(|i| {
            let content = large_string.clone(); // Clone 14MB string
            std::thread::spawn(move || {
                eprintln!("[THREAD {}] Starting work...", i);

                // Simulate Vec growth pattern similar to JSON parsing
                // JSON parsing builds nested Vecs (arrays, objects)
                let mut vecs: Vec<Vec<String>> = Vec::new();

                // Process the string in chunks, building Vecs
                for chunk in content.as_bytes().chunks(1000) {
                    let mut inner_vec = Vec::new();

                    // This simulates building up data structures
                    // Similar to serde_json building Value trees
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
