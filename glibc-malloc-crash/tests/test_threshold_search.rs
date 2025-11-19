//! Binary search for minimal crash thresholds
//!
//! This test file contains parameterized versions of the reproduction tests
//! to find the minimum allocation count that triggers SIGSEGV.

use std::sync::Arc;

/// Parameterized std-only test
///
/// Creates `total_bytes / chunk_size * chunk_size` allocations
/// (the division then multiplication simulates chunking behavior)
fn run_std_test_with_size(total_bytes: usize, chunk_size: usize) -> bool {
    eprintln!("\n[TEST] Std-only with {}MB total, {} byte chunks", total_bytes / (1024 * 1024), chunk_size);

    let large_string = "x".repeat(total_bytes);
    let num_chunks = total_bytes / chunk_size;
    let expected_allocations = num_chunks * chunk_size * 3; // 3 threads
    eprintln!("[TEST] Expected ~{} million allocations", expected_allocations / 1_000_000);

    let handles: Vec<_> = (0..3)
        .map(|i| {
            let content = large_string.clone();
            std::thread::spawn(move || {
                let mut vecs: Vec<Vec<String>> = Vec::new();

                for chunk in content.as_bytes().chunks(chunk_size) {
                    let mut inner_vec = Vec::new();
                    for byte in chunk {
                        inner_vec.push(byte.to_string());
                    }
                    vecs.push(inner_vec);
                }

                eprintln!("[THREAD {}] Completed {} chunks", i, vecs.len());
                vecs.len()
            })
        })
        .collect();

    let results: Vec<_> = handles
        .into_iter()
        .map(|h| h.join())
        .collect();

    let all_success = results.iter().all(|r| r.is_ok());
    eprintln!("[TEST] Result: {}", if all_success { "PASS" } else { "CRASH" });
    all_success
}

/// Parameterized GeoJSON test
///
/// Creates a GeoJSON file with `num_features` features
/// Each feature triggers ~50-100 allocations during parsing
fn run_geojson_test_with_features(num_features: usize) -> bool {
    eprintln!("\n[TEST] GeoJSON with {} features", num_features);
    eprintln!("[TEST] Expected ~{} million allocations", (num_features * 75 * 3) / 1_000_000);

    let geojson_content = generate_geojson_features(num_features);
    let content = Arc::new(geojson_content);

    let handles: Vec<_> = (0..3)
        .map(|i| {
            let content = Arc::clone(&content);
            std::thread::spawn(move || {
                match content.parse::<geojson::GeoJson>() {
                    Ok(geojson) => {
                        let _ = format!("{:?}", geojson);
                        eprintln!("[THREAD {}] Parse success", i);
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
        .map(|h| h.join())
        .collect();

    let all_success = results.iter().all(|r| r.is_ok() && r.as_ref().unwrap() == &true);
    eprintln!("[TEST] Result: {}", if all_success { "PASS" } else { "CRASH" });
    all_success
}

fn generate_geojson_features(num_features: usize) -> String {
    let mut features = Vec::new();

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

// Binary search tests - std-only

#[test]
fn test_std_threshold_1mb() {
    assert!(run_std_test_with_size(1 * 1024 * 1024, 1000));
}

#[test]
fn test_std_threshold_2mb() {
    assert!(run_std_test_with_size(2 * 1024 * 1024, 1000));
}

#[test]
fn test_std_threshold_3mb() {
    assert!(run_std_test_with_size(3 * 1024 * 1024, 1000));
}

#[test]
fn test_std_threshold_4mb() {
    assert!(run_std_test_with_size(4 * 1024 * 1024, 1000));
}

#[test]
fn test_std_threshold_2_5mb() {
    assert!(run_std_test_with_size((2.5 * 1024.0 * 1024.0) as usize, 1000));
}

#[test]
fn test_std_threshold_3_5mb() {
    assert!(run_std_test_with_size((3.5 * 1024.0 * 1024.0) as usize, 1000));
}

// Binary search tests - GeoJSON

#[test]
fn test_geojson_threshold_2k() {
    assert!(run_geojson_test_with_features(2_000));
}

#[test]
fn test_geojson_threshold_5k() {
    assert!(run_geojson_test_with_features(5_000));
}

#[test]
fn test_geojson_threshold_10k() {
    assert!(run_geojson_test_with_features(10_000));
}

#[test]
fn test_geojson_threshold_15k() {
    assert!(run_geojson_test_with_features(15_000));
}

#[test]
fn test_geojson_threshold_20k() {
    assert!(run_geojson_test_with_features(20_000));
}

#[test]
fn test_geojson_threshold_30k() {
    assert!(run_geojson_test_with_features(30_000));
}

#[test]
fn test_geojson_threshold_40k() {
    assert!(run_geojson_test_with_features(40_000));
}

#[test]
fn test_geojson_threshold_35k() {
    assert!(run_geojson_test_with_features(35_000));
}

#[test]
fn test_geojson_threshold_25k() {
    assert!(run_geojson_test_with_features(25_000));
}
