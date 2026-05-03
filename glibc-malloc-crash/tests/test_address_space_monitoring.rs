/// Direct testing of address space exhaustion hypothesis
///
/// This test monitors /proc/self/maps to observe actual address space usage
/// during concurrent allocations with different arena configurations.

use std::fs;
use std::thread;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

/// Parse /proc/self/maps and return statistics
#[derive(Debug)]
struct AddressSpaceStats {
    total_regions: usize,
    heap_regions: usize,
    anon_regions: usize,
    total_virtual_kb: u64,
    largest_gap_kb: u64,
}

fn parse_proc_maps() -> AddressSpaceStats {
    let maps = fs::read_to_string("/proc/self/maps").unwrap_or_default();
    let lines: Vec<&str> = maps.lines().collect();

    let mut total_regions = 0;
    let mut heap_regions = 0;
    let mut anon_regions = 0;
    let mut total_virtual_kb = 0u64;
    let mut prev_end: Option<u64> = None;
    let mut largest_gap_kb = 0u64;

    for line in lines {
        total_regions += 1;

        // Parse address range: "start-end perms ..."
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.is_empty() {
            continue;
        }

        let addr_range = parts[0];
        let addrs: Vec<&str> = addr_range.split('-').collect();
        if addrs.len() != 2 {
            continue;
        }

        let start = u64::from_str_radix(addrs[0], 16).unwrap_or(0);
        let end = u64::from_str_radix(addrs[1], 16).unwrap_or(0);
        let size_kb = (end - start) / 1024;

        total_virtual_kb += size_kb;

        // Track gaps
        if let Some(prev) = prev_end {
            let gap_kb = (start.saturating_sub(prev)) / 1024;
            largest_gap_kb = largest_gap_kb.max(gap_kb);
        }
        prev_end = Some(end);

        // Categorize regions
        if parts.len() >= 6 {
            let name = parts[5];
            if name.contains("[heap]") {
                heap_regions += 1;
            }
        } else if parts.len() == 5 {
            // Anonymous mapping (no name)
            anon_regions += 1;
        }
    }

    AddressSpaceStats {
        total_regions,
        heap_regions,
        anon_regions,
        total_virtual_kb,
        largest_gap_kb,
    }
}

fn print_address_space_stats(label: &str) {
    let stats = parse_proc_maps();
    println!("[{}] Address Space Stats:", label);
    println!("  Total regions: {}", stats.total_regions);
    println!("  Heap regions: {}", stats.heap_regions);
    println!("  Anonymous regions: {}", stats.anon_regions);
    println!("  Total virtual address space: {} KB ({} MB)",
             stats.total_virtual_kb, stats.total_virtual_kb / 1024);
    println!("  Largest gap: {} KB ({} MB)",
             stats.largest_gap_kb, stats.largest_gap_kb / 1024);
}

#[test]
fn test_address_space_baseline() {
    println!("\n=== Address Space Baseline (No Allocations) ===");
    print_address_space_stats("BASELINE");
}

#[test]
fn test_address_space_single_thread_large_alloc() {
    println!("\n=== Single Thread: 14MB Allocation ===");
    print_address_space_stats("BEFORE");

    let large_string = "X".repeat(14 * 1024 * 1024);
    println!("Allocated {} bytes", large_string.len());

    print_address_space_stats("AFTER");
}

#[test]
fn test_address_space_concurrent_safe() {
    println!("\n=== Concurrent 3 Threads: 3MB Each (Known Safe) ===");
    print_address_space_stats("BEFORE");

    let ready = Arc::new(AtomicBool::new(false));
    let mut handles = vec![];

    for i in 0..3 {
        let ready_clone = ready.clone();
        let handle = thread::spawn(move || {
            // Wait for all threads to be ready
            while !ready_clone.load(Ordering::Relaxed) {
                std::hint::spin_loop();
            }

            let mut data = String::with_capacity(3 * 1024 * 1024);
            for _ in 0..(3 * 1024 * 1024) {
                data.push('X');
            }
            println!("[THREAD {}] Allocated {} bytes", i, data.len());
            data.len()
        });
        handles.push(handle);
    }

    print_address_space_stats("THREADS_STARTED");
    ready.store(true, Ordering::Relaxed);

    for handle in handles {
        handle.join().unwrap();
    }

    print_address_space_stats("AFTER_COMPLETION");
}

#[test]
fn test_address_space_concurrent_boundary() {
    println!("\n=== Concurrent 3 Threads: 3.3MB Each (Boundary Test) ===");
    print_address_space_stats("BEFORE");

    let ready = Arc::new(AtomicBool::new(false));
    let mut handles = vec![];

    for i in 0..3 {
        let ready_clone = ready.clone();
        let handle = thread::spawn(move || {
            while !ready_clone.load(Ordering::Relaxed) {
                std::hint::spin_loop();
            }

            let size = (3.3 * 1024.0 * 1024.0) as usize;
            let mut data = String::with_capacity(size);
            for _ in 0..size {
                data.push('X');
            }
            println!("[THREAD {}] Allocated {} bytes", i, data.len());
            data.len()
        });
        handles.push(handle);
    }

    print_address_space_stats("THREADS_STARTED");
    ready.store(true, Ordering::Relaxed);

    for handle in handles {
        handle.join().unwrap();
    }

    print_address_space_stats("AFTER_COMPLETION");
}

#[test]
fn test_address_space_incremental_growth() {
    println!("\n=== Incremental Growth: Monitor Address Space at Each Step ===");

    print_address_space_stats("STEP_0_BASELINE");

    println!("\n--- Allocating 1MB ---");
    let _alloc1 = "X".repeat(1 * 1024 * 1024);
    print_address_space_stats("STEP_1_1MB");

    println!("\n--- Allocating another 2MB (3MB total) ---");
    let _alloc2 = "X".repeat(2 * 1024 * 1024);
    print_address_space_stats("STEP_2_3MB");

    println!("\n--- Allocating another 5MB (8MB total) ---");
    let _alloc3 = "X".repeat(5 * 1024 * 1024);
    print_address_space_stats("STEP_3_8MB");

    println!("\n--- Allocating another 6MB (14MB total) ---");
    let _alloc4 = "X".repeat(6 * 1024 * 1024);
    print_address_space_stats("STEP_4_14MB");
}

#[test]
fn test_count_arenas_via_maps() {
    println!("\n=== Counting Arena Regions via /proc/self/maps ===");

    print_address_space_stats("BEFORE");

    // Trigger arena creation with concurrent allocations
    let ready = Arc::new(AtomicBool::new(false));
    let mut handles = vec![];

    for i in 0..3 {
        let ready_clone = ready.clone();
        let handle = thread::spawn(move || {
            while !ready_clone.load(Ordering::Relaxed) {
                std::hint::spin_loop();
            }

            // Small allocation to trigger arena assignment
            let mut data = Vec::with_capacity(1024);
            data.push(i as u8);

            // Hold the allocation and report
            println!("[THREAD {}] Got arena allocation", i);

            // Keep thread alive to maintain arena
            std::thread::sleep(std::time::Duration::from_millis(100));
            data.len()
        });
        handles.push(handle);
    }

    ready.store(true, Ordering::Relaxed);

    // Give threads time to allocate
    std::thread::sleep(std::time::Duration::from_millis(50));

    print_address_space_stats("ARENAS_ACTIVE");

    for handle in handles {
        handle.join().unwrap();
    }

    print_address_space_stats("AFTER");
}
