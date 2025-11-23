/// JSON state serialization for LLM interface
/// REQ-LLM-002: Understand Current Cards
/// REQ-LLM-004: Understand Game Phase
/// REQ-LLM-008: Track Game Progress
/// REQ-LLM-009: Maintain State Continuity
/// REQ-LLM-013: Receive Contextual Summaries
/// REQ-LLM-015: Access Complete State Data

use crate::game::Game;
use crate::renderer::{render_board_simple, tile_to_char};
use crate::types::{Card, Direction, GamePhase, Position, TileType};
use crate::validation::validate_placement;
use serde::{Deserialize, Serialize};

/// Serializable position for JSON
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PositionJson {
    pub x: i32,
    pub y: i32,
}

impl From<Position> for PositionJson {
    fn from(pos: Position) -> Self {
        PositionJson { x: pos.x, y: pos.y }
    }
}

/// Serializable tile data for JSON
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TileJson {
    pub x: i32,
    pub y: i32,
    #[serde(rename = "type")]
    pub tile_type: String,
    pub symbol: char,
    pub turn_placed: u32,
}

/// Serializable card for JSON
/// REQ-LLM-002: Describe cards with type, symbol, description, and connections
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardJson {
    #[serde(rename = "type")]
    pub tile_type: String,
    pub symbol: char,
    pub description: String,
    pub connections: Vec<String>,
}

/// Serializable board data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoardJson {
    pub width: i32,
    pub height: i32,
    pub ascii: String,
    pub tiles: Vec<TileJson>,
    pub hazards: Vec<PositionJson>,
}

/// Valid move with explanation
/// REQ-LLM-003: List valid moves with reasons
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidMove {
    pub x: i32,
    pub y: i32,
    pub reason: String,
    pub connects_to: Vec<PositionJson>,
}

/// Complete game state for JSON output
/// REQ-LLM-015: Complete state data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameStateJson {
    pub turn: u32,
    pub phase: String,
    pub board: BoardJson,
    pub forced_card: Option<CardJson>,
    pub optional_card: Option<CardJson>,
    pub valid_moves: Vec<ValidMove>,
    pub context: String,
    pub state_blob: String,
}

/// Convert TileType to string representation
fn tile_type_to_string(tt: TileType) -> String {
    match tt {
        TileType::StraightNS => "STRAIGHT_NS".to_string(),
        TileType::StraightEW => "STRAIGHT_EW".to_string(),
        TileType::CornerNE => "CORNER_NE".to_string(),
        TileType::CornerNW => "CORNER_NW".to_string(),
        TileType::CornerSE => "CORNER_SE".to_string(),
        TileType::CornerSW => "CORNER_SW".to_string(),
        TileType::TN => "T_N".to_string(),
        TileType::TE => "T_E".to_string(),
        TileType::TS => "T_S".to_string(),
        TileType::TW => "T_W".to_string(),
        TileType::Cross => "CROSS".to_string(),
        TileType::START => "START".to_string(),
        TileType::END => "END".to_string(),
    }
}

/// Convert Direction to string
fn direction_to_string(dir: Direction) -> String {
    match dir {
        Direction::North => "North".to_string(),
        Direction::South => "South".to_string(),
        Direction::East => "East".to_string(),
        Direction::West => "West".to_string(),
    }
}

/// Describe a card in natural language
/// REQ-LLM-002: Human-readable card descriptions
pub fn describe_card(card: Card) -> CardJson {
    let tile_type = card.tile_type;
    let connections: Vec<String> = tile_type
        .connections()
        .iter()
        .map(|d| direction_to_string(*d))
        .collect();

    let description = match tile_type {
        TileType::StraightNS => "Straight path running North-South (vertical)".to_string(),
        TileType::StraightEW => "Straight path running East-West (horizontal)".to_string(),
        TileType::CornerNE => "Corner connecting North and East".to_string(),
        TileType::CornerNW => "Corner connecting North and West".to_string(),
        TileType::CornerSE => "Corner connecting South and East".to_string(),
        TileType::CornerSW => "Corner connecting South and West".to_string(),
        TileType::TN => "T-junction with paths to North, East, and West".to_string(),
        TileType::TE => "T-junction with paths to East, North, and South".to_string(),
        TileType::TS => "T-junction with paths to South, East, and West".to_string(),
        TileType::TW => "T-junction with paths to West, North, and South".to_string(),
        TileType::Cross => "Cross junction with paths in all four directions".to_string(),
        TileType::START => "Starting tile".to_string(),
        TileType::END => "Ending tile".to_string(),
    };

    CardJson {
        tile_type: tile_type_to_string(tile_type),
        symbol: tile_to_char(tile_type),
        description,
        connections,
    }
}

/// Compute all valid moves for the current card
/// REQ-LLM-003: Discover valid moves with explanations
pub fn compute_valid_moves(game: &Game) -> Vec<ValidMove> {
    let mut valid_moves = Vec::new();

    // Determine which card we're placing based on phase
    let card = match game.phase {
        GamePhase::PlacingForcedCard => game.current_forced_card,
        GamePhase::PlacingOptionalCard => game.current_optional_card,
        GamePhase::SessionEnded => None,
    };

    let Some(card) = card else {
        return valid_moves;
    };

    // Check all positions on the board
    for y in 0..game.board.height {
        for x in 0..game.board.width {
            let pos = Position::new(x, y);

            // Validate this position
            if validate_placement(&game.board, &game.hazards, pos, card.tile_type).is_ok() {
                // Find which tiles this position connects to
                let mut connects_to: Vec<PositionJson> = Vec::new();
                for dir in Direction::all() {
                    let adjacent_pos = pos.moved(dir);
                    if game.board.is_occupied(adjacent_pos) {
                        connects_to.push(adjacent_pos.into());
                    }
                }

                // Generate reason text
                let reason = if connects_to.is_empty() {
                    "Starting position (no tiles on board yet)".to_string()
                } else if connects_to.len() == 1 {
                    let adj = connects_to[0].clone();
                    format!("Adjacent to tile at ({},{})", adj.x, adj.y)
                } else {
                    format!("Adjacent to {} tiles", connects_to.len())
                };

                valid_moves.push(ValidMove {
                    x: pos.x,
                    y: pos.y,
                    reason,
                    connects_to,
                });
            }
        }
    }

    valid_moves
}

/// Generate natural language context summary
/// REQ-LLM-013: Contextual summaries
fn generate_context(game: &Game, valid_moves: &[ValidMove]) -> String {
    match game.phase {
        GamePhase::PlacingForcedCard => {
            if let Some(card) = game.current_forced_card {
                let card_name = tile_type_to_string(card.tile_type);
                let symbol = tile_to_char(card.tile_type);
                let count = valid_moves.len();
                if count == 0 {
                    format!(
                        "Turn {}: Place forced card ({} {}). WARNING: No valid moves - erosion will occur!",
                        game.turn, card_name, symbol
                    )
                } else if count == 1 {
                    format!(
                        "Turn {}: Place forced card ({} {}). You have 1 valid placement option.",
                        game.turn, card_name, symbol
                    )
                } else {
                    format!(
                        "Turn {}: Place forced card ({} {}). You have {} valid placement options.",
                        game.turn, card_name, symbol, count
                    )
                }
            } else {
                "Waiting for forced card draw...".to_string()
            }
        }
        GamePhase::PlacingOptionalCard => {
            if let Some(card) = game.current_optional_card {
                let card_name = tile_type_to_string(card.tile_type);
                let symbol = tile_to_char(card.tile_type);
                let count = valid_moves.len();
                if count == 0 {
                    format!(
                        "Turn {}: Optional card ({} {}) available. No valid moves - must skip.",
                        game.turn, card_name, symbol
                    )
                } else {
                    format!(
                        "Turn {}: Optional card ({} {}) available. You can place it or skip to next turn.",
                        game.turn, card_name, symbol
                    )
                }
            } else {
                "Optional card phase (no card available)".to_string()
            }
        }
        GamePhase::SessionEnded => {
            format!(
                "Game ended. Final turn: {}. Total tiles placed: {}",
                game.turn,
                game.board.all_tiles().len()
            )
        }
    }
}

/// Convert game state to JSON representation
/// REQ-LLM-009: State serialization for continuity
pub fn to_json(game: &Game) -> Result<GameStateJson, String> {
    // Render ASCII board
    let ascii = render_board_simple(&game.board, &game.hazards);

    // Convert tiles to JSON
    let tiles: Vec<TileJson> = game
        .get_tiles()
        .into_iter()
        .map(|(pos, tt, turn)| TileJson {
            x: pos.x,
            y: pos.y,
            tile_type: tile_type_to_string(tt),
            symbol: tile_to_char(tt),
            turn_placed: turn,
        })
        .collect();

    // Convert hazards to JSON
    let hazards: Vec<PositionJson> = game.get_hazards().into_iter().map(|p| p.into()).collect();

    // Compute valid moves
    let valid_moves = compute_valid_moves(game);

    // Generate context
    let context = generate_context(game, &valid_moves);

    // Serialize game state as blob
    let state_blob = serialize_game_state(game)?;

    // Convert phase to string
    let phase = match game.phase {
        GamePhase::PlacingForcedCard => "PLACING_FORCED_CARD".to_string(),
        GamePhase::PlacingOptionalCard => "PLACING_OPTIONAL_CARD".to_string(),
        GamePhase::SessionEnded => "SESSION_ENDED".to_string(),
    };

    Ok(GameStateJson {
        turn: game.turn,
        phase,
        board: BoardJson {
            width: game.board.width,
            height: game.board.height,
            ascii,
            tiles,
            hazards,
        },
        forced_card: game.current_forced_card.map(describe_card),
        optional_card: game.current_optional_card.map(describe_card),
        valid_moves,
        context,
        state_blob,
    })
}

/// Serialize game state to base64-encoded string
fn serialize_game_state(game: &Game) -> Result<String, String> {
    use base64::{engine::general_purpose, Engine as _};
    // Use bincode for compact binary serialization
    let bytes = bincode::serialize(game).map_err(|e| format!("Serialization error: {}", e))?;
    Ok(general_purpose::STANDARD.encode(&bytes))
}

/// Deserialize game state from base64-encoded string
pub fn deserialize_game_state(blob: &str) -> Result<Game, String> {
    use base64::{engine::general_purpose, Engine as _};
    let bytes = general_purpose::STANDARD
        .decode(blob)
        .map_err(|e| format!("Base64 decode error: {}", e))?;
    let game: Game =
        bincode::deserialize(&bytes).map_err(|e| format!("Deserialization error: {}", e))?;
    Ok(game)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::TileType;

    #[test]
    fn test_describe_card() {
        let card = Card {
            tile_type: TileType::CornerNE,
        };
        let card_json = describe_card(card);

        assert_eq!(card_json.tile_type, "CORNER_NE");
        assert_eq!(card_json.symbol, '└');
        assert!(card_json.description.contains("North"));
        assert!(card_json.description.contains("East"));
        assert_eq!(card_json.connections.len(), 2);
    }

    #[test]
    fn test_state_serialization_roundtrip() {
        let game = Game::new(10, 10, 42);
        let blob = serialize_game_state(&game).expect("Serialization should succeed");
        let restored = deserialize_game_state(&blob).expect("Deserialization should succeed");

        assert_eq!(game.turn, restored.turn);
        assert_eq!(game.board.width, restored.board.width);
        assert_eq!(game.board.height, restored.board.height);
    }

    #[test]
    fn test_to_json() {
        let game = Game::new(10, 10, 42);
        let state_json = to_json(&game).expect("JSON conversion should succeed");

        assert_eq!(state_json.turn, 0);
        assert_eq!(state_json.phase, "PLACING_FORCED_CARD");
        assert!(state_json.forced_card.is_some());
        assert!(state_json.context.contains("Turn"));
        assert!(!state_json.state_blob.is_empty());
    }

    #[test]
    fn test_compute_valid_moves_initial() {
        let game = Game::new(10, 10, 42);
        let valid_moves = compute_valid_moves(&game);

        // Initial game should have valid moves at center
        assert!(!valid_moves.is_empty());
    }
}
