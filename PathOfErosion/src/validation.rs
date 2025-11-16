use crate::board::Board;
use crate::hazards::Hazards;
use crate::types::{Position, TileType};

/// Error types for game operations
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PlacementError {
    /// Position already occupied
    Occupied,
    /// No adjacent tiles to connect to
    NoAdjacentTile,
    /// Hazard blocks this position
    BlockedByHazard,
    /// Out of board bounds
    OutOfBounds,
    /// Connections don't match adjacent tiles
    InvalidConnection,
}

/// Validate tile placement
pub fn validate_placement(
    board: &Board,
    hazards: &Hazards,
    position: Position,
    tile_type: TileType,
) -> Result<(), PlacementError> {
    // Check bounds
    if !board.in_bounds(position) {
        return Err(PlacementError::OutOfBounds);
    }

    // Check occupied
    if board.is_occupied(position) {
        return Err(PlacementError::Occupied);
    }

    // Check hazard
    if hazards.is_hazard(position) {
        return Err(PlacementError::BlockedByHazard);
    }

    // For the very first tile, it doesn't need adjacent tiles
    let adjacent_occupied = board.adjacent_occupied(position);

    // If there are no tiles on the board yet, allow placement
    if board.all_tiles().is_empty() {
        return Ok(());
    }

    // Otherwise, must have at least one adjacent tile
    if adjacent_occupied.is_empty() {
        return Err(PlacementError::NoAdjacentTile);
    }

    // Check connections with adjacent tiles
    let connections_ok = adjacent_occupied.iter().all(|&adj_pos| {
        if let (Some(direction), Some(adjacent_tile)) = (position.direction_to(adj_pos), board.get_tile(adj_pos)) {
            // Our tile must connect outward
            let we_connect = tile_type.has_connection(direction);
            // Adjacent tile must connect back
            let they_connect = adjacent_tile.tile_type.has_connection(direction.opposite());

            we_connect && they_connect
        } else {
            false
        }
    });

    if !connections_ok {
        return Err(PlacementError::InvalidConnection);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validation_first_tile() {
        let board = Board::new(10, 10);
        let hazards = Hazards::generate(0, Position::new(5, 5), None, 10, 10, 0);
        let pos = Position::new(5, 5);

        // First tile should be valid even without adjacency
        let result = validate_placement(&board, &hazards, pos, TileType::START);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validation_occupied() {
        let mut board = Board::new(10, 10);
        let hazards = Hazards::generate(0, Position::new(5, 5), None, 10, 10, 0);

        let pos = Position::new(5, 5);
        board.place_tile(pos, TileType::START, 0);

        // Try to place at same position
        let result = validate_placement(&board, &hazards, pos, TileType::StraightNS);
        assert_eq!(result, Err(PlacementError::Occupied));
    }

    #[test]
    fn test_validation_hazard() {
        let board = Board::new(10, 10);
        let hazards = Hazards::generate(42, Position::new(5, 5), None, 10, 10, 5);

        // Try to place on a hazard
        if let Some(&hazard_pos) = hazards.positions.iter().next() {
            let result = validate_placement(&board, &hazards, hazard_pos, TileType::StraightNS);
            assert_eq!(result, Err(PlacementError::BlockedByHazard));
        }
    }

    #[test]
    fn test_validation_out_of_bounds() {
        let board = Board::new(10, 10);
        let hazards = Hazards::generate(0, Position::new(5, 5), None, 10, 10, 0);

        let pos = Position::new(15, 15); // Out of bounds
        let result = validate_placement(&board, &hazards, pos, TileType::StraightNS);
        assert_eq!(result, Err(PlacementError::OutOfBounds));
    }

    #[test]
    fn test_validation_no_adjacent() {
        let mut board = Board::new(10, 10);
        let hazards = Hazards::generate(0, Position::new(5, 5), None, 10, 10, 0);

        // Place first tile
        board.place_tile(Position::new(5, 5), TileType::START, 0);

        // Try to place far away from it
        let pos = Position::new(9, 9);
        let result = validate_placement(&board, &hazards, pos, TileType::StraightNS);
        assert_eq!(result, Err(PlacementError::NoAdjacentTile));
    }
}
