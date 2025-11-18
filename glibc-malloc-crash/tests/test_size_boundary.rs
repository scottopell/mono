//! Test various allocation sizes to see if arena threshold changes

#[test]
fn test_1mb_allocation() {
    eprintln!("\n[TEST] 1MB String + Vec growth");

    let large_string = "x".repeat(1 * 1024 * 1024);
    eprintln!("[TEST] String size: {} bytes", large_string.len());

    let handles: Vec<_> = (0..3)
        .map(|i| {
            let content = large_string.clone();
            std::thread::spawn(move || {
                eprintln!("[THREAD {}] Starting work...", i);

                let mut vecs: Vec<Vec<String>> = Vec::new();

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
fn test_3mb_allocation() {
    eprintln!("\n[TEST] 3MB String + Vec growth");

    let large_string = "x".repeat(3 * 1024 * 1024);
    eprintln!("[TEST] String size: {} bytes", large_string.len());

    let handles: Vec<_> = (0..3)
        .map(|i| {
            let content = large_string.clone();
            std::thread::spawn(move || {
                eprintln!("[THREAD {}] Starting work...", i);

                let mut vecs: Vec<Vec<String>> = Vec::new();

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
fn test_8mb_allocation() {
    eprintln!("\n[TEST] 8MB String + Vec growth");

    let large_string = "x".repeat(8 * 1024 * 1024);
    eprintln!("[TEST] String size: {} bytes", large_string.len());

    let handles: Vec<_> = (0..3)
        .map(|i| {
            let content = large_string.clone();
            std::thread::spawn(move || {
                eprintln!("[THREAD {}] Starting work...", i);

                let mut vecs: Vec<Vec<String>> = Vec::new();

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
fn test_4mb_allocation() {
    eprintln!("\n[TEST] 4MB String + Vec growth");

    let large_string = "x".repeat(4 * 1024 * 1024);
    eprintln!("[TEST] String size: {} bytes", large_string.len());

    let handles: Vec<_> = (0..3)
        .map(|i| {
            let content = large_string.clone();
            std::thread::spawn(move || {
                eprintln!("[THREAD {}] Starting work...", i);

                let mut vecs: Vec<Vec<String>> = Vec::new();

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
fn test_2mb_allocation() {
    eprintln!("\n[TEST] 2MB String + Vec growth");

    let large_string = "x".repeat(2 * 1024 * 1024);
    eprintln!("[TEST] String size: {} bytes", large_string.len());

    let handles: Vec<_> = (0..3)
        .map(|i| {
            let content = large_string.clone();
            std::thread::spawn(move || {
                eprintln!("[THREAD {}] Starting work...", i);

                let mut vecs: Vec<Vec<String>> = Vec::new();

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
