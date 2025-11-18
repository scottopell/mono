//! Pure std reproduction - no external crates, only safe Rust code
//!
//! This test attempts to reproduce the malloc crash using only:
//! - String cloning (14MB)
//! - Vec growth patterns similar to JSON deserialization
//! - Concurrent execution (3 threads)
//! - NO unsafe code
//! - NO external dependencies (except std)

#[test]
fn test_concurrent_string_and_vec_growth() {
    eprintln!("\n[TEST] Pure std: Concurrent large String + Vec growth");

    // Create a 14MB string similar to the JSON file size
    let large_string = "x".repeat(14 * 1024 * 1024);
    eprintln!("[TEST] String size: {} bytes", large_string.len());

    let handles: Vec<_> = (0..3)
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
fn test_concurrent_vec_push_stress() {
    eprintln!("\n[TEST] Pure std: Concurrent Vec::push stress test");

    let handles: Vec<_> = (0..3)
        .map(|i| {
            std::thread::spawn(move || {
                eprintln!("[THREAD {}] Starting Vec stress test...", i);

                // Create many small Vecs and grow them
                // This triggers repeated reallocation, similar to JSON parsing
                let mut container: Vec<Vec<u8>> = Vec::new();

                for _ in 0..100_000 {
                    let mut v = Vec::new();
                    // Grow each Vec to trigger multiple reallocations
                    for j in 0..100 {
                        v.push(j as u8);
                    }
                    container.push(v);
                }

                eprintln!("[THREAD {}] Created {} vecs", i, container.len());
                container.len()
            })
        })
        .collect();

    let results: Vec<_> = handles
        .into_iter()
        .map(|h| h.join().expect("Thread panicked"))
        .collect();

    eprintln!("[TEST] Stress test completed: {:?}", results);
}

#[test]
fn test_concurrent_large_allocations() {
    eprintln!("\n[TEST] Pure std: Concurrent large allocations (10MB each thread)");

    let handles: Vec<_> = (0..3)
        .map(|i| {
            std::thread::spawn(move || {
                eprintln!("[THREAD {}] Allocating large Vec...", i);

                // Allocate ~10MB Vec and fill it
                let mut large_vec: Vec<u8> = Vec::with_capacity(10 * 1024 * 1024);

                for j in 0..(10 * 1024 * 1024) {
                    large_vec.push((j % 256) as u8);
                }

                eprintln!("[THREAD {}] Allocated {} bytes", i, large_vec.len());
                large_vec.len()
            })
        })
        .collect();

    let results: Vec<_> = handles
        .into_iter()
        .map(|h| h.join().expect("Thread panicked"))
        .collect();

    eprintln!("[TEST] Large allocation test completed: {:?}", results);
}

#[test]
fn test_concurrent_string_processing() {
    eprintln!("\n[TEST] Pure std: Concurrent String operations on 14MB data");

    // Create base data
    let base_data = "abcdefghij".repeat(1_400_000); // ~14MB
    eprintln!("[TEST] Base data size: {} bytes", base_data.len());

    let handles: Vec<_> = (0..3)
        .map(|i| {
            let data = base_data.clone();
            std::thread::spawn(move || {
                eprintln!("[THREAD {}] Processing strings...", i);

                let mut results: Vec<String> = Vec::new();

                // Split and collect into new Strings
                // This triggers many allocations
                for line in data.split('e') {
                    results.push(line.to_string());
                }

                eprintln!("[THREAD {}] Created {} strings", i, results.len());
                results.len()
            })
        })
        .collect();

    let results: Vec<_> = handles
        .into_iter()
        .map(|h| h.join().expect("Thread panicked"))
        .collect();

    eprintln!("[TEST] String processing completed: {:?}", results);
}
#[test]
fn test_1_thread() {
    let large_string = "x".repeat(14 * 1024 * 1024);
    let handles: Vec<_> = (0..1).map(|i| {
        let content = large_string.clone();
        std::thread::spawn(move || {
            let mut vecs: Vec<Vec<String>> = Vec::new();
            for chunk in content.as_bytes().chunks(1000) {
                let mut inner_vec = Vec::new();
                for byte in chunk { inner_vec.push(byte.to_string()); }
                vecs.push(inner_vec);
            }
            vecs.len()
        })
    }).collect();
    handles.into_iter().for_each(|h| { h.join().unwrap(); });
}

#[test]
fn test_2_threads() {
    let large_string = "x".repeat(14 * 1024 * 1024);
    let handles: Vec<_> = (0..2).map(|i| {
        let content = large_string.clone();
        std::thread::spawn(move || {
            let mut vecs: Vec<Vec<String>> = Vec::new();
            for chunk in content.as_bytes().chunks(1000) {
                let mut inner_vec = Vec::new();
                for byte in chunk { inner_vec.push(byte.to_string()); }
                vecs.push(inner_vec);
            }
            vecs.len()
        })
    }).collect();
    handles.into_iter().for_each(|h| { h.join().unwrap(); });
}

#[test]
fn test_4_threads() {
    let large_string = "x".repeat(14 * 1024 * 1024);
    let handles: Vec<_> = (0..4).map(|i| {
        let content = large_string.clone();
        std::thread::spawn(move || {
            let mut vecs: Vec<Vec<String>> = Vec::new();
            for chunk in content.as_bytes().chunks(1000) {
                let mut inner_vec = Vec::new();
                for byte in chunk { inner_vec.push(byte.to_string()); }
                vecs.push(inner_vec);
            }
            vecs.len()
        })
    }).collect();
    handles.into_iter().for_each(|h| { h.join().unwrap(); });
}

#[test]
fn test_8_threads() {
    let large_string = "x".repeat(14 * 1024 * 1024);
    let handles: Vec<_> = (0..8).map(|i| {
        let content = large_string.clone();
        std::thread::spawn(move || {
            let mut vecs: Vec<Vec<String>> = Vec::new();
            for chunk in content.as_bytes().chunks(1000) {
                let mut inner_vec = Vec::new();
                for byte in chunk { inner_vec.push(byte.to_string()); }
                vecs.push(inner_vec);
            }
            vecs.len()
        })
    }).collect();
    handles.into_iter().for_each(|h| { h.join().unwrap(); });
}
#[test]
fn test_small_1mb_3threads() {
    let large_string = "x".repeat(1 * 1024 * 1024);  // 1MB
    let handles: Vec<_> = (0..3).map(|i| {
        let content = large_string.clone();
        std::thread::spawn(move || {
            let mut vecs: Vec<Vec<String>> = Vec::new();
            for chunk in content.as_bytes().chunks(1000) {
                let mut inner_vec = Vec::new();
                for byte in chunk { inner_vec.push(byte.to_string()); }
                vecs.push(inner_vec);
            }
            vecs.len()
        })
    }).collect();
    handles.into_iter().for_each(|h| { h.join().unwrap(); });
}

#[test]
fn test_medium_7mb_3threads() {
    let large_string = "x".repeat(7 * 1024 * 1024);  // 7MB
    let handles: Vec<_> = (0..3).map(|i| {
        let content = large_string.clone();
        std::thread::spawn(move || {
            let mut vecs: Vec<Vec<String>> = Vec::new();
            for chunk in content.as_bytes().chunks(1000) {
                let mut inner_vec = Vec::new();
                for byte in chunk { inner_vec.push(byte.to_string()); }
                vecs.push(inner_vec);
            }
            vecs.len()
        })
    }).collect();
    handles.into_iter().for_each(|h| { h.join().unwrap(); });
}

#[test]
fn test_large_28mb_3threads() {
    let large_string = "x".repeat(28 * 1024 * 1024);  // 28MB
    let handles: Vec<_> = (0..3).map(|i| {
        let content = large_string.clone();
        std::thread::spawn(move || {
            let mut vecs: Vec<Vec<String>> = Vec::new();
            for chunk in content.as_bytes().chunks(1000) {
                let mut inner_vec = Vec::new();
                for byte in chunk { inner_vec.push(byte.to_string()); }
                vecs.push(inner_vec);
            }
            vecs.len()
        })
    }).collect();
    handles.into_iter().for_each(|h| { h.join().unwrap(); });
}

#[test]
fn test_tiny_100kb_3threads() {
    let large_string = "x".repeat(100 * 1024);  // 100KB
    let handles: Vec<_> = (0..3).map(|i| {
        let content = large_string.clone();
        std::thread::spawn(move || {
            let mut vecs: Vec<Vec<String>> = Vec::new();
            for chunk in content.as_bytes().chunks(1000) {
                let mut inner_vec = Vec::new();
                for byte in chunk { inner_vec.push(byte.to_string()); }
                vecs.push(inner_vec);
            }
            vecs.len()
        })
    }).collect();
    handles.into_iter().for_each(|h| { h.join().unwrap(); });
}
#[test]
fn test_2mb() {
    let s = "x".repeat(2 * 1024 * 1024);
    let h: Vec<_> = (0..3).map(|_| { let c = s.clone(); std::thread::spawn(move || { let mut v: Vec<Vec<String>> = Vec::new(); for ch in c.as_bytes().chunks(1000) { let mut iv = Vec::new(); for b in ch { iv.push(b.to_string()); } v.push(iv); } v.len() }) }).collect();
    h.into_iter().for_each(|h| { h.join().unwrap(); });
}

#[test]
fn test_4mb() {
    let s = "x".repeat(4 * 1024 * 1024);
    let h: Vec<_> = (0..3).map(|_| { let c = s.clone(); std::thread::spawn(move || { let mut v: Vec<Vec<String>> = Vec::new(); for ch in c.as_bytes().chunks(1000) { let mut iv = Vec::new(); for b in ch { iv.push(b.to_string()); } v.push(iv); } v.len() }) }).collect();
    h.into_iter().for_each(|h| { h.join().unwrap(); });
}

#[test]
fn test_6mb() {
    let s = "x".repeat(6 * 1024 * 1024);
    let h: Vec<_> = (0..3).map(|_| { let c = s.clone(); std::thread::spawn(move || { let mut v: Vec<Vec<String>> = Vec::new(); for ch in c.as_bytes().chunks(1000) { let mut iv = Vec::new(); for b in ch { iv.push(b.to_string()); } v.push(iv); } v.len() }) }).collect();
    h.into_iter().for_each(|h| { h.join().unwrap(); });
}
#[test]
fn test_64kb() {
    let s = "x".repeat(64 * 1024);
    let h: Vec<_> = (0..3).map(|_| { let c = s.clone(); std::thread::spawn(move || { let mut v: Vec<Vec<String>> = Vec::new(); for ch in c.as_bytes().chunks(1000) { let mut iv = Vec::new(); for b in ch { iv.push(b.to_string()); } v.push(iv); } v.len() }) }).collect();
    h.into_iter().for_each(|h| { h.join().unwrap(); });
}

#[test]
fn test_128kb() {
    let s = "x".repeat(128 * 1024);
    let h: Vec<_> = (0..3).map(|_| { let c = s.clone(); std::thread::spawn(move || { let mut v: Vec<Vec<String>> = Vec::new(); for ch in c.as_bytes().chunks(1000) { let mut iv = Vec::new(); for b in ch { iv.push(b.to_string()); } v.push(iv); } v.len() }) }).collect();
    h.into_iter().for_each(|h| { h.join().unwrap(); });
}

#[test]
fn test_256kb() {
    let s = "x".repeat(256 * 1024);
    let h: Vec<_> = (0..3).map(|_| { let c = s.clone(); std::thread::spawn(move || { let mut v: Vec<Vec<String>> = Vec::new(); for ch in c.as_bytes().chunks(1000) { let mut iv = Vec::new(); for b in ch { iv.push(b.to_string()); } v.push(iv); } v.len() }) }).collect();
    h.into_iter().for_each(|h| { h.join().unwrap(); });
}

#[test]
fn test_512kb() {
    let s = "x".repeat(512 * 1024);
    let h: Vec<_> = (0..3).map(|_| { let c = s.clone(); std::thread::spawn(move || { let mut v: Vec<Vec<String>> = Vec::new(); for ch in c.as_bytes().chunks(1000) { let mut iv = Vec::new(); for b in ch { iv.push(b.to_string()); } v.push(iv); } v.len() }) }).collect();
    h.into_iter().for_each(|h| { h.join().unwrap(); });
}
#[test]
fn test_3mb() {
    let s = "x".repeat(3 * 1024 * 1024);
    let h: Vec<_> = (0..3).map(|_| { let c = s.clone(); std::thread::spawn(move || { let mut v: Vec<Vec<String>> = Vec::new(); for ch in c.as_bytes().chunks(1000) { let mut iv = Vec::new(); for b in ch { iv.push(b.to_string()); } v.push(iv); } v.len() }) }).collect();
    h.into_iter().for_each(|h| { h.join().unwrap(); });
}
