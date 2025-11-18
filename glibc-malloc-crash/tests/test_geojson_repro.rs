//! Geojson reproducer - demonstrates crash with real-world GeoJSON parsing
//!
//! This test reproduces the SIGSEGV by parsing a large GeoJSON file
//! concurrently in multiple threads, similar to the original crash scenario.

use std::sync::Arc;

#[test]
fn test_concurrent_geojson_parsing() {
    eprintln!("\n[TEST] Concurrent GeoJSON parsing");

    // Simulate large GeoJSON content (14MB like the original)
    let geojson_content = generate_large_geojson(14 * 1024 * 1024);
    eprintln!("[TEST] Generated ~14MB GeoJSON");

    let content = Arc::new(geojson_content);

    let handles: Vec<_> = (0..3)
        .map(|i| {
            let content = Arc::clone(&content);
            std::thread::spawn(move || {
                eprintln!("[THREAD {}] Parsing GeoJSON...", i);

                // Parse GeoJSON (this triggers malloc/realloc in serde_json)
                match content.parse::<geojson::GeoJson>() {
                    Ok(geojson) => {
                        eprintln!("[THREAD {}] Parsed successfully", i);
                        // Touch the data to ensure it's actually processed
                        let _ = format!("{:?}", geojson);
                        true
                    }
                    Err(e) => {
                        eprintln!("[THREAD {}] Parse error: {}", i, e);
                        false
                    }
                }
            })
        })
        .collect();

    let results: Vec<_> = handles
        .into_iter()
        .map(|h| h.join().expect("Thread panicked"))
        .collect();

    eprintln!("[TEST] All threads completed: {:?}", results);
    assert!(results.iter().all(|&r| r), "All parses should succeed");
}

#[test]
#[cfg(feature = "jemalloc")]
fn test_geojson_with_jemalloc_workaround() {
    // This test uses jemalloc as global allocator
    // Should NOT crash even with concurrent parsing

    #[global_allocator]
    static GLOBAL: jemallocator::Jemalloc = jemallocator::Jemalloc;

    test_concurrent_geojson_parsing();
}

fn generate_large_geojson(target_size: usize) -> String {
    // Generate a valid GeoJSON FeatureCollection with many features
    let mut features = Vec::new();

    // Each feature is ~200 bytes, so we need target_size/200 features
    let num_features = target_size / 200;

    for i in 0..num_features {
        features.push(format!(
            r#"{{
                "type": "Feature",
                "geometry": {{
                    "type": "Point",
                    "coordinates": [{}, {}]
                }},
                "properties": {{
                    "id": {},
                    "name": "Point {}"
                }}
            }}"#,
            -122.0 + (i as f64 * 0.0001),
            37.0 + (i as f64 * 0.0001),
            i,
            i
        ));
    }

    format!(
        r#"{{
            "type": "FeatureCollection",
            "features": [
                {}
            ]
        }}"#,
        features.join(",\n")
    )
}
