use crate::types::Position;
use rand::prelude::*;
use rand_chacha::ChaCha8Rng;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Represents the hazard system with static obstacles
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Hazards {
    pub positions: HashSet<Position>,
    pub seed: u64,
}

impl Hazards {
    /// Generate hazards for a board
    /// - seed: RNG seed for deterministic placement
    /// - start_pos: Position of START tile (to avoid)
    /// - end_pos: Optional position of END tile (to avoid)
    /// - board_width/height: Board dimensions
    /// - count: Number of hazards to generate
    pub fn generate(
        seed: u64,
        start_pos: Position,
        end_pos: Option<Position>,
        board_width: i32,
        board_height: i32,
        count: usize,
    ) -> Self {
        let mut rng = ChaCha8Rng::seed_from_u64(seed);
        let mut positions = HashSet::new();

        // Positions to avoid
        let mut forbidden = HashSet::new();
        forbidden.insert(start_pos);
        if let Some(end) = end_pos {
            forbidden.insert(end);
        }

        // Also forbid positions adjacent to START
        for dir in crate::types::Direction::all() {
            forbidden.insert(start_pos.moved(dir));
        }

        // Generate hazards
        while positions.len() < count {
            let x = rng.gen_range(0..board_width);
            let y = rng.gen_range(0..board_height);
            let pos = Position::new(x, y);

            if !forbidden.contains(&pos) && !positions.contains(&pos) {
                positions.insert(pos);
            }
        }

        Hazards { positions, seed }
    }

    /// Check if a position is a hazard
    pub fn is_hazard(&self, position: Position) -> bool {
        self.positions.contains(&position)
    }

    /// Get all hazard positions
    pub fn all(&self) -> Vec<Position> {
        self.positions.iter().copied().collect()
    }

    /// Get the count of hazards
    pub fn count(&self) -> usize {
        self.positions.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hazard_generation() {
        let start = Position::new(5, 5);
        let hazards = Hazards::generate(12345, start, None, 20, 20, 10);

        assert_eq!(hazards.count(), 10);
        assert!(!hazards.is_hazard(start));

        // Check no hazards adjacent to start
        for dir in crate::types::Direction::all() {
            assert!(!hazards.is_hazard(start.moved(dir)));
        }
    }

    #[test]
    fn test_hazard_generation_reproducibility() {
        let start = Position::new(5, 5);
        let hazards1 = Hazards::generate(42, start, None, 20, 20, 10);
        let hazards2 = Hazards::generate(42, start, None, 20, 20, 10);

        assert_eq!(hazards1.positions, hazards2.positions);
    }

    #[test]
    fn test_hazard_avoids_end() {
        let start = Position::new(5, 5);
        let end = Position::new(15, 15);
        let hazards = Hazards::generate(12345, start, Some(end), 20, 20, 10);

        assert!(!hazards.is_hazard(end));
    }
}
