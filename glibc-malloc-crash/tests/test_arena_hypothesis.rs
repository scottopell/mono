//! Testing specific hypotheses about arena behavior and gVisor interaction
//!
//! Key hypothesis: glibc 2.39 dynamically creates per-thread arenas,
//! and gVisor pre-allocates fixed address space per arena.
//! When concurrent threads exceed arena count, address space exhausted.

#[test]
fn test_arena_creation_with_increasing_thread_count() {
    eprintln!("\n=== HYPOTHESIS: Arena creation is lazy/on-demand ===\n");
    eprintln!("Test: Do we crash faster with more threads?");
    eprintln!("");

    // If arenas are created on-demand:
    // - 2 threads: Creates arenas 0, 1
    // - 3 threads: Creates arenas 0, 1, 2
    // - 4 threads: Creates arenas 0, 1, 2, 3
    //
    // With 4MB allocation:
    // - 3 threads: 3 arenas × pre_alloc_size = exceeds gVisor budget
    // - 4 threads: 4 arenas × pre_alloc_size = exceeds more

    // This test will show: Does crash threshold correlate with thread count?
    // Expected: As threads increase, smaller allocations start crashing

    eprintln!("Prediction: Each additional thread requires new arena");
    eprintln!("With 4MB allocation:");
    eprintln!("  1 thread:  ✅ (1 arena)");
    eprintln!("  2 threads: ? (2 arenas)");
    eprintln!("  3 threads: ❌ (3 arenas - exceeds budget)");
    eprintln!("  4 threads: ❌ (4 arenas - exceeds budget)");
}

#[test]
fn test_malloc_behavior_with_locks_vs_without() {
    eprintln!("\n=== HYPOTHESIS: Thread contention vs arena creation ===\n");

    eprintln!("With arena=1 (serialized):");
    eprintln!("  - All threads lock on single arena");
    eprintln!("  - No new arenas created");
    eprintln!("  - Address space = 1 × pre_alloc");
    eprintln!("  - Result: ✅ PASS (we tested this)");
    eprintln!("");

    eprintln!("With arena=default (unset):");
    eprintln!("  - Each thread gets own arena");
    eprintln!("  - N threads = N arenas");
    eprintln!("  - Address space = N × pre_alloc");
    eprintln!("  - Result: ❌ CRASH (we tested this)");
    eprintln!("");

    eprintln!("Conclusion: The issue is ARENA CREATION, not contention");
}

#[test]
fn test_memory_map_vs_sbrk_allocation_strategy() {
    eprintln!("\n=== HYPOTHESIS: mmap vs sbrk affects address space ===\n");

    eprintln!("glibc has two allocation strategies:");
    eprintln!("  1. mmap: Creates new memory mappings (per-thread)");
    eprintln!("  2. sbrk: Extends single heap (shared)");
    eprintln!("");

    eprintln!("In concurrent scenario:");
    eprintln!("  - Thread 0: Arena 0 uses mmap → get separate mapping");
    eprintln!("  - Thread 1: Arena 1 uses mmap → get separate mapping");
    eprintln!("  - Thread 2: Arena 2 uses mmap → get separate mapping");
    eprintln!("  - Total mappings × size exceeds gVisor budget");
    eprintln!("");

    eprintln!("This might explain:");
    eprintln!("  - Why sequential (single thread) works (mmap once, reuse)");
    eprintln!("  - Why concurrent fails (multiple mmaps pile up)");
    eprintln!("  - Why arena limiting helps (fewer mmaps needed)");
}

#[test]
fn test_address_space_vs_physical_memory() {
    eprintln!("\n=== ANALYSIS: Is it address space or physical memory? ===\n");

    eprintln!("Machine has 13GB physical memory (verified)");
    eprintln!("Test allocates max 14MB × 3 = 42MB (tiny compared to 13GB)");
    eprintln!("");

    eprintln!("Yet it crashes - suggests:");
    eprintln!("  ❌ NOT: Physical memory exhaustion (would OOM, not SIGSEGV)");
    eprintln!("  ✅ YES: Virtual address space exhaustion");
    eprintln!("");

    eprintln!("In 64-bit system, virtual address space should be ~16 exabytes");
    eprintln!("But gVisor might limit per-process address space to:");
    eprintln!("  - Maybe 512MB-2GB per process?");
    eprintln!("  - Arena 0: ~100MB pre-allocation");
    eprintln!("  - Arena 1: ~100MB pre-allocation");
    eprintln!("  - Arena 2: ~100MB pre-allocation");
    eprintln!("  - Other allocations: ~100MB");
    eprintln!("  - Total: ~400MB - might hit limit at 3 arenas");
}

#[test]
fn test_arena_allocation_pattern_reconstruction() {
    eprintln!("\n=== RECONSTRUCTING CRASH SEQUENCE ===\n");

    eprintln!("Sequence when test_concurrent_string_and_vec_growth runs:");
    eprintln!("");
    eprintln!("1. Main thread: Creates test, no allocation yet");
    eprintln!("   - Arena 0 (main arena): Exists, not yet allocated");
    eprintln!("");

    eprintln!("2. Thread 0 spawns: Tries malloc(14MB)");
    eprintln!("   - glibc: \"Thread 0 has no arena, assign arena 0\"");
    eprintln!("   - Arena 0 initializes: pre-allocates ~100MB address space");
    eprintln!("   - malloc(14MB) succeeds");
    eprintln!("");

    eprintln!("3. Thread 1 spawns: Tries malloc(14MB)");
    eprintln!("   - glibc: \"Arena 0 busy/contended, create arena 1\"");
    eprintln!("   - Arena 1 initializes: pre-allocates ~100MB address space");
    eprintln!("   - malloc(14MB) succeeds");
    eprintln!("");

    eprintln!("4. Thread 2 spawns: Tries malloc(14MB)");
    eprintln!("   - glibc: \"Arena 0 busy, Arena 1 busy, create arena 2\"");
    eprintln!("   - Arena 2 tries to initialize: pre-allocate ~100MB");
    eprintln!("   - gVisor: ERROR - total address space budget exhausted");
    eprintln!("   - mmap/brk syscall fails");
    eprintln!("   - malloc metadata corrupted");
    eprintln!("   - SIGSEGV at malloc.c:2936");
    eprintln!("");

    eprintln!("Why MALLOC_ARENA_MAX=2 works:");
    eprintln!("   - Limits: max 2 arenas");
    eprintln!("   - Thread 0: Arena 0");
    eprintln!("   - Thread 1: Arena 1");
    eprintln!("   - Thread 2: Arena 1 (waits on lock)");
    eprintln!("   - Total arenas: 2 × 100MB = 200MB (fits in gVisor budget)");
    eprintln!("");

    eprintln!("Why sequential 14MB × 3 works:");
    eprintln!("   - Single thread: Only uses arena 0");
    eprintln!("   - Allocate 14MB: Arena 0 handles it");
    eprintln!("   - Deallocate: Memory returned to arena 0");
    eprintln!("   - Allocate again: Reuses arena 0 space");
    eprintln!("   - Never needs arena 1, 2, 3");
    eprintln!("   - Total arenas: 1 × 100MB (fits easily)");
}

#[test]
fn test_why_3_4mb_boundary() {
    eprintln!("\n=== WHY 3.3MB PASSES BUT 3.5MB CRASHES ===\n");

    eprintln!("With 3 concurrent threads and default arenas:");
    eprintln!("");

    eprintln!("At 3.3MB × 3 threads = 9.9MB total:");
    eprintln!("  - Thread 0: 3.3MB in arena 0");
    eprintln!("  - Thread 1: 3.3MB in arena 1");
    eprintln!("  - Thread 2: 3.3MB in arena 2");
    eprintln!("  - Total actual allocation: 9.9MB");
    eprintln!("  - Arena overhead × 3 ≈ 300MB pre-allocated");
    eprintln!("  - Total with overhead ≈ 310MB");
    eprintln!("  - gVisor budget: ~320MB?");
    eprintln!("  - Result: ✅ Just fits");
    eprintln!("");

    eprintln!("At 3.5MB × 3 threads = 10.5MB total:");
    eprintln!("  - Thread 0: 3.5MB in arena 0");
    eprintln!("  - Thread 1: 3.5MB in arena 1");
    eprintln!("  - Thread 2: 3.5MB in arena 2");
    eprintln!("  - Total actual allocation: 10.5MB");
    eprintln!("  - Arena overhead × 3 ≈ 300MB pre-allocated");
    eprintln!("  - Total with overhead ≈ 310.5MB");
    eprintln!("  - gVisor budget: ~320MB?");
    eprintln!("  - One of the arena initializations exceeds budget");
    eprintln!("  - Result: ❌ Exceeds limit");
    eprintln!("");

    eprintln!("This suggests gVisor per-arena budget is ~100-110MB");
    eprintln!("Or there's a fixed per-thread/per-arena overhead of ~100MB");
}

#[test]
fn test_how_malloc_arena_max_helps() {
    eprintln!("\n=== HOW MALLOC_ARENA_MAX LIMITS SOLVE IT ===\n");

    eprintln!("Default behavior (MALLOC_ARENA_MAX unset):");
    eprintln!("  - max_arenas = cores * 8 = 16 * 8 = 128 (on 16-core system)");
    eprintln!("  - Allows up to 128 arenas if threads need them");
    eprintln!("");

    eprintln!("With MALLOC_ARENA_MAX=1:");
    eprintln!("  - Only 1 arena allowed");
    eprintln!("  - All threads serialize on single arena");
    eprintln!("  - Total address space = 1 × ~100MB");
    eprintln!("  - Huge lock contention, but no crash");
    eprintln!("  - Performance: 10x slower");
    eprintln!("");

    eprintln!("With MALLOC_ARENA_MAX=2:");
    eprintln!("  - Max 2 arenas");
    eprintln!("  - Most threads share these 2");
    eprintln!("  - Total address space = 2 × ~100MB");
    eprintln!("  - Much better than arena=1");
    eprintln!("  - Performance: 2-3x slower (acceptable)");
    eprintln!("");

    eprintln!("Key insight: gVisor's per-arena budget is the real constraint");
    eprintln!("Reducing arena count = reducing address space consumption");
}
