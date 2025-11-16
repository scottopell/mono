# Path of Erosion - Technical Design

## Architecture Overview

Path of Erosion follows a **pure core + thin shell** architecture pattern:

- **Core**: Rust game engine (2800+ lines) with zero rendering dependencies
- **Shell**: TypeScript UI layer (500+ lines) for Canvas-based rendering
- **Bridge**: WebAssembly (WASM) bindings connecting Rust to JavaScript

This separation enables:
- Platform independence (web now, iOS/native later)
- Comprehensive testing of game logic independent of UI
- Type-safe game mechanics with Rust's strong typing
- Deterministic, reproducible gameplay via seeded RNG

```
┌─────────────────────────────────────────┐
│         TypeScript UI Layer             │
│  (Canvas rendering, input handling)     │
└─────────────────┬───────────────────────┘
                  │ WASM bindings
┌─────────────────▼───────────────────────┐
│         Rust Game Engine                │
│  (Game state, validation, scoring)      │
└─────────────────────────────────────────┘
```

## Data Models

### Core Types (Rust)

**Position**: Grid coordinates
```rust
struct Position {
    x: i32,
    y: i32
}
```

**Direction**: Cardinal directions for adjacency
```rust
enum Direction { North, South, East, West }
```

**TileType**: Path tile shapes
```rust
enum TileType {
    Straight,
    Corner,
    Fork,
    Terminus
}
```

**TerrainType**: Visual and scoring categories
```rust
enum TerrainType {
    Forest,
    Grassland,
    Water,
    Stone
}
```

**Card**: Drawable tile with type and terrain
```rust
struct Card {
    tile_type: TileType,
    terrain: TerrainType
}
```

**Tile**: Placed card with position
```rust
struct Tile {
    position: Position,
    tile_type: TileType,
    terrain: TerrainType
}
```

**GameState**: Complete game state
```rust
struct GameState {
    board: HashMap<Position, Tile>,
    hazards: HashSet<Position>,
    deck: Vec<Card>,
    score: u32,
    turn: u32,
    current_forced_card: Option<Card>,
    current_optional_card: Option<Card>,
    phase: TurnPhase
}
```

**TurnPhase**: Current phase of turn
```rust
enum TurnPhase {
    ForcedCardPlacement,
    OptionalCardDecision,
    TurnEnd
}
```

## Component Interactions

### Turn Flow

1. **Draw Forced Card** (`game.rs::draw_forced_card()`)
   - Pops card from shuffled deck
   - Sets `current_forced_card` in state
   - Transitions to `ForcedCardPlacement` phase

2. **Validate Placement** (`validation.rs::is_valid_placement()`)
   - Checks adjacency to existing path tiles
   - Ensures position not occupied by hazard or existing tile
   - Returns valid positions list

3. **Place Tile** (`board.rs::place_tile()`)
   - Adds tile to board at position
   - Updates score (+1 base points)
   - Checks path connectivity

4. **Handle Erosion** (`game.rs::trigger_erosion()`)
   - Removes most recently placed tile
   - Validates path connectivity via BFS
   - Recursively removes endpoint tiles until connected

5. **Optional Card Phase** (`game.rs::offer_optional_card()`)
   - Draws second card
   - Sets `current_optional_card`
   - Awaits player decision (place or skip)

6. **End Turn** (`game.rs::end_turn()`)
   - Increments turn counter
   - Clears current cards
   - Transitions to next forced card draw

### Pathfinding

**Connectivity Check** (`board.rs::is_connected()`)
- Uses breadth-first search (BFS) from starting tile
- Validates all tiles reachable through orthogonal adjacency
- Returns `true` if single connected component exists

**Endpoint Detection** (`board.rs::find_endpoints()`)
- Scans all tiles for those with < 2 adjacent path tiles
- Used during erosion to identify removable tiles

## Error Handling Strategy

### Rust Core
- **No panics on user input**: All public APIs return `Result<T, GameError>`
- **Invariant enforcement**: Property tests ensure game state validity
- **Defensive checks**: Validate all inputs at API boundaries

### WASM Bridge
- **Serialization errors**: JSON parsing failures return error states to JS
- **State corruption**: Never expose mutable state across WASM boundary

### TypeScript UI
- **Invalid clicks**: Silent ignore (UI only enables valid positions)
- **Rendering failures**: Graceful degradation to text fallback

## Testing Strategy

### Unit Tests (32 tests)
- Placement validation rules
- Adjacency checking
- Erosion mechanics
- Score calculation
- Deck shuffling

### Property-Based Tests (`property_tests.rs`)
Using `proptest` crate to verify invariants:
- **Game state validity**: Board and hazards never overlap
- **Deck conservation**: Card count remains constant
- **Bounds checking**: Positions stay within reasonable ranges
- **Connectivity invariant**: Path always forms single component after valid operations
- **Seeded reproducibility**: Same seed produces identical game sequence

### Integration Testing
- Full turn cycles (draw → place → erosion → optional → end)
- Multi-turn game sessions
- Edge cases (no valid moves, full board)

## Security Considerations

### Input Validation
- All player actions (position clicks, skip) validated against game rules
- WASM boundary sanitizes all inputs from JavaScript

### Data Privacy
- No user data collected
- Game state local to browser session
- No network requests (fully client-side)

### Code Safety
- Rust memory safety prevents buffer overflows, use-after-free
- TypeScript strict mode catches type errors at compile time
- WASM sandboxing isolates game logic from browser APIs

## Performance Considerations

### Caching
- Board rendered to Canvas (retained mode for tiles)
- Only redraw changed tiles on updates
- Pre-computed valid positions during placement phase

### Optimization Strategies
- WASM compiled with `--release` for production (optimized Rust)
- TypeScript bundled and minified via esbuild
- Minimal DOM manipulation (Canvas-based rendering)

### Performance Targets
- **Placement validation**: < 5ms for boards up to 100 tiles
- **Erosion calculation**: < 10ms for worst-case scenarios
- **Rendering frame**: 60fps (< 16ms per frame)
- **WASM load time**: < 200ms on 3G connection

## Build System

### Development Build
```bash
npm run dev  # Watches Rust and TypeScript, rebuilds on changes
```

### Production Build
```bash
npm run build  # Compiles WASM + bundles TypeScript
```

**Build Steps**:
1. `wasm-pack build --target web` - Compiles Rust to WASM
2. `esbuild src/ui/main.ts` - Bundles TypeScript to single JS file
3. Output: `dist/pkg/` (WASM) + `dist/ui.js` (UI bundle)

### Deployment
- Static files: `index.html`, `dist/pkg/`, `dist/ui.js`
- Hosted on GitHub Pages
- No server-side logic required

## Future Extensibility

### Scoring Enhancements
- Terrain coherence bonuses (adjacent same-terrain tiles)
- Forking efficiency bonuses
- Optional card restraint bonus

### iOS Port
- Compile Rust core to native iOS library
- Swift bindings wrap Rust game functions
- SwiftUI replaces TypeScript Canvas rendering
- **Zero changes to game logic** (core is platform-agnostic)

### Multiplayer Considerations
- Game state serializable to JSON
- Deterministic replay via seed sharing
- Potential for asynchronous turn-based play

## Dependencies

### Rust Dependencies
- `wasm-bindgen`: WASM/JavaScript interop
- `serde`: Serialization for state transfer
- `rand`: Deterministic RNG with seeding
- `proptest`: Property-based testing

### TypeScript Dependencies
- `esbuild`: Fast bundler for development and production
- `typescript`: Type checking and compilation

### Build Tools
- `wasm-pack`: WASM compilation and packaging
- `cargo`: Rust build system and test runner
