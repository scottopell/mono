/// WASM bindings for the game - JavaScript interface

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use crate::game::Game;
use crate::types::{Position, GamePhase, TileType};

/// Serializable tile data for JavaScript
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsTile {
    pub id: u32,
    pub x: i32,
    pub y: i32,
    pub tile_type: String,
    pub turn_placed: u32,
}

/// Serializable hazard position
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsHazard {
    pub x: i32,
    pub y: i32,
}

/// Serializable card for JavaScript
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsCard {
    pub tile_type: String,
}

/// Game state for JavaScript consumption
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsGameState {
    pub turn: u32,
    pub phase: String,
    pub tiles: Vec<JsTile>,
    pub hazards: Vec<JsHazard>,
    pub forced_card: Option<JsCard>,
    pub optional_card: Option<JsCard>,
    pub board_width: i32,
    pub board_height: i32,
}

/// Serializable placement result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsPlacementResult {
    pub success: bool,
    pub message: String,
    pub erosion_occurred: bool,
    pub tiles_eroded: usize,
}

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

fn string_to_tile_type(s: &str) -> Option<TileType> {
    match s {
        "STRAIGHT_NS" => Some(TileType::StraightNS),
        "STRAIGHT_EW" => Some(TileType::StraightEW),
        "CORNER_NE" => Some(TileType::CornerNE),
        "CORNER_NW" => Some(TileType::CornerNW),
        "CORNER_SE" => Some(TileType::CornerSE),
        "CORNER_SW" => Some(TileType::CornerSW),
        "T_N" => Some(TileType::TN),
        "T_E" => Some(TileType::TE),
        "T_S" => Some(TileType::TS),
        "T_W" => Some(TileType::TW),
        "CROSS" => Some(TileType::Cross),
        "START" => Some(TileType::START),
        "END" => Some(TileType::END),
        _ => None,
    }
}

/// Wrapper for Game to expose to JavaScript
#[wasm_bindgen]
pub struct GameWrapper {
    game: Game,
}

#[wasm_bindgen]
impl GameWrapper {
    /// Create a new game
    #[wasm_bindgen(constructor)]
    pub fn new(width: i32, height: i32, seed: u64) -> GameWrapper {
        GameWrapper {
            game: Game::new(width, height, seed),
        }
    }

    /// Get the current game state
    #[wasm_bindgen]
    pub fn get_state(&self) -> Result<JsValue, JsValue> {
        let tiles = self.game
            .get_tiles()
            .into_iter()
            .map(|(pos, tt, turn)| JsTile {
                id: 0, // Not tracked in simple version
                x: pos.x,
                y: pos.y,
                tile_type: tile_type_to_string(tt),
                turn_placed: turn,
            })
            .collect();

        let hazards = self.game
            .get_hazards()
            .into_iter()
            .map(|pos| JsHazard {
                x: pos.x,
                y: pos.y,
            })
            .collect();

        let phase = match self.game.phase {
            GamePhase::PlacingForcedCard => "PLACING_FORCED_CARD".to_string(),
            GamePhase::PlacingOptionalCard => "PLACING_OPTIONAL_CARD".to_string(),
            GamePhase::SessionEnded => "SESSION_ENDED".to_string(),
        };

        let forced_card = self.game.current_forced_card.map(|card| JsCard {
            tile_type: tile_type_to_string(card.tile_type),
        });

        let optional_card = self.game.current_optional_card.map(|card| JsCard {
            tile_type: tile_type_to_string(card.tile_type),
        });

        let state = JsGameState {
            turn: self.game.turn,
            phase,
            tiles,
            hazards,
            forced_card,
            optional_card,
            board_width: self.game.board.width,
            board_height: self.game.board.height,
        };

        serde_wasm_bindgen::to_value(&state).map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Place a tile of the forced card
    #[wasm_bindgen]
    pub fn place_forced_card(&mut self, x: i32, y: i32) -> Result<JsValue, JsValue> {
        let pos = Position::new(x, y);
        let result = self.game.place_forced_card(pos);

        let js_result = JsPlacementResult {
            success: result.success,
            message: result.message,
            erosion_occurred: result.erosion_occurred,
            tiles_eroded: result.tiles_eroded,
        };

        serde_wasm_bindgen::to_value(&js_result)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Place a tile of the optional card
    #[wasm_bindgen]
    pub fn place_optional_card(&mut self, x: i32, y: i32) -> Result<JsValue, JsValue> {
        let pos = Position::new(x, y);
        let result = self.game.place_optional_card(pos);

        let js_result = JsPlacementResult {
            success: result.success,
            message: result.message,
            erosion_occurred: result.erosion_occurred,
            tiles_eroded: result.tiles_eroded,
        };

        serde_wasm_bindgen::to_value(&js_result)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Skip the optional card and start a new turn
    #[wasm_bindgen]
    pub fn skip_optional_card(&mut self) {
        self.game.skip_optional_card();
    }

    /// Check if the game is won (START connected to END)
    #[wasm_bindgen]
    pub fn is_won(&self) -> bool {
        self.game.is_won()
    }

    /// Get current turn number
    #[wasm_bindgen]
    pub fn turn(&self) -> u32 {
        self.game.turn
    }

    /// Get current game phase
    #[wasm_bindgen]
    pub fn phase(&self) -> String {
        match self.game.phase {
            GamePhase::PlacingForcedCard => "PLACING_FORCED_CARD".to_string(),
            GamePhase::PlacingOptionalCard => "PLACING_OPTIONAL_CARD".to_string(),
            GamePhase::SessionEnded => "SESSION_ENDED".to_string(),
        }
    }
}
