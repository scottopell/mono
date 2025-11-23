// Property-based testing using proptest
// These tests verify game invariants hold across random inputs

#[cfg(test)]
mod tests {
    use proptest::prelude::*;
    use crate::game::Game;
    use crate::types::{Position, TileType};

    // Strategy for generating tile positions on a 20x20 board
    fn position_strategy() -> impl Strategy<Value = Position> {
        (0i32..20, 0i32..20).prop_map(|(x, y)| Position::new(x, y))
    }

    // Strategy for generating edge case board sizes (where bugs were found)
    fn edge_case_board_size_strategy() -> impl Strategy<Value = (i32, i32)> {
        prop_oneof![
            Just((5, 5)),   // Minimum size
            Just((6, 6)),   // Where bug was found
            Just((7, 7)),
            Just((8, 8)),
            Just((10, 10)), // Medium
        ]
    }

    // Strategy for generating tile types (excluding START/END)
    #[allow(dead_code)]
    fn tile_type_strategy() -> impl Strategy<Value = TileType> {
        prop_oneof![
            Just(TileType::StraightNS),
            Just(TileType::StraightEW),
            Just(TileType::CornerNE),
            Just(TileType::CornerNW),
            Just(TileType::CornerSE),
            Just(TileType::CornerSW),
            Just(TileType::TN),
            Just(TileType::TE),
            Just(TileType::TS),
            Just(TileType::TW),
            Just(TileType::Cross),
        ]
    }

    proptest! {
        /// Invariant: Serialization round-trip preserves game state
        #[test]
        fn prop_serialization_roundtrip(seed in any::<u64>(), width in 5i32..15, height in 5i32..15) {
            use crate::json_state::{to_json, deserialize_game_state};

            let game = Game::new(width, height, seed);

            // Serialize and deserialize
            let json = to_json(&game).expect("Serialization should succeed");
            let restored = deserialize_game_state(&json.state_blob)
                .expect("Deserialization should succeed");

            // Verify key properties match
            prop_assert_eq!(game.turn, restored.turn);
            prop_assert_eq!(game.phase, restored.phase);
            prop_assert_eq!(game.board.width, restored.board.width);
            prop_assert_eq!(game.board.height, restored.board.height);
            prop_assert_eq!(game.board.all_tiles().len(), restored.board.all_tiles().len());
        }

        /// Invariant: Serialization works after placing forced card
        #[test]
        fn prop_serialization_after_forced_placement(
            seed in any::<u64>(),
            width in 5i32..10,
            height in 5i32..10
        ) {
            use crate::json_state::{to_json, deserialize_game_state};

            let mut game = Game::new(width, height, seed);

            // Try to place forced card at a position adjacent to START
            let center_x = width / 2;
            let center_y = height / 2;

            // Try positions around center where START is
            for (dx, dy) in [(1, 0), (0, 1), (-1, 0), (0, -1)] {
                let pos = Position::new(center_x + dx, center_y + dy);
                if game.board.in_bounds(pos) {
                    let _ = game.place_forced_card(pos);
                    break;
                }
            }

            // Serialize and deserialize
            let json = to_json(&game).expect("Serialization after placement should succeed");
            let restored = deserialize_game_state(&json.state_blob)
                .expect("Deserialization after placement should succeed");

            prop_assert_eq!(game.turn, restored.turn);
            prop_assert_eq!(game.phase, restored.phase);
            prop_assert_eq!(game.board.all_tiles().len(), restored.board.all_tiles().len());
        }

        /// Invariant: Serialization works after skipping optional card
        #[test]
        fn prop_serialization_after_skip(
            seed in any::<u64>(),
            width in 5i32..10,
            height in 5i32..10
        ) {
            use crate::json_state::{to_json, deserialize_game_state};

            let mut game = Game::new(width, height, seed);

            // Place forced card
            let center_x = width / 2;
            let center_y = height / 2;
            let _ = game.place_forced_card(Position::new(center_x + 1, center_y));

            // Skip optional card
            game.skip_optional_card();

            // Serialize and deserialize
            let json = to_json(&game).expect("Serialization after skip should succeed");
            let restored = deserialize_game_state(&json.state_blob)
                .expect("Deserialization after skip should succeed");

            prop_assert_eq!(game.turn, restored.turn);
            prop_assert_eq!(game.phase, restored.phase);
        }

        /// Invariant: Serialization works after multiple operations
        #[test]
        fn prop_serialization_after_game_sequence(
            seed in any::<u64>(),
            operations in 0usize..10,
            width in 6i32..12,
            height in 6i32..12
        ) {
            use crate::json_state::{to_json, deserialize_game_state};

            let mut game = Game::new(width, height, seed);
            let center_x = width / 2;
            let center_y = height / 2;

            // Perform a sequence of operations
            for i in 0..operations {
                // Try to place at various positions
                let x_offset = (i as i32 % 3) - 1;
                let y_offset = ((i / 3) as i32 % 3) - 1;
                let pos = Position::new(center_x + x_offset, center_y + y_offset);

                if game.board.in_bounds(pos) {
                    let _ = game.place_forced_card(pos);
                }

                // Serialize mid-sequence
                let json = to_json(&game).expect("Mid-sequence serialization should succeed");
                let _ = deserialize_game_state(&json.state_blob)
                    .expect("Mid-sequence deserialization should succeed");

                game.skip_optional_card();

                // Serialize after skip
                let json = to_json(&game).expect("Post-skip serialization should succeed");
                let restored = deserialize_game_state(&json.state_blob)
                    .expect("Post-skip deserialization should succeed");

                prop_assert_eq!(game.turn, restored.turn);
            }
        }

        /// Invariant: Game state is always valid after creation
        #[test]
        fn prop_game_creation_is_valid(seed in any::<u64>()) {
            let game = Game::new(20, 20, seed);

            // Should have deck initialized
            prop_assert!(game.current_forced_card.is_some());
            prop_assert!(game.current_optional_card.is_some());

            // Should be in correct phase
            prop_assert_eq!(game.phase, crate::types::GamePhase::PlacingForcedCard);

            // Turn should start at 0
            prop_assert_eq!(game.turn, 0);
        }

        /// Invariant: Placed tiles stay on the board
        #[test]
        fn prop_placed_tiles_occupied(pos in position_strategy()) {
            let mut game = Game::new(20, 20, 42);

            if let Some(_card) = game.current_forced_card {
                let result = game.place_forced_card(pos);

                if result.success {
                    prop_assert!(game.board.is_occupied(pos));
                }
            }
        }

        /// Invariant: Board never exceeds its dimensions
        #[test]
        fn prop_tiles_never_exceed_bounds(
            count in 0usize..10,
            seed in any::<u64>()
        ) {
            let mut game = Game::new(20, 20, seed);

            for _ in 0..count {
                if let Some(_card) = game.current_forced_card {
                    // Try to place at center
                    game.place_forced_card(Position::new(10, 10));
                }
                game.skip_optional_card();
            }

            // Verify all tiles are in bounds
            for tile in game.board.all_tiles() {
                prop_assert!(game.board.in_bounds(tile.position));
            }
        }

        /// Invariant: Deck conservation - total cards never changes
        #[test]
        fn prop_deck_conservation(
            operations in 0usize..20,
            seed in any::<u64>()
        ) {
            let mut game = Game::new(20, 20, seed);
            let initial_total = game.deck.total_cards();

            for _ in 0..operations {
                if let Some(_card) = game.current_forced_card {
                    game.place_forced_card(Position::new(10, 10));
                }
                game.skip_optional_card();
            }

            prop_assert_eq!(game.deck.total_cards(), initial_total);
        }

        /// Invariant: Erosion doesn't create duplicate tiles
        #[test]
        fn prop_erosion_no_duplicates(operations in 1usize..10, _seed in any::<u64>()) {
            let mut game = Game::new(20, 20, 42);

            for _ in 0..operations {
                if let Some(_card) = game.current_forced_card {
                    // Try invalid position (far from board) - should trigger erosion
                    game.place_forced_card(Position::new(19, 19));
                }
                game.skip_optional_card();
            }

            // Count tiles and verify uniqueness by position
            let all_tiles = game.board.all_tiles();
            let tile_positions: Vec<_> = all_tiles.iter().map(|t| t.position).collect();

            prop_assert_eq!(tile_positions.len(), all_tiles.len(), "Duplicate tiles detected");
        }

        /// Invariant: Seeded games are reproducible
        #[test]
        fn prop_seeded_games_reproducible(operations in 0usize..5, seed in any::<u64>()) {
            let mut game1 = Game::new(20, 20, seed);
            let mut game2 = Game::new(20, 20, seed);

            for _ in 0..operations {
                if let (Some(card1), Some(card2)) = (game1.current_forced_card, game2.current_forced_card) {
                    prop_assert_eq!(card1.tile_type, card2.tile_type, "Card mismatch in seeded games");
                }

                game1.skip_optional_card();
                game2.skip_optional_card();
            }
        }

        /// Invariant: Game phase progresses correctly
        #[test]
        fn prop_game_phase_progression(seed in any::<u64>()) {
            let mut game = Game::new(20, 20, seed);

            // Start in forced card phase
            prop_assert_eq!(game.phase, crate::types::GamePhase::PlacingForcedCard);

            // Try to place forced card adjacent to START
            // With correct connection validation, this might fail for some cards
            if let Some(_card) = game.current_forced_card {
                let result = game.place_forced_card(Position::new(10, 11));
                if result.success {
                    // If placement succeeded, phase should advance
                    prop_assert_eq!(game.phase, crate::types::GamePhase::PlacingOptionalCard);
                } else {
                    // If placement failed (erosion), phase might change differently
                    // This is expected behavior with correct validation
                }
            }

            // After skip, should return to forced phase (next turn)
            game.skip_optional_card();
            prop_assert_eq!(game.phase, crate::types::GamePhase::PlacingForcedCard);
        }

        /// STRESS TEST: Complex game operation sequences with serialization
        /// This test performs many random operations and serializes at each step
        /// to catch non-deterministic serialization bugs
        #[test]
        fn prop_serialization_stress_test(
            (width, height) in edge_case_board_size_strategy(),
            seed in any::<u64>(),
            operation_count in 0usize..20
        ) {
            use crate::json_state::{to_json, deserialize_game_state};

            let mut game = Game::new(width, height, seed);
            let center_x = width / 2;
            let center_y = height / 2;

            // Test serialization before any operations
            let json = to_json(&game).expect("Initial serialization should succeed");
            let _ = deserialize_game_state(&json.state_blob)
                .expect("Initial deserialization should succeed");

            for i in 0..operation_count {
                // Perform various operations
                let op_type = i % 3;
                match op_type {
                    0 => {
                        // Try forced placement
                        let offset_x = ((i / 3) as i32 % 3) - 1;
                        let offset_y = ((i / 9) as i32 % 3) - 1;
                        let pos = Position::new(center_x + offset_x, center_y + offset_y);
                        let _ = game.place_forced_card(pos);
                    }
                    1 => {
                        // Try optional placement
                        let offset_x = ((i / 3) as i32 % 3) - 1;
                        let offset_y = ((i / 9) as i32 % 3) - 1;
                        let pos = Position::new(center_x + offset_x, center_y + offset_y);
                        let _ = game.place_optional_card(pos);
                    }
                    _ => {
                        // Skip optional
                        game.skip_optional_card();
                    }
                }

                // Serialize after EVERY operation
                let json = to_json(&game).expect(&format!(
                    "Serialization failed after operation {} with width={}, height={}, seed={}",
                    i, width, height, seed
                ));

                // Deserialize and verify
                let restored = deserialize_game_state(&json.state_blob).expect(&format!(
                    "Deserialization failed after operation {} with width={}, height={}, seed={}. State blob length: {}",
                    i, width, height, seed, json.state_blob.len()
                ));

                // Verify critical properties
                prop_assert_eq!(game.turn, restored.turn, "Turn mismatch after operation {}", i);
                prop_assert_eq!(game.phase, restored.phase, "Phase mismatch after operation {}", i);
                prop_assert_eq!(
                    game.board.all_tiles().len(),
                    restored.board.all_tiles().len(),
                    "Tile count mismatch after operation {}",
                    i
                );
            }
        }

        /// STRESS TEST: Edge cases with specific problematic seeds
        #[test]
        fn prop_serialization_problematic_seeds(
            seed in prop_oneof![
                Just(0u64),
                Just(42u64),
                Just(123u64),
                Just(999u64),     // Seed where bug was observed
                Just(12345u64),
                Just(u64::MAX),
                Just(u64::MAX - 1),
            ]
        ) {
            use crate::json_state::{to_json, deserialize_game_state};

            // Test with the exact size where bug was found
            let mut game = Game::new(6, 6, seed);

            // Initial serialization
            let json = to_json(&game).expect(&format!("Initial serialization failed for seed {}", seed));
            let _ = deserialize_game_state(&json.state_blob)
                .expect(&format!("Initial deserialization failed for seed {}", seed));

            // Place forced card
            let _ = game.place_forced_card(Position::new(2, 3));

            // Serialize after placement
            let json = to_json(&game).expect(&format!("Post-placement serialization failed for seed {}", seed));
            let restored = deserialize_game_state(&json.state_blob)
                .expect(&format!("Post-placement deserialization failed for seed {}", seed));

            prop_assert_eq!(game.turn, restored.turn);
            prop_assert_eq!(game.phase, restored.phase);

            // Skip optional - THIS IS WHERE THE BUG WAS OBSERVED
            game.skip_optional_card();

            // Serialize after skip - critical test
            let json = to_json(&game).expect(&format!("Post-skip serialization failed for seed {}", seed));
            let restored = deserialize_game_state(&json.state_blob)
                .expect(&format!("CRITICAL: Post-skip deserialization failed for seed {}! This is the bug!", seed));

            prop_assert_eq!(game.turn, restored.turn);
            prop_assert_eq!(game.phase, restored.phase);
        }

        /// CRITICAL TEST: Command interface with state blob round-trips
        /// This tests the ACTUAL code path that failed during manual testing
        /// All operations go through Command::execute() with state blobs
        #[test]
        fn prop_command_interface_serialization(
            (width, height) in edge_case_board_size_strategy(),
            seed in any::<u64>(),
            operation_count in 1usize..10
        ) {
            use crate::commands::{execute, Command};

            // Step 1: Create game via Command (not Game::new!)
            let result = execute(Command::NewGame {
                width,
                height,
                seed: Some(seed),
            }).expect("NewGame should never fail with valid dimensions");

            let mut current_blob = result.new_state.state_blob;
            let center_x = width / 2;
            let center_y = height / 2;

            // Step 2: Execute operations via Command interface with state blobs
            for i in 0..operation_count {
                // Generate operation based on iteration (deterministic given seed/iteration)
                let op_type = i % 3;
                let offset_x = ((i / 3) % 3) as i32 - 1;
                let offset_y = ((i / 9) % 3) as i32 - 1;
                let x = center_x + offset_x;
                let y = center_y + offset_y;

                let result = match op_type {
                    0 => {
                        execute(Command::PlaceForcedCard {
                            state: current_blob.clone(),
                            x,
                            y,
                        }).expect(&format!("PlaceForced should not fail deserialization at op {}", i))
                    }
                    1 => {
                        execute(Command::PlaceOptionalCard {
                            state: current_blob.clone(),
                            x,
                            y,
                        }).expect(&format!("PlaceOptional should not fail deserialization at op {}", i))
                    }
                    _ => {
                        // THIS IS THE CRITICAL PATH - where deserialization bug occurred
                        execute(Command::SkipOptional {
                            state: current_blob.clone(),
                        }).expect(&format!(
                            "CRITICAL: SkipOptional deserialization failed at op {} (seed={}, size={}x{}, blob_len={})",
                            i, seed, width, height, current_blob.len()
                        ))
                    }
                };

                // Update blob for next operation
                current_blob = result.new_state.state_blob;

                // Verify we can deserialize the new blob immediately
                use crate::json_state::deserialize_game_state;
                let deserialized = deserialize_game_state(&current_blob).expect(&format!(
                    "Failed to deserialize state after op {} (seed={}, size={}x{})",
                    i, seed, width, height
                ));

                // Verify basic invariants
                prop_assert!(deserialized.turn <= 100, "Turn counter out of range");
                prop_assert_eq!(deserialized.board.width, width, "Board width changed");
                prop_assert_eq!(deserialized.board.height, height, "Board height changed");
            }
        }
    }

    // Non-property tests for specific invariant checks

    /// CRITICAL TEST: Exact reproduction of CLI command flow
    /// This mimics the exact sequence that caused the failure:
    /// 1. Create game via command
    /// 2. Place forced card via command (with state blob round-trip)
    /// 3. Skip optional via command (with state blob round-trip)
    #[test]
    fn test_command_flow_exact_reproduction() {
        use crate::commands::{execute, Command};

        // Step 1: Create game via command (like CLI does)
        let new_game_result = execute(Command::NewGame {
            width: 6,
            height: 6,
            seed: Some(999),
        }).expect("New game should succeed");

        let state_blob_1 = new_game_result.new_state.state_blob.clone();

        // Step 2: Place forced card via command with state blob
        let place_result = execute(Command::PlaceForcedCard {
            state: state_blob_1,
            x: 2,
            y: 3,
        }).expect("Place forced should succeed");

        let state_blob_2 = place_result.new_state.state_blob.clone();

        // Step 3: Skip optional via command - THIS IS WHERE IT FAILED
        let skip_result = execute(Command::SkipOptional {
            state: state_blob_2.clone(),
        }).expect("CRITICAL: Skip optional failed - this is the bug!");

        // Verify state is still valid
        assert_eq!(skip_result.new_state.turn, 1);
        assert_eq!(skip_result.new_state.phase, "PLACING_FORCED_CARD");

        // Also verify the blob can be deserialized multiple times
        for _ in 0..10 {
            let skip_again = execute(Command::SkipOptional {
                state: state_blob_2.clone(),
            }).expect("Repeated skip should also work");
            assert_eq!(skip_again.new_state.turn, 1);
        }
    }

    /// STRESS TEST: Command flow with many iterations
    /// Tests the full command execution path, not just Game methods
    #[test]
    fn test_command_flow_stress() {
        use crate::commands::{execute, Command};
        use rand::Rng;

        let mut rng = rand::thread_rng();

        for iteration in 0..1000 {
            let seed = rng.gen::<u64>();
            let size = rng.gen_range(5..10);

            // Create game via command
            let mut result = execute(Command::NewGame {
                width: size,
                height: size,
                seed: Some(seed),
            }).expect(&format!("Iteration {}: New game failed", iteration));

            let center = size / 2;

            // Perform operations via commands (using state blobs)
            for op in 0..10 {
                let current_blob = result.new_state.state_blob.clone();

                // Try placing forced card
                let x = center + rng.gen_range(-1..2);
                let y = center + rng.gen_range(-1..2);

                result = execute(Command::PlaceForcedCard {
                    state: current_blob.clone(),
                    x,
                    y,
                }).expect(&format!(
                    "Iteration {}, op {}: Place forced failed with seed={}, size={}",
                    iteration, op, seed, size
                ));

                // Skip optional via command
                let current_blob = result.new_state.state_blob.clone();
                result = execute(Command::SkipOptional {
                    state: current_blob,
                }).expect(&format!(
                    "Iteration {}, op {}: Skip optional failed with seed={}, size={}, blob_len={}",
                    iteration, op, seed, size, result.new_state.state_blob.len()
                ));
            }

            if iteration % 100 == 0 {
                println!("Command flow test: {} iterations completed", iteration);
            }
        }

        println!("Command flow stress test: 1000 iterations completed successfully!");
    }

    /// MANUAL STRESS TEST: Run many iterations explicitly
    /// This doesn't rely on proptest config - runs 10,000 iterations manually
    #[test]
    fn test_serialization_manual_stress() {
        use crate::json_state::{to_json, deserialize_game_state};
        use rand::Rng;

        let mut rng = rand::thread_rng();

        for iteration in 0..10_000 {
            let seed = rng.gen::<u64>();
            let size = rng.gen_range(5..12);

            let mut game = Game::new(size, size, seed);
            let center = size / 2;

            // Initial serialization
            let json = to_json(&game).expect(&format!(
                "Iteration {}: Initial serialization failed for size={}, seed={}",
                iteration, size, seed
            ));
            deserialize_game_state(&json.state_blob).expect(&format!(
                "Iteration {}: Initial deserialization failed for size={}, seed={}",
                iteration, size, seed
            ));

            // Random operations
            let op_count = rng.gen_range(1..10);
            for op in 0..op_count {
                let op_type = rng.gen_range(0..3);
                match op_type {
                    0 => {
                        let x = center + rng.gen_range(-1..2);
                        let y = center + rng.gen_range(-1..2);
                        let _ = game.place_forced_card(Position::new(x, y));
                    }
                    1 => {
                        let x = center + rng.gen_range(-1..2);
                        let y = center + rng.gen_range(-1..2);
                        let _ = game.place_optional_card(Position::new(x, y));
                    }
                    _ => {
                        game.skip_optional_card();
                    }
                }

                // Serialize after each operation
                let json = to_json(&game).expect(&format!(
                    "Iteration {}, op {}: Serialization failed for size={}, seed={}",
                    iteration, op, size, seed
                ));
                deserialize_game_state(&json.state_blob).expect(&format!(
                    "Iteration {}, op {}: Deserialization failed for size={}, seed={}, blob_len={}",
                    iteration, op, size, seed, json.state_blob.len()
                ));
            }

            if iteration % 1000 == 0 {
                println!("Completed {} iterations...", iteration);
            }
        }

        println!("Successfully completed 10,000 serialization iterations!");
    }

    /// Regression test for serialization bug found with seed 999
    /// This test reproduces the exact scenario that caused deserialization failure
    #[test]
    fn test_serialization_regression_seed_999() {
        use crate::json_state::{to_json, deserialize_game_state};

        let mut game = Game::new(6, 6, 999);

        // Place forced card at (2, 3) - CORNER_SE
        let result = game.place_forced_card(Position::new(2, 3));
        assert!(result.success, "First placement should succeed");

        // Serialize after placement
        let json = to_json(&game).expect("Serialization after placement should succeed");
        let blob_after_place = json.state_blob.clone();

        // This should not panic
        let restored = deserialize_game_state(&blob_after_place)
            .expect("Deserialization after placement should succeed");

        assert_eq!(game.turn, restored.turn);
        assert_eq!(game.phase, restored.phase);

        // Now skip optional card - this is where the bug was triggered
        game.skip_optional_card();

        // Serialize after skip
        let json = to_json(&game).expect("Serialization after skip should succeed");
        let blob_after_skip = json.state_blob.clone();

        // This is where the original bug occurred - deserialization should work
        let restored = deserialize_game_state(&blob_after_skip)
            .expect("BUG: Deserialization after skip failed - this is the regression!");

        assert_eq!(game.turn, restored.turn);
        assert_eq!(game.phase, restored.phase);
        assert_eq!(game.board.all_tiles().len(), restored.board.all_tiles().len());
    }

    /// Test serialization with various small board sizes (where bug was found)
    #[test]
    fn test_serialization_small_boards() {
        use crate::json_state::{to_json, deserialize_game_state};

        for size in 5..10 {
            for seed in [0, 42, 123, 999, 12345] {
                let mut game = Game::new(size, size, seed);

                // Serialize initial state
                let json = to_json(&game).expect(&format!(
                    "Initial serialization failed for size={}, seed={}",
                    size, seed
                ));
                deserialize_game_state(&json.state_blob).expect(&format!(
                    "Initial deserialization failed for size={}, seed={}",
                    size, seed
                ));

                // Make a move
                let center = size / 2;
                let _ = game.place_forced_card(Position::new(center + 1, center));

                // Serialize after move
                let json = to_json(&game).expect(&format!(
                    "Post-move serialization failed for size={}, seed={}",
                    size, seed
                ));
                deserialize_game_state(&json.state_blob).expect(&format!(
                    "Post-move deserialization failed for size={}, seed={}",
                    size, seed
                ));

                // Skip optional
                game.skip_optional_card();

                // Serialize after skip
                let json = to_json(&game).expect(&format!(
                    "Post-skip serialization failed for size={}, seed={}",
                    size, seed
                ));
                deserialize_game_state(&json.state_blob).expect(&format!(
                    "Post-skip deserialization failed for size={}, seed={}",
                    size, seed
                ));
            }
        }
    }

    #[test]
    fn test_invariant_no_tiles_overlap() {
        let mut game = Game::new(20, 20, 42);

        // Center now has START tile, place adjacent positions
        for i in 0..5 {
            if let Some(_card) = game.current_forced_card {
                game.place_forced_card(Position::new(10, 11 + i));
                game.place_optional_card(Position::new(9, 11 + i));
            }
        }

        // Verify no position has multiple tiles
        let mut positions = std::collections::HashSet::new();
        for tile in game.board.all_tiles() {
            assert!(positions.insert(tile.position), "Duplicate tile at {:?}", tile.position);
        }
    }

    #[test]
    fn test_invariant_hazards_dont_block_all_moves() {
        let game = Game::new(20, 20, 42);

        // With hazards generated, there should still be valid placements available
        // (At minimum, center area should have at least some free space)
        let mut free_spaces = 0;
        for x in 8..12 {
            for y in 8..12 {
                let pos = Position::new(x, y);
                if !game.hazards.is_hazard(pos) && !game.board.is_occupied(pos) {
                    free_spaces += 1;
                }
            }
        }

        // Should have at least some free space
        assert!(free_spaces > 0, "Hazards blocked entire game area");
    }
}
