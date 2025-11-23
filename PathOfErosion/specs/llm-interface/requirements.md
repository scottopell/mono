# LLM Interface for Paths of Erosion

## User Story

As an LLM agent, I need to play Paths of Erosion through a structured JSON interface so that I can understand the game state, make strategic decisions, and interact with the game programmatically.

## Requirements

### REQ-LLM-001: Visualize Game Board

WHEN the LLM receives the game state
THE SYSTEM SHALL provide an ASCII representation of the board showing all placed tiles, hazards, and empty spaces using Unicode box-drawing characters

**Rationale:** LLMs process visual patterns better when presented as ASCII art. A visual board representation enables the LLM to understand spatial relationships, identify patterns, and plan multi-turn strategies—similar to how humans benefit from seeing the game. Text descriptions of coordinates alone would be difficult to reason about spatially.

---

### REQ-LLM-002: Understand Current Cards

WHEN the LLM receives the game state
THE SYSTEM SHALL describe each available card with its type, visual symbol, and directional connections in natural language

**Rationale:** LLMs need to understand what placement options each card offers. Knowing that a "CORNER_NE" connects North and East helps the LLM evaluate whether that card fits their strategy, whereas just seeing "CORNER_NE" requires memorizing game rules. Natural descriptions reduce cognitive load.

---

### REQ-LLM-003: Discover Valid Moves

WHEN the LLM needs to decide where to place a card
THE SYSTEM SHALL list all valid placement positions with explanations of why each position is valid and which tiles it connects to

**Rationale:** LLMs benefit from explicit enumeration of options rather than having to derive them from rules. Providing valid moves with context (e.g., "Adjacent south of tile at (5,1)") enables informed decision-making and prevents invalid move attempts that would waste turns.

---

### REQ-LLM-004: Understand Game Phase

WHEN the LLM receives the game state
THE SYSTEM SHALL indicate the current phase (placing forced card, placing optional card, or game ended) and what actions are available

**Rationale:** LLMs need clear context about what they should do next. Knowing whether to place a forced card (required) versus an optional card (can skip) fundamentally changes decision-making. Without phase awareness, the LLM might attempt invalid actions.

---

### REQ-LLM-005: Issue Placement Commands

WHEN the LLM decides to place a card at a specific position
THE SYSTEM SHALL accept a JSON command specifying the action type and coordinates

**Rationale:** LLMs excel at generating structured JSON output. A simple, predictable command format (action + coordinates) enables reliable interaction without parsing complex natural language or dealing with ambiguous commands.

---

### REQ-LLM-006: Skip Optional Cards

WHEN the LLM decides not to place the optional card
THE SYSTEM SHALL accept a skip command that advances to the next turn

**Rationale:** Strategic play sometimes requires restraint. LLMs need the ability to skip optional cards when placement would create future problems or when maximizing the "optional card restraint" bonus. This gives the LLM full agency over game strategy.

---

### REQ-LLM-007: Receive Action Feedback

WHEN the LLM issues a command
THE SYSTEM SHALL respond with success/failure status, a descriptive message, and any erosion events that occurred

**Rationale:** LLMs need to understand the consequences of their actions. Knowing that "Tile placed successfully" versus "Placement triggered erosion, removed 2 tiles" helps the LLM learn from outcomes and adjust strategy. Without feedback, the LLM operates blindly.

---

### REQ-LLM-008: Track Game Progress

WHEN the LLM receives the game state
THE SYSTEM SHALL include the current turn number and total tiles on the board

**Rationale:** LLMs benefit from progress indicators to understand how far into the game they are. This enables pacing strategy (e.g., more conservative early game, risk-taking late game) and provides a sense of accomplishment as the path grows.

---

### REQ-LLM-009: Maintain State Continuity

WHEN the LLM completes an action
THE SYSTEM SHALL return a complete serialized game state that can be passed to the next command

**Rationale:** Stateless interaction simplifies LLM integration—each command is independent, requiring no session management or persistent connections. The LLM can store state in conversation history and resume later, enabling asynchronous or interrupted gameplay.

---

### REQ-LLM-010: Start New Games

WHEN the LLM wants to start a new game
THE SYSTEM SHALL accept a new game command with board dimensions and optional random seed

**Rationale:** LLMs need the ability to initiate games for practice, experimentation, or testing different strategies. Seed support enables reproducible games for learning and debugging specific scenarios.

---

### REQ-LLM-011: Understand Tile Symbols

WHEN the LLM views the ASCII board
THE SYSTEM SHALL use consistent Unicode symbols for each tile type (│ for vertical, ─ for horizontal, └┘┐┌ for corners, ├┴┤┬┼ for junctions)

**Rationale:** Consistent visual symbols create a learnable visual language. Once the LLM sees a "└" character a few times, it can quickly recognize corner tiles in future boards. Inconsistent symbols would require constant re-parsing and increase error rates.

---

### REQ-LLM-012: Identify Hazards

WHEN the LLM views the ASCII board
THE SYSTEM SHALL mark hazard positions with a distinct symbol (X) that clearly differentiates them from path tiles

**Rationale:** LLMs need to quickly distinguish obstacles from path tiles when planning moves. A clear hazard marker prevents the LLM from attempting to place tiles on blocked positions or expecting to extend paths through hazards.

---

### REQ-LLM-013: Receive Contextual Summaries

WHEN the LLM receives the game state
THE SYSTEM SHALL provide a one-sentence natural language summary of the current situation (e.g., "Turn 5: Place forced card (CORNER_NE). You have 3 valid placement options.")

**Rationale:** Natural language summaries provide quick context that helps LLMs orient themselves, especially when resuming a game after interruption. This mirrors how humans benefit from "where was I?" summaries. Pure structured data requires more cognitive effort to parse.

---

### REQ-LLM-014: Understand Erosion Impact

WHEN an action triggers erosion
THE SYSTEM SHALL report how many tiles were removed and update the board visualization accordingly

**Rationale:** Erosion is a critical game mechanic. LLMs need clear feedback about erosion consequences to learn cause-and-effect relationships. Knowing "your forced card placement failed, 2 tiles eroded" helps the LLM understand the stakes of risky placements and adjust future strategy.

---

### REQ-LLM-015: Access Complete State Data

WHEN the LLM receives the game state
THE SYSTEM SHALL provide structured data for all tiles (positions, types, turn placed) and all hazards (positions)

**Rationale:** While ASCII visualization helps with spatial reasoning, LLMs also benefit from structured data for algorithmic analysis. Having both visual (ASCII) and structured (JSON arrays) representations gives the LLM flexibility to use whichever format suits the current reasoning task.

---
