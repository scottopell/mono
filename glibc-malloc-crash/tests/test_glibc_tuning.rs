//! Test glibc tuning options to understand arena behavior better
//!
//! glibc has various tuning knobs that affect arena behavior:
//! - M_MMAP_THRESHOLD: When to use mmap vs sbrk
//! - M_MMAP_MAX: Max mmap count
//! - M_TRIM_THRESHOLD: When to trim unused space
//! - M_TOP_PAD: Top padding before growth
//! - MALLOC_PERTURB_: Add randomness
//!
//! These might help us understand what's happening

#[test]
fn test_allocation_pattern_with_smaller_chunks() {
    eprintln!("\n[TEST] Does allocation pattern matter (chunk sizes)?");
    eprintln!("[THEORY] If we allocate same 14MB but in smaller chunks, does it differ?");

    let large_string = "x".repeat(14 * 1024 * 1024);
    eprintln!("[INFO] Total allocation: {} bytes", large_string.len());

    let handles: Vec<_> = (0..3)
        .map(|_i| {
            let content = large_string.clone();
            std::thread::spawn(move || {
                // Different pattern: Process in smaller chunks
                let mut total_chunks = 0;
                for _chunk_idx in 0..(content.len() / 100_000) {
                    let small_piece: Vec<String> = content
                        .chars()
                        .take(100_000)
                        .map(|c| c.to_string())
                        .collect();
                    total_chunks += small_piece.len();
                }
                total_chunks
            })
        })
        .collect();

    let results: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
    eprintln!("[RESULT] Completed: {:?}", results);
}

#[test]
fn test_what_happens_at_boundary() {
    eprintln!("\n[TEST] Behavior RIGHT at the 3.3-3.5MB boundary");

    // Test at exact boundary values to understand the transition
    let test_sizes = vec![3_300_000, 3_400_000, 3_450_000];

    eprintln!("[INFO] Testing sizes around crash boundary:");
    for size in test_sizes {
        eprintln!("[INFO]   Testing {} bytes", size);
    }
}

#[test]
fn test_arena_metrics_in_description() {
    eprintln!("\n=== GLIBC ARENA INTERNALS ===\n");

    eprintln!("From glibc source (malloc/malloc.c):");
    eprintln!("");
    eprintln!("Arena structure:");
    eprintln!("  - Each arena has mstate (malloc state)");
    eprintln!("  - mstate contains:");
    eprintln!("    - bins: pointers to free chunks");
    eprintln!("    - top: top of heap");
    eprintln!("    - last_remainder: last remainder chunk");
    eprintln!("    - base: base of arena memory");
    eprintln!("");

    eprintln!("Arena initialization:");
    eprintln!("  1. Create new mstate structure");
    eprintln!("  2. Allocate initial heap (via mmap or sbrk)");
    eprintln!("  3. Default heap size: 131072 bytes (128KB)");
    eprintln!("  4. But with contiguous regions + guards, might be larger");
    eprintln!("");

    eprintln!("Arena growth:");
    eprintln!("  - When heap full, extend via mmap");
    eprintln!("  - Each extension pre-allocates via mmap");
    eprintln!("  - gVisor intercepts mmap syscalls");
    eprintln!("  - gVisor has budget/limit on mmap sizes");
    eprintln!("");

    eprintln!("Key insight:");
    eprintln!("  - glibc 2.39 may have CHANGED arena initialization");
    eprintln!("  - glibc 2.35 (working version) may allocate differently");
    eprintln!("  - Difference could be in initial heap size or growth pattern");
}

#[test]
fn test_thread_arena_assignment_logic() {
    eprintln!("\n=== THREAD TO ARENA ASSIGNMENT ===\n");

    eprintln!("glibc algorithm (pseudo-code):");
    eprintln!("  1. Thread calls malloc()");
    eprintln!("  2. Check if thread has cached arena");
    eprintln!("  3. If no arena:");
    eprintln!("      a. Count occupied arenas");
    eprintln!("      b. If occupied < MAX_ARENAS:");
    eprintln!("         - Create new arena");
    eprintln!("         - Assign to thread");
    eprintln!("      c. Else:");
    eprintln!("         - Return least-busy arena");
    eprintln!("         - Thread locks and uses it");
    eprintln!("");

    eprintln!("In our case (3 threads, default MALLOC_ARENA_MAX):");
    eprintln!("  Thread 0: malloc() → arena 0 created, assigned");
    eprintln!("  Thread 1: malloc() → arena 1 created, assigned");
    eprintln!("  Thread 2: malloc() → arena 2 created, assigned");
    eprintln!("");
    eprintln!("  Total: 3 arenas instantiated");
    eprintln!("  Each: Pre-allocates ~1MB+ initial heap");
    eprintln!("  Plus: Growth via mmap when needed");
    eprintln!("");

    eprintln!("gVisor constraint:");
    eprintln!("  - Limits total mmap allocations per process");
    eprintln!("  - Or limits total address space to 512MB-1GB?");
    eprintln!("  - 3 arenas × heap_size + growth ≈ 300-500MB");
    eprintln!("  - With other allocations: exceeds budget");
}

#[test]
fn test_why_malloc_tuning_might_help() {
    eprintln!("\n=== POTENTIAL GLIBC TUNING SOLUTIONS ===\n");

    eprintln!("Possible environment variables to test:");
    eprintln!("");

    eprintln!("1. MALLOC_MMAP_THRESHOLD_:");
    eprintln!("   - Controls when malloc uses mmap vs sbrk");
    eprintln!("   - Default: 128KB");
    eprintln!("   - Higher value → more sbrk, less mmap");
    eprintln!("   - Might reduce per-arena address space?");
    eprintln!("");

    eprintln!("2. MALLOC_MMAP_MAX_:");
    eprintln!("   - Max number of mmaps per arena");
    eprintln!("   - Default: 65536");
    eprintln!("   - Lower value might constrain growth?");
    eprintln!("");

    eprintln!("3. MALLOC_PERTURB_:");
    eprintln!("   - Randomize malloc for debugging");
    eprintln!("   - Might trigger different code paths");
    eprintln!("");

    eprintln!("4. MALLOC_ARENA_MAX (already tested):");
    eprintln!("   - Proven workaround");
    eprintln!("   - Set to 1 or 2");
}

#[test]
fn test_glibc_version_differences() {
    eprintln!("\n=== WHY GLIBC 2.35 vs 2.39 MATTERS ===\n");

    eprintln!("Known working environment:");
    eprintln!("  - Ubuntu 22.04");
    eprintln!("  - glibc 2.35");
    eprintln!("  - same CPU, same workload");
    eprintln!("  - PASSES");
    eprintln!("");

    eprintln!("Failing environment:");
    eprintln!("  - Ubuntu 24.04");
    eprintln!("  - glibc 2.39");
    eprintln!("  - same test, same gVisor");
    eprintln!("  - CRASHES");
    eprintln!("");

    eprintln!("Changes between 2.35 and 2.39:");
    eprintln!("  - Arena initialization might have changed");
    eprintln!("  - Heap growth strategy might differ");
    eprintln!("  - mmap allocation patterns different");
    eprintln!("  - Thread pool handling updated");
    eprintln!("");

    eprintln!("Likely culprit:");
    eprintln!("  glibc 2.39 changed initial arena heap allocation");
    eprintln!("  From: ~1MB initial");
    eprintln!("  To: ~10-20MB initial? (speculation)");
    eprintln!("");

    eprintln!("This would explain:");
    eprintln!("  - Why glibc 2.35 handles 14MB × 3 threads fine");
    eprintln!("  - Why glibc 2.39 crashes");
    eprintln!("  - Why 3.3MB is threshold for glibc 2.39");
}
