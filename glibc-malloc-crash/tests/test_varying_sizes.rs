// Test varying allocation sizes to find threshold

use std::thread;

fn test_with_size(size_mb: usize) -> bool {
    let target_size = size_mb * 1_048_576;

    println!("\n[TEST] Testing with {}MB per thread (total {}MB across 3 threads)",
             size_mb, size_mb * 3);

    let handles: Vec<_> = (0..3)
        .map(|i| {
            thread::spawn(move || {
                let mut s = String::new();
                let mut v: Vec<u8> = Vec::new();

                for _ in 0..target_size {
                    s.push('A');
                }

                for j in 0..target_size {
                    v.push((j % 256) as u8);
                }

                println!("[THREAD {}] Completed {}MB", i, size_mb);
                s.len() + v.len()
            })
        })
        .collect();

    let results: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
    println!("[TEST] SUCCESS with {}MB", size_mb);
    true
}

#[test]
fn test_7mb_per_thread() {
    test_with_size(7);
}

#[test]
fn test_10mb_per_thread() {
    test_with_size(10);
}

#[test]
fn test_12mb_per_thread() {
    test_with_size(12);
}

#[test]
fn test_13mb_per_thread() {
    test_with_size(13);
}
