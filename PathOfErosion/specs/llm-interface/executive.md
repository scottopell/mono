# LLM Interface - Executive Summary

## Requirements Summary

The LLM Interface enables AI agents to play Paths of Erosion through a structured JSON API. LLMs receive game state as both visual ASCII art and structured data, enabling spatial reasoning and strategic decision-making. The interface provides complete information about valid moves, game phase, and action consequences. LLMs can start games, place tiles, skip optional cards, and receive detailed feedback including erosion events. The stateless design passes serialized game state in each command, eliminating session management complexity. This enables asynchronous gameplay, experimentation with different strategies, and integration with any LLM-powered tool or agent.

**Value Proposition:** Makes a visual puzzle game accessible to text-based AI agents through thoughtful information architecture—combining ASCII visualization with structured JSON, explicit move enumeration, and natural language context.

## Technical Summary

The LLM interface extends the existing pure core/thin shell architecture by adding a JSON renderer alongside the WASM/Canvas UI. A new stateless binary (`erosion`) reads JSON commands from stdin and outputs JSON state to stdout. Three new Rust modules provide: (1) ASCII board rendering using Unicode box-drawing characters, (2) JSON serialization of game state with enriched metadata (valid moves, card descriptions, context), and (3) command processing for game actions. Game state is serialized using bincode and base64-encoded for compact transmission between commands. The binary never modifies core game logic—it purely translates between JSON and the existing Game API. Total addition: ~500 lines of Rust across 3 modules plus 1 binary entrypoint.

**Key Design:** Stateless single-binary architecture with complete game state serialization eliminates session complexity while maintaining full game functionality through JSON I/O.

## Status Summary

| Requirement | Status | Notes |
|-------------|--------|-------|
| **REQ-LLM-001:** Visualize Game Board | ❌ Not Started | Renderer module planned |
| **REQ-LLM-002:** Understand Current Cards | ❌ Not Started | Card description logic pending |
| **REQ-LLM-003:** Discover Valid Moves | ❌ Not Started | Move computation not implemented |
| **REQ-LLM-004:** Understand Game Phase | ❌ Not Started | Phase serialization pending |
| **REQ-LLM-005:** Issue Placement Commands | ❌ Not Started | Command parser not started |
| **REQ-LLM-006:** Skip Optional Cards | ❌ Not Started | Skip command not implemented |
| **REQ-LLM-007:** Receive Action Feedback | ❌ Not Started | Result serialization pending |
| **REQ-LLM-008:** Track Game Progress | ❌ Not Started | Turn/tile count not exposed |
| **REQ-LLM-009:** Maintain State Continuity | ❌ Not Started | State serialization not implemented |
| **REQ-LLM-010:** Start New Games | ❌ Not Started | NewGame command pending |
| **REQ-LLM-011:** Understand Tile Symbols | ❌ Not Started | Symbol mapping not created |
| **REQ-LLM-012:** Identify Hazards | ❌ Not Started | Hazard rendering not implemented |
| **REQ-LLM-013:** Receive Contextual Summaries | ❌ Not Started | Context generation pending |
| **REQ-LLM-014:** Understand Erosion Impact | ❌ Not Started | Erosion reporting not implemented |
| **REQ-LLM-015:** Access Complete State Data | ❌ Not Started | Structured data export pending |

**Progress:** 0 of 15 requirements complete

## Implementation Plan

### Phase 1: ASCII Rendering (REQ-LLM-001, REQ-LLM-011, REQ-LLM-012)
- Create `src/renderer.rs`
- Implement `tile_to_char()` mapping TileType to Unicode
- Implement `render_board()` for full ASCII visualization
- Add coordinate labels and grid borders
- Mark hazards with `X` symbol
- **Deliverable:** ASCII board rendering with all tile types

### Phase 2: JSON State Serialization (REQ-LLM-002, REQ-LLM-004, REQ-LLM-008, REQ-LLM-009, REQ-LLM-015)
- Create `src/json_state.rs`
- Define JSON schema structures (GameStateJson, BoardJson, CardJson, etc.)
- Implement `to_json()` for Game state
- Implement `from_blob()` for state deserialization
- Implement `describe_card()` for human-readable card info
- Add turn tracking and phase serialization
- **Deliverable:** Complete game state as JSON

### Phase 3: Valid Move Computation (REQ-LLM-003)
- Implement `compute_valid_moves()` in json_state.rs
- Use existing validation.rs to find valid positions
- Generate explanations for each valid position
- Identify connecting tiles for each move
- **Deliverable:** Valid moves array with reasoning

### Phase 4: Command Processing (REQ-LLM-005, REQ-LLM-006, REQ-LLM-007, REQ-LLM-010, REQ-LLM-013, REQ-LLM-014)
- Create `src/commands.rs`
- Define Command enum (NewGame, PlaceForcedCard, PlaceOptionalCard, SkipOptional)
- Define CommandResult structure with erosion info
- Implement `execute()` function
- Add natural language context generation
- Add erosion event reporting
- **Deliverable:** Full command execution logic

### Phase 5: STDIO Binary (All requirements)
- Create `src/bin/erosion.rs`
- Implement stdin reading
- Implement JSON parsing and error handling
- Integrate command execution
- Implement stdout JSON output
- Add error response formatting
- **Deliverable:** Working binary accepting JSON I/O

### Phase 6: Testing & Examples
- Unit tests for renderer
- Unit tests for JSON serialization
- Integration tests for full game sessions
- Property tests for state round-trips
- Create `examples/llm_session.json` with complete game
- **Deliverable:** Comprehensive test coverage

## Dependencies

**New Crate Dependencies:**
- `bincode` - Binary state serialization
- `base64` - State encoding for JSON transmission

**Existing Dependencies (reused):**
- `serde` / `serde_json` - JSON serialization
- Core game modules (no modifications required)

## Risks & Mitigations

**Risk:** State serialization bloat for large boards
- **Mitigation:** Use bincode (binary) instead of JSON for state blob, reducing size by ~60%

**Risk:** Valid move computation becomes expensive on large boards
- **Mitigation:** Leverage existing validation.rs which is already optimized; cache results if needed

**Risk:** ASCII rendering breaks on non-standard terminals
- **Mitigation:** Use widely-supported Unicode box-drawing characters (U+2500 block)

**Risk:** LLMs struggle with coordinate systems
- **Mitigation:** Provide both visual ASCII and explicit move enumeration; include "reason" field explaining each valid move

## Success Metrics

- ✅ Binary compiles and runs without errors
- ✅ Can complete full game session via JSON commands
- ✅ ASCII board accurately represents game state
- ✅ All valid moves correctly identified
- ✅ Erosion events properly reported
- ✅ State serialization round-trips successfully
- ✅ Example LLM session documented and validated

## Open Questions

1. **Board size limits:** Should we enforce maximum dimensions (e.g., 100x100) to prevent memory issues?
   - **Recommendation:** Start with reasonable limits, can adjust based on testing

2. **ASCII rendering width:** Do we truncate large boards or use paging?
   - **Recommendation:** Full render with scrolling; LLMs can handle large text blocks

3. **State blob encoding:** Bincode vs JSON for state serialization?
   - **Recommendation:** Bincode for production (smaller), JSON for debugging

4. **Error verbosity:** How detailed should error messages be?
   - **Recommendation:** Verbose for development, can add verbosity flag later

5. **Valid move ordering:** Should we sort valid moves by strategy score?
   - **Recommendation:** Defer to Phase 7 (future enhancement); alphabetical for now
