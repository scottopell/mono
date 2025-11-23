# Example LLM Session

This document demonstrates how an LLM would interact with the Paths of Erosion JSON API.

## Step 1: Start a New Game

**LLM Command:**
```json
{
  "action": "new_game",
  "width": 10,
  "height": 10,
  "seed": 42
}
```

**Response (abbreviated):**
```json
{
  "success": true,
  "message": "New game started with seed 42",
  "erosion": {
    "occurred": false,
    "tiles_removed": 0,
    "tiles_removed_positions": []
  },
  "new_state": {
    "turn": 0,
    "phase": "PLACING_FORCED_CARD",
    "board": {
      "width": 10,
      "height": 10,
      "ascii": "    0 1 2 3 4 5 6 7 8 9 \n  ┌────────────────────┐\n0 │ . . . . . . . . . . │\n1 │ . . X X X . . . . . │\n... (board visualization)",
      "tiles": [],
      "hazards": [
        {"x": 9, "y": 4},
        {"x": 6, "y": 8},
        ...
      ]
    },
    "forced_card": {
      "type": "CORNER_NW",
      "symbol": "┘",
      "description": "Corner connecting North and West",
      "connections": ["North", "West"]
    },
    "optional_card": {
      "type": "STRAIGHT_EW",
      "symbol": "─",
      "description": "Straight path running East-West (horizontal)",
      "connections": ["East", "West"]
    },
    "valid_moves": [
      {
        "x": 0,
        "y": 0,
        "reason": "Starting position (no tiles on board yet)",
        "connects_to": []
      },
      ... (88 total valid moves)
    ],
    "context": "Turn 0: Place forced card (CORNER_NW ┘). You have 88 valid placement options.",
    "state_blob": "AAAAAAAAAAoAAAAAAAAACgAAAAAAAACq+v///wAAAAD..."
  }
}
```

## Step 2: LLM Analyzes and Places First Tile

**LLM Reasoning:**
- Board is empty (no tiles yet)
- Forced card is CORNER_NW (┘) connecting North and West
- 88 valid positions available
- Let me place it at the center of the board (5, 5) to allow growth in all directions

**LLM Command:**
```json
{
  "action": "place_forced",
  "state": "AAAAAAAAAAoAAAAAAAAACgAAAAAAAACq+v///wAAAAD...",
  "x": 5,
  "y": 5
}
```

**Response (abbreviated):**
```json
{
  "success": true,
  "message": "Tile placed successfully at (5,5)",
  "erosion": {
    "occurred": false,
    "tiles_removed": 0,
    "tiles_removed_positions": []
  },
  "new_state": {
    "turn": 0,
    "phase": "PLACING_OPTIONAL_CARD",
    "board": {
      "ascii": "    0 1 2 3 4 5 6 7 8 9 \n  ┌────────────────────┐\n0 │ . . . . . . . . . . │\n...5 │ . . X . . ┘ . . . . │\n...",
      "tiles": [
        {
          "x": 5,
          "y": 5,
          "type": "CORNER_NW",
          "symbol": "┘",
          "turn_placed": 0
        }
      ],
      "hazards": [...]
    },
    "forced_card": null,
    "optional_card": {
      "type": "STRAIGHT_EW",
      "symbol": "─",
      "description": "Straight path running East-West (horizontal)",
      "connections": ["East", "West"]
    },
    "valid_moves": [
      {
        "x": 5,
        "y": 4,
        "reason": "Adjacent to tile at (5,5)",
        "connects_to": [{"x": 5, "y": 5}]
      },
      {
        "x": 4,
        "y": 5,
        "reason": "Adjacent to tile at (5,5)",
        "connects_to": [{"x": 5, "y": 5}]
      }
    ],
    "context": "Turn 0: Optional card (STRAIGHT_EW ─) available. You can place it or skip to next turn.",
    "state_blob": "AAAAAAAAAAoAAAAAAAAACgAAAAAAAABbIf///wAAAAD..."
  }
}
```

## Step 3: LLM Decides on Optional Card

**LLM Reasoning:**
- Optional card is STRAIGHT_EW (─) connecting East-West
- My first tile (┘) connects North and West
- The horizontal tile would connect well if placed to the West (4, 5)
- This would create a nice path foundation
- Let me place it

**LLM Command:**
```json
{
  "action": "place_optional",
  "state": "AAAAAAAAAAoAAAAAAAAACgAAAAAAAABbIf///wAAAAD...",
  "x": 4,
  "y": 5
}
```

**Response (abbreviated):**
```json
{
  "success": true,
  "message": "Tile placed successfully at (4,5)",
  "erosion": {
    "occurred": false,
    "tiles_removed": 0,
    "tiles_removed_positions": []
  },
  "new_state": {
    "turn": 1,
    "phase": "PLACING_FORCED_CARD",
    "board": {
      "ascii": "...5 │ . . X . ─ ┘ . . . . │\n...",
      "tiles": [
        {
          "x": 5,
          "y": 5,
          "type": "CORNER_NW",
          "symbol": "┘",
          "turn_placed": 0
        },
        {
          "x": 4,
          "y": 5,
          "type": "STRAIGHT_EW",
          "symbol": "─",
          "turn_placed": 1
        }
      ]
    },
    "forced_card": {
      "type": "STRAIGHT_NS",
      "symbol": "│",
      "description": "Straight path running North-South (vertical)",
      "connections": ["North", "South"]
    },
    "optional_card": {...},
    "valid_moves": [
      {
        "x": 5,
        "y": 4,
        "reason": "Adjacent to tile at (5,5)",
        "connects_to": [{"x": 5, "y": 5}]
      },
      {
        "x": 3,
        "y": 5,
        "reason": "Adjacent to tile at (4,5)",
        "connects_to": [{"x": 4, "y": 5}]
      },
      {
        "x": 5,
        "y": 6,
        "reason": "Adjacent to tile at (5,5)",
        "connects_to": [{"x": 5, "y": 5}]
      }
    ],
    "context": "Turn 1: Place forced card (STRAIGHT_NS │). You have 3 valid placement options.",
    "state_blob": "AAAAAAAAAAoAAAAAAAAACgAAAAAAAABcXP///wAAAAD..."
  }
}
```

## Step 4: LLM Skips Optional Card

**LLM Reasoning:**
- Turn 2, forced card placed successfully
- Optional card doesn't fit well with current path
- Rather than making a bad placement, let me skip
- This gives me more flexibility for future turns

**LLM Command:**
```json
{
  "action": "skip_optional",
  "state": "AAAAAAAAAAoAAAAAAAAACgAAAAAAAADxYP///wAAAAD..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Optional card skipped. Starting new turn.",
  "erosion": {
    "occurred": false,
    "tiles_removed": 0,
    "tiles_removed_positions": []
  },
  "new_state": {
    "turn": 3,
    "phase": "PLACING_FORCED_CARD",
    ...
  }
}
```

## Step 5: Erosion Example

**Scenario:** LLM cannot place forced card (all adjacent positions blocked)

**Response:**
```json
{
  "success": false,
  "message": "Not adjacent to path",
  "erosion": {
    "occurred": true,
    "tiles_removed": 2,
    "tiles_removed_positions": []
  },
  "new_state": {
    "turn": 8,
    "phase": "PLACING_OPTIONAL_CARD",
    "board": {
      "ascii": "... (board with 2 fewer tiles)",
      "tiles": [...]  // Some tiles removed
    },
    "context": "Turn 8: Optional card (CORNER_SE ┌) available. ...",
    ...
  }
}
```

## Key Observations for LLMs

1. **State Continuity**: The `state_blob` field must be passed back in subsequent commands
2. **Visual + Structural**: Both ASCII visualization and structured tile data are provided
3. **Explicit Moves**: Valid moves are enumerated - no need to compute them
4. **Natural Language**: `context` field provides human-readable game state summary
5. **Feedback**: Every action returns success status, message, and erosion info
6. **Stateless**: Each command is independent - no session management needed

## Error Handling Example

**Invalid Dimension:**
```json
{
  "action": "new_game",
  "width": 200,
  "height": 10
}
```

**Response:**
```json
{
  "success": false,
  "error": "Board width must be between 5 and 100"
}
```

**Invalid Move:**
```json
{
  "action": "place_forced",
  "state": "...",
  "x": 99,
  "y": 99
}
```

**Response:**
```json
{
  "success": false,
  "message": "Out of bounds",
  "erosion": {
    "occurred": true,
    "tiles_removed": 1,
    "tiles_removed_positions": []
  },
  "new_state": {...}
}
```
