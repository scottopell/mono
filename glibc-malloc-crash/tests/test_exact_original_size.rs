use std::thread;

#[test]
fn test_exact_original_size() {
    let target_size = 14_680_064; // EXACT size from original test
    println!("\n[TEST] Testing with EXACT original size: {} bytes", target_size);

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

                println!("[THREAD {}] Completed", i);
                s.len() + v.len()
            })
        })
        .collect();

    let _results: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
    println!("[TEST] SUCCESS with exact original size");
}
