/// Deep investigation of malloc tuning parameters
///
/// Test different MALLOC_* environment variables to understand
/// how they affect address space usage and crash behavior

use std::env;
use std::thread;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

fn get_malloc_info() -> String {
    format!(
        "MALLOC_ARENA_MAX={} MALLOC_MMAP_THRESHOLD={} MALLOC_TRIM_THRESHOLD={} MALLOC_MMAP_MAX={}",
        env::var("MALLOC_ARENA_MAX").unwrap_or_else(|_| "unset".to_string()),
        env::var("MALLOC_MMAP_THRESHOLD").unwrap_or_else(|_| "unset".to_string()),
        env::var("MALLOC_TRIM_THRESHOLD").unwrap_or_else(|_| "unset".to_string()),
        env::var("MALLOC_MMAP_MAX").unwrap_or_else(|_| "unset".to_string()),
    )
}

/// Test if MALLOC_MMAP_THRESHOLD affects the crash
///
/// MALLOC_MMAP_THRESHOLD controls when malloc uses mmap() vs brk().
/// Default is usually 128KB. Larger threshold = more brk, less mmap.
///
/// If address space exhaustion is from too many mmap regions,
/// increasing this should help.
#[test]
fn test_mmap_threshold_effect() {
    println!("\n=== Testing MALLOC_MMAP_THRESHOLD Effect ===");
    println!("Current settings: {}", get_malloc_info());
    println!("\nTheory: If crash is from too many mmap() regions,");
    println!("setting high MALLOC_MMAP_THRESHOLD should force brk() instead.");
    println!("This would reduce address space fragmentation.\n");

    // Note: This test needs to be run with env var set externally
    // Run like: MALLOC_MMAP_THRESHOLD=67108864 cargo test ...

    let threshold = env::var("MALLOC_MMAP_THRESHOLD")
        .unwrap_or_else(|_| "default".to_string());

    println!("MALLOC_MMAP_THRESHOLD = {}", threshold);
    println!("(Set to 64MB = 67108864 to force brk for our allocations)\n");

    // 4MB × 3 threads (known crash condition without arena limit)
    let size = 4 * 1024 * 1024;
    let ready = Arc::new(AtomicBool::new(false));
    let mut handles = vec![];

    for i in 0..3 {
        let ready_clone = ready.clone();
        let handle = thread::spawn(move || {
            while !ready_clone.load(Ordering::Relaxed) {
                std::hint::spin_loop();
            }

            let mut data = String::with_capacity(size);
            for _ in 0..size {
                data.push('X');
            }
            println!("[THREAD {}] Allocated {} bytes", i, data.len());
            data.len()
        });
        handles.push(handle);
    }

    ready.store(true, Ordering::Relaxed);

    for handle in handles {
        handle.join().unwrap();
    }

    println!("\n✅ Test completed successfully!");
}

/// Test if MALLOC_MMAP_MAX affects crash behavior
///
/// MALLOC_MMAP_MAX limits number of mmap regions (default: 65536)
/// If set to 0, mmap is disabled entirely (only brk).
#[test]
fn test_mmap_max_effect() {
    println!("\n=== Testing MALLOC_MMAP_MAX Effect ===");
    println!("Current settings: {}", get_malloc_info());
    println!("\nTheory: If crash from too many concurrent mmap() calls,");
    println!("MALLOC_MMAP_MAX=0 should disable mmap entirely.\n");

    let mmap_max = env::var("MALLOC_MMAP_MAX")
        .unwrap_or_else(|_| "default".to_string());

    println!("MALLOC_MMAP_MAX = {}", mmap_max);
    println!("(Set to 0 to completely disable mmap, force brk only)\n");

    let size = 4 * 1024 * 1024;
    let ready = Arc::new(AtomicBool::new(false));
    let mut handles = vec![];

    for i in 0..3 {
        let ready_clone = ready.clone();
        let handle = thread::spawn(move || {
            while !ready_clone.load(Ordering::Relaxed) {
                std::hint::spin_loop();
            }

            let mut data = String::with_capacity(size);
            for _ in 0..size {
                data.push('X');
            }
            println!("[THREAD {}] Allocated {} bytes", i, data.len());
            data.len()
        });
        handles.push(handle);
    }

    ready.store(true, Ordering::Relaxed);

    for handle in handles {
        handle.join().unwrap();
    }

    println!("\n✅ Test completed successfully!");
}

/// Test allocation pattern: many small vs few large
///
/// If crash is address space exhaustion, allocation pattern might matter.
#[test]
fn test_allocation_pattern_many_small() {
    println!("\n=== Testing Allocation Pattern: Many Small ===");
    println!("Current settings: {}", get_malloc_info());
    println!("\nAllocating same total (4MB) as many small allocations");
    println!("instead of one large allocation.\n");

    let ready = Arc::new(AtomicBool::new(false));
    let mut handles = vec![];

    for i in 0..3 {
        let ready_clone = ready.clone();
        let handle = thread::spawn(move || {
            while !ready_clone.load(Ordering::Relaxed) {
                std::hint::spin_loop();
            }

            // Allocate 4MB as 1000 × 4KB chunks
            let mut chunks = Vec::new();
            for j in 0..1000 {
                let chunk = vec![b'X'; 4096];
                chunks.push(chunk);

                if j % 250 == 0 {
                    println!("[THREAD {}] Allocated {} chunks ({} KB)",
                             i, j, j * 4);
                }
            }

            let total: usize = chunks.iter().map(|c| c.len()).sum();
            println!("[THREAD {}] Total allocated: {} bytes", i, total);
            total
        });
        handles.push(handle);
    }

    ready.store(true, Ordering::Relaxed);

    for handle in handles {
        handle.join().unwrap();
    }

    println!("\n✅ Test completed successfully!");
}

/// Test Vec vs String allocation
///
/// Vec and String might use different allocation paths.
#[test]
fn test_vec_vs_string_allocation() {
    println!("\n=== Testing Vec<u8> vs String Allocation ===");
    println!("Current settings: {}", get_malloc_info());

    let size = 4 * 1024 * 1024;
    let ready = Arc::new(AtomicBool::new(false));
    let mut handles = vec![];

    for i in 0..3 {
        let ready_clone = ready.clone();
        let handle = thread::spawn(move || {
            while !ready_clone.load(Ordering::Relaxed) {
                std::hint::spin_loop();
            }

            // Use Vec<u8> instead of String
            let mut data = Vec::with_capacity(size);
            data.resize(size, b'X');

            println!("[THREAD {}] Allocated Vec<u8>: {} bytes", i, data.len());
            data.len()
        });
        handles.push(handle);
    }

    ready.store(true, Ordering::Relaxed);

    for handle in handles {
        handle.join().unwrap();
    }

    println!("\n✅ Test completed successfully!");
}

/// Test with explicit drop to see if cleanup matters
#[test]
fn test_sequential_alloc_with_drops() {
    println!("\n=== Sequential Allocation with Explicit Drops ===");
    println!("Current settings: {}", get_malloc_info());
    println!("\nTheory: If arena address space persists after dealloc,");
    println!("dropping between allocations might not help.\n");

    for i in 0..3 {
        println!("--- Round {} ---", i + 1);

        let data = "X".repeat(4 * 1024 * 1024);
        println!("Allocated {} bytes", data.len());

        drop(data);
        println!("Dropped allocation");

        // Small delay
        std::thread::sleep(std::time::Duration::from_millis(100));
    }

    println!("\n✅ All sequential allocations completed!");
}
