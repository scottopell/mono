// Test: 3 arenas with SMALL allocations (1MB per thread instead of 14MB)
// Hypothesis: If crash is total memory, this should work
// If crash is arena count regardless of size, this should still crash

use std::thread;

#[test]
fn test_concurrent_small_allocations() {
    println!("[TEST] 3 threads × 1MB allocations (ARENA >= 3)");

    let target_size = 1_048_576; // 1MB instead of 14MB

    let handles: Vec<_> = (0..3)
        .map(|i| {
            thread::spawn(move || {
                println!("[THREAD {}] Starting work...", i);
                let mut s = String::new();
                let mut v: Vec<u8> = Vec::new();

                // Grow string to 1MB
                for _ in 0..target_size {
                    s.push('A');
                }

                // Grow vec to 1MB
                for j in 0..target_size {
                    v.push((j % 256) as u8);
                }

                println!("[THREAD {}] Completed. String: {}B, Vec: {}B",
                         i, s.len(), v.len());

                s.len() + v.len()
            })
        })
        .collect();

    let results: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
    println!("[TEST] All threads completed: {:?}", results);
}
