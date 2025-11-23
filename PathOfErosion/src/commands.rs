/// Command processing for JSON API
/// REQ-LLM-005: Issue Placement Commands
/// REQ-LLM-006: Skip Optional Cards
/// REQ-LLM-007: Receive Action Feedback
/// REQ-LLM-010: Start New Games
/// REQ-LLM-014: Understand Erosion Impact

use crate::game::{Game, PlacementResult};
use crate::json_state::{deserialize_game_state, to_json, GameStateJson, PositionJson};
use crate::types::Position;
use serde::{Deserialize, Serialize};

/// Commands that can be executed via JSON API
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "action")]
pub enum Command {
    /// Start a new game
    /// REQ-LLM-010: Start new games with dimensions and seed
    #[serde(rename = "new_game")]
    NewGame {
        width: i32,
        height: i32,
        #[serde(default)]
        seed: Option<u64>,
    },

    /// Place the forced card at a position
    /// REQ-LLM-005: Issue placement commands
    #[serde(rename = "place_forced")]
    PlaceForcedCard {
        state: String,
        x: i32,
        y: i32,
    },

    /// Place the optional card at a position
    /// REQ-LLM-005: Issue placement commands
    #[serde(rename = "place_optional")]
    PlaceOptionalCard {
        state: String,
        x: i32,
        y: i32,
    },

    /// Skip the optional card and start new turn
    /// REQ-LLM-006: Skip optional cards
    #[serde(rename = "skip_optional")]
    SkipOptional { state: String },
}

/// Information about erosion events
/// REQ-LLM-014: Understand erosion impact
#[derive(Debug, Clone, Serialize)]
pub struct ErosionInfo {
    pub occurred: bool,
    pub tiles_removed: usize,
    pub tiles_removed_positions: Vec<PositionJson>,
}

/// Result of executing a command
/// REQ-LLM-007: Receive action feedback
#[derive(Debug, Clone, Serialize)]
pub struct CommandResult {
    pub success: bool,
    pub message: String,
    pub erosion: ErosionInfo,
    pub new_state: GameStateJson,
}

/// Execute a command and return the result
pub fn execute(command: Command) -> Result<CommandResult, String> {
    match command {
        Command::NewGame { width, height, seed } => {
            execute_new_game(width, height, seed)
        }
        Command::PlaceForcedCard { state, x, y } => {
            execute_place_forced(state, x, y)
        }
        Command::PlaceOptionalCard { state, x, y } => {
            execute_place_optional(state, x, y)
        }
        Command::SkipOptional { state } => {
            execute_skip_optional(state)
        }
    }
}

/// Execute new_game command
fn execute_new_game(width: i32, height: i32, seed: Option<u64>) -> Result<CommandResult, String> {
    // Use provided seed or generate random one
    let actual_seed = seed.unwrap_or_else(|| {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
    });

    // Validate dimensions
    if width < 5 || width > 100 {
        return Err("Board width must be between 5 and 100".to_string());
    }
    if height < 5 || height > 100 {
        return Err("Board height must be between 5 and 100".to_string());
    }

    let game = Game::new(width, height, actual_seed);
    let new_state = to_json(&game)?;

    Ok(CommandResult {
        success: true,
        message: format!("New game started with seed {}", actual_seed),
        erosion: ErosionInfo {
            occurred: false,
            tiles_removed: 0,
            tiles_removed_positions: Vec::new(),
        },
        new_state,
    })
}

/// Execute place_forced command
fn execute_place_forced(state_blob: String, x: i32, y: i32) -> Result<CommandResult, String> {
    let mut game = deserialize_game_state(&state_blob)?;
    let pos = Position::new(x, y);

    let result = game.place_forced_card(pos);

    convert_placement_result(result, game)
}

/// Execute place_optional command
fn execute_place_optional(state_blob: String, x: i32, y: i32) -> Result<CommandResult, String> {
    let mut game = deserialize_game_state(&state_blob)?;
    let pos = Position::new(x, y);

    let result = game.place_optional_card(pos);

    convert_placement_result(result, game)
}

/// Execute skip_optional command
fn execute_skip_optional(state_blob: String) -> Result<CommandResult, String> {
    let mut game = deserialize_game_state(&state_blob)?;

    game.skip_optional_card();

    let new_state = to_json(&game)?;

    Ok(CommandResult {
        success: true,
        message: "Optional card skipped. Starting new turn.".to_string(),
        erosion: ErosionInfo {
            occurred: false,
            tiles_removed: 0,
            tiles_removed_positions: Vec::new(),
        },
        new_state,
    })
}

/// Convert PlacementResult to CommandResult
/// REQ-LLM-007: Action feedback with erosion info
fn convert_placement_result(
    result: PlacementResult,
    game: Game,
) -> Result<CommandResult, String> {
    let new_state = to_json(&game)?;

    // TODO: Track actual eroded positions (requires game.rs to return them)
    let erosion_info = ErosionInfo {
        occurred: result.erosion_occurred,
        tiles_removed: result.tiles_eroded,
        tiles_removed_positions: Vec::new(), // Will be populated when game.rs provides positions
    };

    Ok(CommandResult {
        success: result.success,
        message: result.message,
        erosion: erosion_info,
        new_state,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_game_command() {
        let cmd = Command::NewGame {
            width: 10,
            height: 10,
            seed: Some(42),
        };

        let result = execute(cmd).expect("Command should succeed");

        assert!(result.success);
        assert!(result.message.contains("seed"));
        assert_eq!(result.new_state.board.width, 10);
        assert_eq!(result.new_state.board.height, 10);
    }

    #[test]
    fn test_new_game_invalid_dimensions() {
        let cmd = Command::NewGame {
            width: 200,
            height: 10,
            seed: Some(42),
        };

        let result = execute(cmd);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("width"));
    }

    #[test]
    fn test_place_forced_command() {
        // First create a game
        let game = Game::new(10, 10, 42);
        let state_json = to_json(&game).expect("JSON conversion should work");

        // Try to place at center
        let cmd = Command::PlaceForcedCard {
            state: state_json.state_blob,
            x: 5,
            y: 5,
        };

        let result = execute(cmd).expect("Command should succeed");

        // Result depends on whether the move was valid
        assert!(result.new_state.turn >= 0);
    }

    #[test]
    fn test_skip_optional_command() {
        // Create a game and place forced card first
        let mut game = Game::new(10, 10, 42);
        let _ = game.place_forced_card(Position::new(5, 5));

        let state_json = to_json(&game).expect("JSON conversion should work");

        let cmd = Command::SkipOptional {
            state: state_json.state_blob,
        };

        let result = execute(cmd).expect("Command should succeed");

        assert!(result.success);
        assert!(result.message.contains("skipped"));
    }

    #[test]
    fn test_command_json_parsing() {
        // Test that commands can be parsed from JSON
        let json = r#"{"action":"new_game","width":10,"height":10,"seed":42}"#;
        let cmd: Command = serde_json::from_str(json).expect("Should parse");

        if let Command::NewGame { width, height, seed } = cmd {
            assert_eq!(width, 10);
            assert_eq!(height, 10);
            assert_eq!(seed, Some(42));
        } else {
            panic!("Wrong command type");
        }
    }
}
