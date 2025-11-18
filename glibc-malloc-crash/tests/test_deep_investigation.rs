//! Deep investigation of arena × allocation size interaction
//! Goal: Map the exact failure boundary and understand the mechanism

use std::process::{Command, Stdio};
use std::io::Write;

/// Test framework to systematically probe the arena/size threshold
fn test_arena_size_combination(allocation_mb: usize, arena_max: usize) -> bool {
    let test_code = format!(
        r#"
#[test]
fn test_allocation() {{
    let large_string = "x".repeat({} * 1024 * 1024);
    let handles: Vec<_> = (0..3)
        .map(|i| {{
            let content = large_string.clone();
            std::thread::spawn(move || {{
                let mut vecs: Vec<Vec<String>> = Vec::new();
                for chunk in content.as_bytes().chunks(1000) {{
                    let mut inner_vec = Vec::new();
                    for byte in chunk {{
                        inner_vec.push(byte.to_string());
                    }}
                    vecs.push(inner_vec);
                }}
                vecs.len()
            }})
        }})
        .collect();

    let _results: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
}}
        "#,
        allocation_mb
    );

    // Write temporary test
    std::fs::write("/tmp/test_combo.rs", test_code).ok();

    // Run with specified MALLOC_ARENA_MAX
    let output = Command::new("bash")
        .arg("-c")
        .arg(format!(
            "cd /home/user/mono/glibc-malloc-crash && MALLOC_ARENA_MAX={} timeout 30 rustc --test /tmp/test_combo.rs -O -o /tmp/test_combo 2>&1 && /tmp/test_combo 2>&1",
            arena_max
        ))
        .output()
        .unwrap();

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let output_combined = format!("{}{}", stdout, stderr);

    // Check for success or crash
    !output_combined.contains("SIGSEGV") && !output_combined.contains("signal: 11")
}

#[test]
fn test_map_failure_boundary() {
    eprintln!("\n=== MAPPING EXACT FAILURE BOUNDARY ===\n");
    eprintln!("Size (MB) | Arena=1 | Arena=2 | Arena=3 | Arena=4 | Arena=5 | Notes");
    eprintln!("----------|---------|---------|---------|---------|---------|----------");

    for size_mb in 1..=10 {
        eprint!("{:8} | ", size_mb);

        let mut results = Vec::new();
        for arena in 1..=5 {
            let passes = test_arena_size_combination(size_mb, arena);
            results.push(passes);
            eprint!("{:^7} | ", if passes { "✅" } else { "❌" });
        }

        // Analyze pattern for this size
        let notes = if results.iter().all(|&x| x) {
            "All pass"
        } else if results[0] && !results[1] {
            "Fails at Arena≥2"
        } else if results[0] && results[1] && !results[2] {
            "Fails at Arena≥3"
        } else if !results[0] {
            "Fails even Arena=1"
        } else {
            "Mixed pattern"
        };

        eprintln!("{}", notes);
    }
}

#[test]
fn test_understand_address_space_model() {
    eprintln!("\n=== ANALYZING ADDRESS SPACE CONSUMPTION PATTERN ===\n");

    // Theory: gVisor allocates fixed address space per arena
    // If that's true: (size × threads) × arena_count must stay under limit
    //
    // Our observations:
    // - Arena=1 safe up to at least 14MB
    // - Arena=2 safe up to at least 14MB
    // - Arena=3 crashes at 4MB but passes at 3MB
    // - Arena=4 crashes at 4MB, might pass at 3MB or less
    //
    // This suggests: limit = constant / arena_count
    // Or: size_limit = k / arena_count (inverse relationship)

    eprintln!("Hypothesis: gVisor has per-arena address space budget");
    eprintln!("Formula: crash_when (allocation_size × threads) > budget_per_arena");
    eprintln!("");
    eprintln!("From observations:");
    eprintln!("- Arena=1: Passes at 14MB = 42MB total (3 threads × 14MB)");
    eprintln!("- Arena=2: Passes at 14MB = 42MB total (3 threads × 14MB)");
    eprintln!("- Arena=3: Crashes at 4MB  = 12MB total (3 threads × 4MB)");
    eprintln!("- Arena=3: Passes at 3MB  = 9MB total  (3 threads × 3MB)");
    eprintln!("");
    eprintln!("This suggests per-arena budget around 50-100MB for Arena=1,2");
    eprintln!("But Arena=3+ has different constraints (maybe shared pool?)");
    eprintln!("");
    eprintln!("Alternative: Not per-arena, but TOTAL address space");
    eprintln!("- Total available: ~1GB or ~2GB in gVisor?");
    eprintln!("- Arena=1: Uses ~50MB (42MB allocation + metadata), plenty left");
    eprintln!("- Arena=2: Uses ~50MB, still plenty");
    eprintln!("- Arena=3: Uses ~50MB + arena overhead = exceeds something");
    eprintln!("");
    eprintln!("Key insight: The crash at Arena=3 isn't gradual - it's BINARY");
    eprintln!("This suggests: Arena 3+ triggers different code path in glibc");
}

#[test]
fn test_single_allocation_per_thread() {
    eprintln!("\n=== TESTING SINGLE LARGE ALLOCATION vs STRING CLONE ===\n");
    eprintln!("Current test: String.repeat() + clone per thread");
    eprintln!("Question: Does the allocation pattern (many small vs few large) matter?");
}
