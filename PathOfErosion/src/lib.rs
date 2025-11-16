pub mod types;
pub mod game;
pub mod board;
pub mod deck;
pub mod hazards;
pub mod validation;

#[cfg(target_arch = "wasm32")]
pub mod wasm;

#[cfg(test)]
mod property_tests;

pub use game::Game;
pub use types::{Direction, Position, TileType, Tile};

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen(start)]
pub fn init() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}
