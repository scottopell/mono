use crate::board::Board;
use crate::deck::Deck;
use crate::hazards::Hazards;
use crate::types::{Card, GamePhase, Position, TileType};
use crate::validation::{validate_placement, PlacementError};
use serde::{Deserialize, Serialize};

/// The main game state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Game {
    pub board: Board,
    pub deck: Deck,
    pub hazards: Hazards,
    pub current_forced_card: Option<Card>,
    pub current_optional_card: Option<Card>,
    pub phase: GamePhase,
    pub turn: u32,
    pub seed: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlacementResult {
    pub success: bool,
    pub message: String,
    pub erosion_occurred: bool,
    pub tiles_eroded: usize,
}

impl Game {
    /// Create a new game
    pub fn new(width: i32, height: i32, seed: u64) -> Self {
        let board = Board::new(width, height);
        let mut deck = Deck::new(seed);
        let hazards = Hazards::generate(seed, Position::new(width / 2, height / 2), None, width, height, 12);

        let forced_card = deck.draw_card();
        let optional_card = deck.draw_card();

        Game {
            board,
            deck,
            hazards,
            current_forced_card: forced_card,
            current_optional_card: optional_card,
            phase: GamePhase::PlacingForcedCard,
            turn: 0,
            seed,
        }
    }

    /// Get START position (center of board, or create if not exists)
    #[allow(dead_code)]
    fn get_start_position(&self) -> Position {
        self.board
            .find_start()
            .unwrap_or_else(|| Position::new(self.board.width / 2, self.board.height / 2))
    }

    /// Place a tile on the board
    pub fn place_tile(&mut self, position: Position, card: Card) -> PlacementResult {
        // Validate placement
        match validate_placement(&self.board, &self.hazards, position, card.tile_type) {
            Ok(()) => {
                // Place the tile
                self.board.place_tile(position, card.tile_type, self.turn);

                // Discard the card
                self.deck.discard_card(card);

                PlacementResult {
                    success: true,
                    message: "Tile placed successfully".to_string(),
                    erosion_occurred: false,
                    tiles_eroded: 0,
                }
            }
            Err(err) => {
                // If we're placing a forced card and it fails, trigger erosion
                let (erosion_occurred, tiles_eroded) = if self.phase == GamePhase::PlacingForcedCard {
                    let (occurred, count) = self.erode();
                    (occurred, count)
                } else {
                    (false, 0)
                };

                // Discard the card either way
                self.deck.discard_card(card);

                let message = match err {
                    PlacementError::Occupied => "Position already occupied".to_string(),
                    PlacementError::NoAdjacentTile => "Not adjacent to path".to_string(),
                    PlacementError::BlockedByHazard => "Blocked by hazard".to_string(),
                    PlacementError::OutOfBounds => "Out of bounds".to_string(),
                    PlacementError::InvalidConnection => "Invalid connection".to_string(),
                };

                PlacementResult {
                    success: false,
                    message,
                    erosion_occurred,
                    tiles_eroded,
                }
            }
        }
    }

    /// Try to place forced card at a position
    pub fn place_forced_card(&mut self, position: Position) -> PlacementResult {
        if let Some(card) = self.current_forced_card {
            let result = self.place_tile(position, card);

            if result.success {
                // Move to optional card phase
                self.phase = GamePhase::PlacingOptionalCard;
            }

            result
        } else {
            PlacementResult {
                success: false,
                message: "No forced card available".to_string(),
                erosion_occurred: false,
                tiles_eroded: 0,
            }
        }
    }

    /// Try to place optional card at a position
    pub fn place_optional_card(&mut self, position: Position) -> PlacementResult {
        if let Some(card) = self.current_optional_card {
            let result = self.place_tile(position, card);

            if result.success {
                self.start_new_turn();
            }

            result
        } else {
            PlacementResult {
                success: false,
                message: "No optional card available".to_string(),
                erosion_occurred: false,
                tiles_eroded: 0,
            }
        }
    }

    /// Skip the optional card
    pub fn skip_optional_card(&mut self) {
        if let Some(card) = self.current_optional_card {
            self.deck.discard_card(card);
        }

        self.start_new_turn();
    }

    /// Start a new turn (draw new cards)
    fn start_new_turn(&mut self) {
        self.turn += 1;
        self.current_forced_card = self.deck.draw_card();
        self.current_optional_card = self.deck.draw_card();

        self.phase = GamePhase::PlacingForcedCard;

        // Check if game is over (no more cards)
        if self.current_forced_card.is_none() && self.current_optional_card.is_none() {
            self.phase = GamePhase::SessionEnded;
        }
    }

    /// Erode the path (remove most recently placed tile)
    /// Returns (erosion_occurred, tiles_removed_count)
    fn erode(&mut self) -> (bool, usize) {
        // Find and remove the most recent tile
        if let Some((pos, _)) = self.board.most_recent_tile() {
            self.board.remove_tile(pos);
            let mut eroded_count = 1;

            // Check if we need to continue eroding to maintain connectivity
            // Keep removing tiles until the path is connected again
            loop {
                let connected = self.board.find_connected_to_start();

                // Find any tiles that are now disconnected
                let disconnected: Vec<Position> = self
                    .board
                    .all_tiles()
                    .iter()
                    .filter(|tile| !connected.contains_key(&tile.position))
                    .map(|tile| tile.position)
                    .collect();

                if disconnected.is_empty() {
                    break; // Path is now connected
                }

                // Remove a disconnected tile (prefer endpoint tiles)
                if let Some(pos) = disconnected.iter().next() {
                    self.board.remove_tile(*pos);
                    eroded_count += 1;
                } else {
                    break;
                }
            }

            (true, eroded_count)
        } else {
            (false, 0)
        }
    }

    /// Check if START is connected to END
    pub fn is_won(&self) -> bool {
        self.board.is_start_connected_to_end()
    }

    /// Get all tiles currently on board
    pub fn get_tiles(&self) -> Vec<(Position, TileType, u32)> {
        self.board
            .all_tiles()
            .iter()
            .map(|tile| (tile.position, tile.tile_type, tile.turn_placed))
            .collect()
    }

    /// Get all hazard positions
    pub fn get_hazards(&self) -> Vec<Position> {
        self.hazards.all()
    }

    /// Get current game state as a string (for debugging)
    pub fn state_string(&self) -> String {
        format!(
            "Turn: {}, Phase: {:?}, Tiles: {}, Hazards: {}",
            self.turn,
            self.phase,
            self.board.all_tiles().len(),
            self.hazards.count()
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_game_creation() {
        let game = Game::new(20, 20, 42);
        assert_eq!(game.turn, 0);
        assert_eq!(game.board.width, 20);
        assert_eq!(game.board.height, 20);
        assert!(game.current_forced_card.is_some());
        assert!(game.current_optional_card.is_some());
    }

    #[test]
    fn test_place_forced_card() {
        let mut game = Game::new(20, 20, 42);
        let center = Position::new(10, 10);

        let result = game.place_forced_card(center);
        assert!(result.success);
        assert!(game.board.is_occupied(center));
        assert_eq!(game.phase, GamePhase::PlacingOptionalCard);
    }

    #[test]
    fn test_skip_optional_card() {
        let mut game = Game::new(20, 20, 42);
        let center = Position::new(10, 10);

        game.place_forced_card(center);
        game.skip_optional_card();

        assert_eq!(game.turn, 1);
        assert_eq!(game.phase, GamePhase::PlacingForcedCard);
    }
}
