/// Find the exact address space limit by monitoring before crash
use std::fs;
use std::thread;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

fn get_total_virtual_kb() -> u64 {
    let maps = fs::read_to_string("/proc/self/maps").unwrap_or_default();
    let mut total = 0u64;

    for line in maps.lines() {
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
        total += (end - start) / 1024;
    }

    total
}

fn count_regions() -> usize {
    fs::read_to_string("/proc/self/maps")
        .unwrap_or_default()
        .lines()
        .count()
}

#[test]
fn test_measure_before_crash_default() {
    println!("\n=== Measuring Address Space Before Crash (Default Settings) ===");

    let initial_kb = get_total_virtual_kb();
    let initial_regions = count_regions();

    println!("Initial: {} KB ({} MB), {} regions", initial_kb, initial_kb/1024, initial_regions);

    let ready = Arc::new(AtomicBool::new(false));
    let crash_detected = Arc::new(AtomicBool::new(false));
    let mut handles = vec![];

    // Create 3 threads
    for i in 0..3 {
        let ready_clone = ready.clone();
        let crash_clone = crash_detected.clone();

        let handle = thread::spawn(move || {
            while !ready_clone.load(Ordering::Relaxed) {
                std::hint::spin_loop();
            }

            // Measure before allocation
            let before_kb = get_total_virtual_kb();
            let before_regions = count_regions();

            println!("[THREAD {}] Before alloc: {} KB ({} MB), {} regions",
                     i, before_kb, before_kb/1024, before_regions);

            // Try to allocate 4MB - known crash size
            let mut data = String::with_capacity(4 * 1024 * 1024);
            for _ in 0..(4 * 1024 * 1024) {
                if crash_clone.load(Ordering::Relaxed) {
                    return (0, 0);
                }
                data.push('X');
            }

            let after_kb = get_total_virtual_kb();
            let after_regions = count_regions();

            println!("[THREAD {}] After alloc: {} KB ({} MB), {} regions",
                     i, after_kb, after_kb/1024, after_regions);
            println!("[THREAD {}] Delta: +{} KB (+{} MB), +{} regions",
                     i, after_kb - before_kb, (after_kb - before_kb)/1024, after_regions - before_regions);

            (after_kb, after_regions)
        });
        handles.push(handle);
    }

    // Measure after threads created but before they start work
    std::thread::sleep(std::time::Duration::from_millis(10));
    let after_spawn_kb = get_total_virtual_kb();
    let after_spawn_regions = count_regions();

    println!("After spawn: {} KB ({} MB), {} regions", after_spawn_kb, after_spawn_kb/1024, after_spawn_regions);
    println!("Spawn delta: +{} KB (+{} MB), +{} regions\n",
             after_spawn_kb - initial_kb, (after_spawn_kb - initial_kb)/1024, after_spawn_regions - initial_regions);

    // Start work
    ready.store(true, Ordering::Relaxed);

    // Collect results (will crash if limit exceeded)
    let mut max_kb = 0u64;
    for (i, handle) in handles.into_iter().enumerate() {
        match handle.join() {
            Ok((kb, _regions)) => {
                max_kb = max_kb.max(kb);
                println!("[THREAD {}] Completed successfully", i);
            }
            Err(e) => {
                println!("[THREAD {}] Panicked or crashed: {:?}", i, e);
                crash_detected.store(true, Ordering::Relaxed);
            }
        }
    }

    let final_kb = get_total_virtual_kb();
    let final_regions = count_regions();

    println!("\nFinal: {} KB ({} MB), {} regions", final_kb, final_kb/1024, final_regions);
    println!("Total delta: +{} KB (+{} MB)", final_kb - initial_kb, (final_kb - initial_kb)/1024);

    if crash_detected.load(Ordering::Relaxed) {
        println!("\n❌ CRASH DETECTED - Last successful measurement: {} KB ({} MB)", max_kb, max_kb/1024);
    } else {
        println!("\n✅ ALL THREADS COMPLETED");
    }
}

#[test]
fn test_measure_with_arena_limit() {
    println!("\n=== Measuring Address Space With MALLOC_ARENA_MAX=2 ===");

    // Note: This should be run with MALLOC_ARENA_MAX=2 env var

    let initial_kb = get_total_virtual_kb();
    let initial_regions = count_regions();

    println!("Initial: {} KB ({} MB), {} regions", initial_kb, initial_kb/1024, initial_regions);

    let ready = Arc::new(AtomicBool::new(false));
    let mut handles = vec![];

    for i in 0..3 {
        let ready_clone = ready.clone();

        let handle = thread::spawn(move || {
            while !ready_clone.load(Ordering::Relaxed) {
                std::hint::spin_loop();
            }

            let before_kb = get_total_virtual_kb();
            println!("[THREAD {}] Before: {} KB ({} MB)", i, before_kb, before_kb/1024);

            let mut data = String::with_capacity(14 * 1024 * 1024);
            for _ in 0..(14 * 1024 * 1024) {
                data.push('X');
            }

            let after_kb = get_total_virtual_kb();
            println!("[THREAD {}] After: {} KB ({} MB), +{} KB",
                     i, after_kb, after_kb/1024, after_kb - before_kb);

            after_kb
        });
        handles.push(handle);
    }

    std::thread::sleep(std::time::Duration::from_millis(10));
    let after_spawn_kb = get_total_virtual_kb();
    println!("After spawn: {} KB ({} MB), +{} KB\n",
             after_spawn_kb, after_spawn_kb/1024, after_spawn_kb - initial_kb);

    ready.store(true, Ordering::Relaxed);

    for handle in handles {
        handle.join().unwrap();
    }

    let final_kb = get_total_virtual_kb();
    println!("\nFinal: {} KB ({} MB)", final_kb, final_kb/1024);
    println!("✅ COMPLETED WITH ARENA LIMIT");
}

#[test]
fn test_incremental_allocation_monitoring() {
    println!("\n=== Incremental Allocation with Continuous Monitoring ===");
    println!("Growing allocation size until we find the limit\n");

    let initial_kb = get_total_virtual_kb();
    println!("Baseline: {} KB ({} MB)\n", initial_kb, initial_kb/1024);

    // Try different sizes
    let sizes_mb = vec![1, 2, 3, 4, 5, 6, 8, 10, 12, 14];

    for size_mb in sizes_mb {
        println!("--- Testing {}MB × 3 threads ---", size_mb);

        let before_kb = get_total_virtual_kb();
        let before_regions = count_regions();

        let ready = Arc::new(AtomicBool::new(false));
        let success = Arc::new(AtomicUsize::new(0));
        let mut handles = vec![];

        for i in 0..3 {
            let ready_clone = ready.clone();
            let success_clone = success.clone();

            let handle = thread::spawn(move || {
                while !ready_clone.load(Ordering::Relaxed) {
                    std::hint::spin_loop();
                }

                let size = size_mb * 1024 * 1024;
                let mut data = Vec::with_capacity(size);
                data.resize(size, b'X');

                success_clone.fetch_add(1, Ordering::Relaxed);
                data.len()
            });
            handles.push(handle);
        }

        ready.store(true, Ordering::Relaxed);

        for handle in handles {
            handle.join().ok();
        }

        let after_kb = get_total_virtual_kb();
        let after_regions = count_regions();
        let completed = success.load(Ordering::Relaxed);

        println!("  Address space: {} KB → {} KB (+{} KB, +{} MB)",
                 before_kb, after_kb, after_kb - before_kb, (after_kb - before_kb)/1024);
        println!("  Regions: {} → {} (+{})", before_regions, after_regions, after_regions - before_regions);
        println!("  Threads completed: {}/3", completed);

        if completed < 3 {
            println!("  ❌ CRASH AT {}MB", size_mb);
            println!("\n=== LIMIT FOUND: Address space reached {} KB ({} MB) before crash ===",
                     after_kb, after_kb/1024);
            break;
        } else {
            println!("  ✅ PASSED");
        }
        println!("");
    }
}
