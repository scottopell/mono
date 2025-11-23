# LLM Interface - Technical Design

## Architecture Overview

The LLM interface follows the **pure core, thin shell** pattern established by the existing architecture. It adds a new renderer alongside the WASM/Canvas UI:

```
┌─────────────────────────────────────────┐
│    Rust Core (Pure Game Logic)          │
│    game.rs, board.rs, types.rs          │
│    validation.rs, deck.rs, hazards.rs   │
└──────────────┬───────────────────────────┘
               │
       ┌───────┴────────────┐
       │                    │
┌──────▼──────┐      ┌──────▼────────────┐
│    WASM     │      │   JSON Interface  │
│  Bindings   │      │  (LLM Renderer)   │
└──────┬──────┘      └──────┬────────────┘
       │                    │
┌──────▼──────┐      ┌──────▼────────────┐
│  Canvas UI  │      │  STDIO Binary     │
│ TypeScript  │      │  (JSON I/O)       │
└─────────────┘      └───────────────────┘
```

**Key Principles:**
- Zero modifications to core game logic
- Stateless binary (game state serialized in/out)
- JSON as the interface contract
- ASCII rendering for visual understanding
- Complete information disclosure (no hidden state)

## Data Models

### JSON Schema Definitions

**Input: NewGame Command**
```json
{
  "action": "new_game",
  "width": 20,
  "height": 20,
  "seed": 42  // optional, random if omitted
}
```

**Input: PlaceForcedCard Command**
```json
{
  "action": "place_forced",
  "state": "<base64-encoded-game-state>",
  "x": 5,
  "y": 5
}
```

**Input: PlaceOptionalCard Command**
```json
{
  "action": "place_optional",
  "state": "<base64-encoded-game-state>",
  "x": 5,
  "y": 5
}
```

**Input: SkipOptional Command**
```json
{
  "action": "skip_optional",
  "state": "<base64-encoded-game-state>"
}
```

**Output: Game State Response**
```json
{
  "turn": 5,
  "phase": "PLACING_FORCED_CARD",
  "board": {
    "width": 20,
    "height": 20,
    "ascii": "<multi-line-string>",
    "tiles": [
      {
        "x": 10,
        "y": 10,
        "type": "START",
        "symbol": "S",
        "turn_placed": 0
      }
    ],
    "hazards": [
      {"x": 8, "y": 12}
    ]
  },
  "forced_card": {
    "type": "CORNER_NE",
    "symbol": "└",
    "description": "Corner connecting North and East",
    "connections": ["North", "East"]
  },
  "optional_card": {
    "type": "STRAIGHT_EW",
    "symbol": "─",
    "description": "Straight path East-West",
    "connections": ["East", "West"]
  },
  "valid_moves": [
    {
      "x": 10,
      "y": 11,
      "reason": "Adjacent south of START at (10,10)",
      "connects_to": [{"x": 10, "y": 10}]
    }
  ],
  "context": "Turn 5: Place forced card (CORNER_NE └). You have 3 valid placement options.",
  "state_blob": "<base64-encoded-game-state>"
}
```

**Output: Action Result**
```json
{
  "success": true,
  "message": "Tile placed successfully at (10,11)",
  "erosion": {
    "occurred": false,
    "tiles_removed": 0,
    "tiles_removed_positions": []
  },
  "new_state": { /* GameStateResponse */ }
}
```

## Component Design

### 1. ASCII Renderer (`src/renderer.rs`)

**Purpose:** Convert board state to visual ASCII representation

**Key Functions:**
- `render_board(board: &Board, hazards: &Hazards, valid_positions: Option<&[Position]>) -> String`
  - Generates ASCII grid with Unicode box-drawing characters
  - Marks hazards with `X`
  - Optionally highlights valid positions with `*`

- `tile_to_char(tile_type: TileType) -> char`
  - Maps TileType enum to Unicode character:
    - `StraightNS` → `│`
    - `StraightEW` → `─`
    - `CornerNE` → `└`
    - `CornerNW` → `┘`
    - `CornerSE` → `┌`
    - `CornerSW` → `┐`
    - `TN` → `├` (T pointing north)
    - `TE` → `┴` (T pointing east)
    - `TS` → `┤` (T pointing south)
    - `TW` → `┬` (T pointing west)
    - `Cross` → `┼`
    - `START` → `S`
    - `END` → `E`

- `render_with_grid(board: &Board, width: i32, height: i32) -> String`
  - Adds coordinate labels (0-9 for first 10, then A-Z)
  - Adds border box around grid
  - Fills empty spaces with `.`

**ASCII Format:**
```
    0 1 2 3 4 5 6 7 8 9
  ┌─────────────────────┐
0 │ . . . . . . . . . . │
1 │ . . . . . S . . . . │
2 │ . . . . . │ . . . . │
3 │ . . . . . └ ─ ┐ . . │
4 │ . . . . . . X │ . . │
5 │ . . . . . . . └ ─ . │
  └─────────────────────┘

S = START, X = Hazard
```

### 2. JSON State Serializer (`src/json_state.rs`)

**Purpose:** Convert Game state to/from JSON with enriched metadata

**Key Structures:**
```rust
#[derive(Serialize, Deserialize)]
pub struct GameStateJson {
    pub turn: u32,
    pub phase: String,
    pub board: BoardJson,
    pub forced_card: Option<CardJson>,
    pub optional_card: Option<CardJson>,
    pub valid_moves: Vec<ValidMove>,
    pub context: String,
    pub state_blob: String,  // base64-encoded bincode
}

#[derive(Serialize, Deserialize)]
pub struct BoardJson {
    pub width: i32,
    pub height: i32,
    pub ascii: String,
    pub tiles: Vec<TileJson>,
    pub hazards: Vec<PositionJson>,
}

#[derive(Serialize, Deserialize)]
pub struct CardJson {
    pub tile_type: String,
    pub symbol: char,
    pub description: String,
    pub connections: Vec<String>,
}

#[derive(Serialize, Deserialize)]
pub struct ValidMove {
    pub x: i32,
    pub y: i32,
    pub reason: String,
    pub connects_to: Vec<PositionJson>,
}
```

**Key Functions:**
- `to_json(game: &Game) -> GameStateJson`
  - Computes valid moves based on current phase
  - Generates ASCII board
  - Creates natural language context
  - Serializes game state to base64 blob

- `from_blob(blob: &str) -> Result<Game, Error>`
  - Decodes base64 game state
  - Deserializes using bincode or serde_json

- `describe_card(card: &Card) -> CardJson`
  - Converts TileType to human-readable description
  - Lists directional connections

- `compute_valid_moves(game: &Game) -> Vec<ValidMove>`
  - Uses validation.rs to find all valid positions
  - Generates explanations for each valid position
  - Identifies which existing tiles each position connects to

### 3. Command Processor (`src/commands.rs`)

**Purpose:** Parse and execute JSON commands

**Command Enum:**
```rust
#[derive(Deserialize)]
#[serde(tag = "action")]
pub enum Command {
    #[serde(rename = "new_game")]
    NewGame {
        width: i32,
        height: i32,
        #[serde(default)]
        seed: Option<u64>,
    },
    #[serde(rename = "place_forced")]
    PlaceForcedCard {
        state: String,
        x: i32,
        y: i32,
    },
    #[serde(rename = "place_optional")]
    PlaceOptionalCard {
        state: String,
        x: i32,
        y: i32,
    },
    #[serde(rename = "skip_optional")]
    SkipOptional {
        state: String,
    },
}
```

**Result Structure:**
```rust
#[derive(Serialize)]
pub struct CommandResult {
    pub success: bool,
    pub message: String,
    pub erosion: ErosionInfo,
    pub new_state: GameStateJson,
}

#[derive(Serialize)]
pub struct ErosionInfo {
    pub occurred: bool,
    pub tiles_removed: usize,
    pub tiles_removed_positions: Vec<PositionJson>,
}
```

**Key Functions:**
- `execute(command: Command) -> CommandResult`
  - Pattern matches on command type
  - Decodes game state (if needed)
  - Calls appropriate Game method
  - Converts result to JSON

### 4. STDIO Binary (`src/bin/erosion.rs`)

**Purpose:** Read JSON from stdin, output JSON to stdout

**Implementation:**
```rust
fn main() {
    // Read stdin to string
    let input = read_stdin();

    // Parse command
    let command: Command = serde_json::from_str(&input)
        .expect("Invalid JSON command");

    // Execute
    let result = execute(command);

    // Output JSON
    println!("{}", serde_json::to_string_pretty(&result).unwrap());
}
```

**Error Handling:**
- Invalid JSON → JSON error response
- Invalid command → JSON error response
- Game logic errors → Success=false in response
- All errors captured, never panics

## Component Interactions

### New Game Flow
```
LLM → {"action":"new_game","width":20,"height":20,"seed":42}
  ↓
STDIN → Binary parses command
  ↓
Command::NewGame → Game::new(20, 20, 42)
  ↓
Game state → to_json()
  ↓
GameStateJson → STDOUT
  ↓
LLM receives initial state with ASCII board + valid moves
```

### Place Tile Flow
```
LLM → {"action":"place_forced","state":"...","x":10,"y":11}
  ↓
STDIN → Binary parses command
  ↓
Command::PlaceForcedCard → from_blob(state)
  ↓
Game restored → game.place_forced_card(Position{x:10,y:11})
  ↓
PlacementResult → CommandResult
  ↓
New game state → to_json()
  ↓
CommandResult with new_state → STDOUT
  ↓
LLM receives result + updated board
```

### Erosion Event Flow
```
LLM attempts invalid placement
  ↓
game.place_forced_card() → validation fails
  ↓
PlacementResult{success:false, erosion_occurred:true, tiles_eroded:2}
  ↓
to_json() includes erosion info in response
  ↓
LLM sees updated board with tiles removed
```

## Error Handling Strategy

### Input Validation
- JSON parsing errors → JSON error response with message
- Invalid coordinates → success=false with descriptive message
- Missing state blob → JSON error response
- Corrupted state blob → JSON error response

### Game State Errors
- All errors captured by PlacementResult
- Never panic, always return JSON
- Descriptive error messages for debugging

### Serialization Errors
- State serialization uses bincode (compact, reliable)
- Fallback to serde_json if bincode fails
- Base64 encoding prevents escaping issues

## Testing Strategy

### Unit Tests
- `renderer.rs`: Test ASCII output for various board configurations
- `json_state.rs`: Test JSON serialization round-trips
- `commands.rs`: Test command parsing and execution
- Valid moves computation accuracy

### Integration Tests
- Full game session from new_game to multiple placements
- Erosion scenarios with before/after state validation
- Skip optional card flow
- Game end detection

### Example-Based Tests
- `examples/llm_session.json` - Complete game transcript
- Validate against actual LLM usage patterns

### Property Tests
- State serialization round-trip: `game == from_blob(to_blob(game))`
- Valid moves are actually valid: all positions pass validation
- ASCII rendering doesn't crash on any board state

## Performance Considerations

### State Serialization
- **Bincode** for compact binary representation (~1-2KB per game state)
- Base64 encoding adds ~33% overhead
- Serialization/deserialization < 1ms for typical game states

### JSON Generation
- Lazy evaluation: only compute valid moves when needed
- ASCII rendering cached in response
- No unnecessary clones of game state

### Memory Usage
- Stateless binary: no memory accumulation
- Each command creates new Game instance
- Binary exits after each command (no long-running process)

## Security Considerations

### Input Validation
- All positions validated before use
- State blob verified before deserialization
- No arbitrary code execution from JSON

### Resource Limits
- Board size limited to reasonable bounds (max 100x100)
- State blob size limited (reject > 10MB)
- Command processing timeout (prevent infinite loops)

## Future Extensibility

### Additional Commands
- `get_state` - Query current state without action
- `undo` - Revert last action (requires state history)
- `suggest_move` - AI assistance for LLM learning

### Enhanced Feedback
- Scoring information in state
- Suggested next moves ranked by strategy
- Path connectivity visualization

### Multi-Game Support
- Session management for multiple concurrent games
- Game state persistence to files
- Replay functionality from saved states

## Dependencies

### New Rust Dependencies (Cargo.toml)
```toml
[dependencies]
# Existing dependencies remain
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
bincode = "1.3"
base64 = "0.21"

[[bin]]
name = "erosion"
path = "src/bin/erosion.rs"
```

### No External Runtime Dependencies
- Pure Rust, compiles to single binary
- No JavaScript or Python required
- Works on any platform with Rust compiler

## Build and Deployment

### Build Commands
```bash
# Development build
cargo build --bin erosion

# Production build (optimized)
cargo build --bin erosion --release

# Run tests
cargo test --lib
```

### Binary Usage
```bash
# Interactive JSON input
./target/release/erosion

# Pipe JSON file
cat command.json | ./target/release/erosion

# One-liner
echo '{"action":"new_game","width":10,"height":10}' | ./target/release/erosion
```

### Integration with LLM Workflows
- Claude Code can invoke binary via Bash tool
- LLM receives JSON, parses with native understanding
- State continuity maintained in conversation history
- No session management required

## Requirement Mapping

| Requirement | Implementation |
|-------------|----------------|
| REQ-LLM-001 | `renderer.rs::render_board()` |
| REQ-LLM-002 | `json_state.rs::describe_card()` |
| REQ-LLM-003 | `json_state.rs::compute_valid_moves()` |
| REQ-LLM-004 | `GameStateJson.phase` and `context` fields |
| REQ-LLM-005 | `commands.rs::PlaceForcedCard`, `PlaceOptionalCard` |
| REQ-LLM-006 | `commands.rs::SkipOptional` |
| REQ-LLM-007 | `CommandResult` with success/message/erosion |
| REQ-LLM-008 | `GameStateJson.turn` and tile count in board |
| REQ-LLM-009 | `state_blob` serialization using bincode |
| REQ-LLM-010 | `commands.rs::NewGame` |
| REQ-LLM-011 | `renderer.rs::tile_to_char()` mapping |
| REQ-LLM-012 | Hazards rendered as `X` in ASCII |
| REQ-LLM-013 | `GameStateJson.context` field |
| REQ-LLM-014 | `ErosionInfo` in CommandResult |
| REQ-LLM-015 | `BoardJson.tiles` and `hazards` arrays |
