/// ASCII board rendering for LLM visualization
/// REQ-LLM-001: Visualize Game Board
/// REQ-LLM-011: Understand Tile Symbols
/// REQ-LLM-012: Identify Hazards

use crate::board::Board;
use crate::hazards::Hazards;
use crate::types::{Position, TileType};
use std::collections::HashSet;

/// Convert a TileType to its Unicode box-drawing character representation
/// REQ-LLM-011: Consistent Unicode symbols for each tile type
pub fn tile_to_char(tile_type: TileType) -> char {
    match tile_type {
        TileType::StraightNS => '│',      // Vertical
        TileType::StraightEW => '─',      // Horizontal
        TileType::CornerNE => '└',        // Bottom-left corner (connects North-East)
        TileType::CornerNW => '┘',        // Bottom-right corner (connects North-West)
        TileType::CornerSE => '┌',        // Top-left corner (connects South-East)
        TileType::CornerSW => '┐',        // Top-right corner (connects South-West)
        TileType::TN => '├',              // T-junction pointing north (left side)
        TileType::TE => '┴',              // T-junction pointing east (bottom)
        TileType::TS => '┤',              // T-junction pointing south (right side)
        TileType::TW => '┬',              // T-junction pointing west (top)
        TileType::Cross => '┼',           // Cross (all directions)
        TileType::START => 'S',           // Start marker
        TileType::END => 'E',             // End marker
    }
}

/// Render the game board as ASCII art with coordinate labels
/// REQ-LLM-001: ASCII representation of board
pub fn render_board(
    board: &Board,
    hazards: &Hazards,
    valid_positions: Option<&[Position]>,
) -> String {
    let width = board.width;
    let height = board.height;

    let valid_set: HashSet<Position> = valid_positions
        .map(|positions| positions.iter().copied().collect())
        .unwrap_or_default();

    let mut output = String::new();

    // Header with column numbers
    output.push_str("    ");
    for x in 0..width {
        if x < 10 {
            output.push_str(&format!("{} ", x));
        } else if x < 36 {
            // Use A-Z for columns 10-35
            output.push((b'A' + (x - 10) as u8) as char);
            output.push(' ');
        } else {
            output.push_str("? ");
        }
    }
    output.push('\n');

    // Top border
    output.push_str("  ┌");
    for _ in 0..width {
        output.push('─');
        output.push('─');
    }
    output.push_str("┐\n");

    // Board rows
    for y in 0..height {
        // Row label
        if y < 10 {
            output.push_str(&format!("{} │", y));
        } else if y < 36 {
            output.push((b'A' + (y - 10) as u8) as char);
            output.push_str(" │");
        } else {
            output.push_str("? │");
        }

        // Row contents
        for x in 0..width {
            let pos = Position::new(x, y);

            // Check what's at this position
            if let Some(tile) = board.get_tile(pos) {
                // Tile exists
                output.push(' ');
                output.push(tile_to_char(tile.tile_type));
            } else if hazards.is_hazard(pos) {
                // REQ-LLM-012: Mark hazards with X
                output.push(' ');
                output.push('X');
            } else if valid_set.contains(&pos) {
                // Valid placement position (if provided)
                output.push(' ');
                output.push('*');
            } else {
                // Empty space
                output.push(' ');
                output.push('.');
            }
        }

        output.push_str(" │\n");
    }

    // Bottom border
    output.push_str("  └");
    for _ in 0..width {
        output.push('─');
        output.push('─');
    }
    output.push_str("┘\n");

    // Legend
    output.push_str("\nLegend: S=START, E=END, X=Hazard, *=Valid Move, .=Empty\n");
    output.push_str("Tiles: │─ (straight), └┘┌┐ (corners), ├┴┤┬ (T-junctions), ┼ (cross)\n");

    output
}

/// Render a compact board without highlighting (for display in JSON)
pub fn render_board_simple(board: &Board, hazards: &Hazards) -> String {
    render_board(board, hazards, None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::board::Board;
    use crate::hazards::Hazards;

    #[test]
    fn test_tile_to_char() {
        assert_eq!(tile_to_char(TileType::StraightNS), '│');
        assert_eq!(tile_to_char(TileType::StraightEW), '─');
        assert_eq!(tile_to_char(TileType::CornerNE), '└');
        assert_eq!(tile_to_char(TileType::START), 'S');
        assert_eq!(tile_to_char(TileType::END), 'E');
        assert_eq!(tile_to_char(TileType::Cross), '┼');
    }

    #[test]
    fn test_render_empty_board() {
        let board = Board::new(5, 5);
        let start = Position::new(2, 2);
        let hazards = Hazards::generate(42, start, None, 5, 5, 0);
        let rendered = render_board_simple(&board, &hazards);

        // Should contain border and empty spaces
        assert!(rendered.contains("┌"));
        assert!(rendered.contains("└"));
        assert!(rendered.contains("."));
    }

    #[test]
    fn test_render_with_tiles() {
        let mut board = Board::new(5, 5);
        board.place_tile(Position::new(2, 2), TileType::START, 0);
        board.place_tile(Position::new(2, 3), TileType::StraightNS, 1);

        let start = Position::new(2, 2);
        let hazards = Hazards::generate(42, start, None, 5, 5, 0);
        let rendered = render_board_simple(&board, &hazards);

        // Should contain START marker and vertical line
        assert!(rendered.contains('S'));
        assert!(rendered.contains('│'));
    }

    #[test]
    fn test_render_with_hazards() {
        let board = Board::new(5, 5);
        let start = Position::new(2, 2);
        // Generate some hazards
        let hazards = Hazards::generate(123, start, None, 5, 5, 3);

        let rendered = render_board_simple(&board, &hazards);

        // Should contain hazard markers
        assert!(rendered.contains('X'));
    }

    #[test]
    fn test_render_with_valid_positions() {
        let mut board = Board::new(5, 5);
        board.place_tile(Position::new(2, 2), TileType::START, 0);

        let start = Position::new(2, 2);
        let hazards = Hazards::generate(42, start, None, 5, 5, 0);
        let valid = vec![
            Position::new(2, 1),
            Position::new(2, 3),
            Position::new(1, 2),
            Position::new(3, 2),
        ];

        let rendered = render_board(&board, &hazards, Some(&valid));

        // Should contain valid move markers
        assert!(rendered.contains('*'));
    }
}
