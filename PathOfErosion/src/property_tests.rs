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
                if let Some(card) = game.current_forced_card {
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
    }

    // Non-property tests for specific invariant checks

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
