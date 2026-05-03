#!/bin/bash
cat > /tmp/test_exact_14mb.rs << 'TESTEOF'
use std::thread;

#[test]
fn test_14mb_exact() {
    let target_size = 14 * 1_048_576; // Exactly 14MB
    println!("\n[TEST] Testing with exactly 14MB per thread");

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

                println!("[THREAD {}] Completed 14MB", i);
                s.len() + v.len()
            })
        })
        .collect();

    let _results: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
    println!("[TEST] SUCCESS");
}
TESTEOF

cp /tmp/test_exact_14mb.rs tests/test_exact_14mb.rs
MALLOC_ARENA_MAX=3 cargo test --test test_exact_14mb --release -- --nocapture
