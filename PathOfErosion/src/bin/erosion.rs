/// Paths of Erosion - JSON API Binary
/// REQ-LLM-001 through REQ-LLM-015: Complete LLM interface
///
/// This binary provides a stateless JSON I/O interface for the game.
/// It reads a JSON command from stdin and outputs a JSON result to stdout.
///
/// Usage:
///   echo '{"action":"new_game","width":10,"height":10,"seed":42}' | cargo run --bin erosion
///   cat command.json | cargo run --bin erosion

use std::io::{self, Read};
use tile_game::commands::{execute, Command, CommandResult};

/// Error response structure
#[derive(serde::Serialize)]
struct ErrorResponse {
    success: bool,
    error: String,
}

fn main() {
    // Read stdin to string
    let mut input = String::new();
    if let Err(e) = io::stdin().read_to_string(&mut input) {
        output_error(&format!("Failed to read stdin: {}", e));
        std::process::exit(1);
    }

    // Parse command from JSON
    let command: Command = match serde_json::from_str(&input) {
        Ok(cmd) => cmd,
        Err(e) => {
            output_error(&format!("Invalid JSON command: {}", e));
            std::process::exit(1);
        }
    };

    // Execute command
    let result: CommandResult = match execute(command) {
        Ok(res) => res,
        Err(e) => {
            output_error(&format!("Command execution error: {}", e));
            std::process::exit(1);
        }
    };

    // Output result as JSON
    match serde_json::to_string_pretty(&result) {
        Ok(json) => {
            println!("{}", json);
        }
        Err(e) => {
            output_error(&format!("Failed to serialize result: {}", e));
            std::process::exit(1);
        }
    }
}

/// Output an error response and exit
fn output_error(message: &str) {
    let error = ErrorResponse {
        success: false,
        error: message.to_string(),
    };

    if let Ok(json) = serde_json::to_string_pretty(&error) {
        eprintln!("{}", json);
    } else {
        eprintln!("{{\"success\":false,\"error\":\"{}\"}}", message);
    }
}
