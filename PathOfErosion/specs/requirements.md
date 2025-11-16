# Path of Erosion

## User Story

As a player seeking a meditative puzzle experience, I need a tile-placement game with meaningful constraints so that I can create beautiful paths while accepting impermanence.

## Requirements

### REQ-POE-001: View Game Board

WHEN a player starts or continues a game
THE SYSTEM SHALL display a grid-based canvas showing all placed tiles, their terrain types, and any hazards

**Rationale:** Players need to see their growing path to plan future placements and appreciate the visual pattern they're creating. Seeing the full board enables strategic thinking about where the path can extend.

---

### REQ-POE-002: Place Starting Tile

WHEN a player starts a new game
THE SYSTEM SHALL place a single neutral tile in the center of the board as the path origin

**Rationale:** Players need a clear starting point to build from. A central origin gives equal opportunity to build in any direction and establishes the initial path for adjacency rules.

---

### REQ-POE-003: Draw Forced Card

WHEN a player begins their turn
THE SYSTEM SHALL automatically draw one random tile card and display it prominently to the player

**Rationale:** The forced draw creates the core tension - players must work with what they're given rather than always choosing optimal tiles. This constraint makes successful placement more meaningful.

---

### REQ-POE-004: Place Forced Card

WHEN a player receives a forced card
THE SYSTEM SHALL allow placement only on grid positions orthogonally adjacent to existing path tiles

WHEN the forced card is placed in a valid position
THE SYSTEM SHALL add it to the board, update the path, and proceed to the optional card phase

**Rationale:** Players need clear rules for valid placement. Requiring adjacency ensures the path grows organically and remains connected, creating the spatial puzzle challenge.

---

### REQ-POE-005: Handle Invalid Forced Placement

WHEN no valid adjacent positions exist for the forced card
THE SYSTEM SHALL trigger erosion by removing the most recently placed tile from the path

WHEN erosion creates disconnected path segments
THE SYSTEM SHALL continue removing tiles from endpoints until the path is continuous again

**Rationale:** Players need consequences for poor planning that feel meditative rather than punishing. Visual erosion reminds players that attachments are temporary and encourages more thoughtful future planning.

---

### REQ-POE-006: Offer Optional Card

WHEN the forced card phase completes (placement or erosion)
THE SYSTEM SHALL draw and display a second optional card with clear "Place" and "Skip" choices

**Rationale:** Players need agency within constraints. The optional card provides strategic flexibility - players can extend their path opportunistically or exercise restraint to avoid future problems.

---

### REQ-POE-007: Skip Optional Card

WHEN a player chooses to skip the optional card
THE SYSTEM SHALL discard the optional card and end the turn without placing it

**Rationale:** Players want control over risk. Skipping lets players avoid dangerous placements that might cause erosion next turn, supporting a minimalist strategy.

---

### REQ-POE-008: Place Optional Card

WHEN a player chooses to place the optional card
THE SYSTEM SHALL allow placement following the same adjacency rules as forced cards

WHEN the optional card is placed successfully
THE SYSTEM SHALL add it to the board and end the turn

**Rationale:** Players need consistent placement rules. Allowing optional cards to be placed anywhere valid (not forced like the first card) gives players creative freedom to shape their path.

---

### REQ-POE-009: Display Turn Counter

WHEN any game action occurs
THE SYSTEM SHALL display the current turn number prominently

**Rationale:** Players want to track their progress and know how long they've been playing. Turn count helps players decide when to end their session and provides a metric for comparing different games.

---

### REQ-POE-010: Display Score

WHEN any tile is placed or removed
THE SYSTEM SHALL update and display the current score in real-time

**Rationale:** Players want immediate feedback on their progress. Real-time scoring makes each placement feel meaningful and helps players understand which actions increase their score.

---

### REQ-POE-011: Calculate Base Score

WHEN a tile is successfully placed
THE SYSTEM SHALL award 1 point to the score

**Rationale:** Players need a simple, understandable base scoring system. One point per tile makes score directly reflect path length, rewarding successful growth.

---

### REQ-POE-012: Start New Game

WHEN a player initiates a new game
THE SYSTEM SHALL reset the board, score, turn counter, and deck to initial state

**Rationale:** Players want to start fresh without reloading the page. Easy restarts encourage experimentation and multiple play sessions.

---

### REQ-POE-013: Display Hazard Tiles

WHEN hazard tiles are present on the board
THE SYSTEM SHALL display them visually distinct from path tiles

**Rationale:** Players need to immediately identify obstacles to understand placement constraints. Clear visual distinction helps players plan around hazards.

---

### REQ-POE-014: Block Placement Adjacent to Hazards

WHEN a hazard tile occupies a grid position
THE SYSTEM SHALL prevent path tiles from being placed in that position

**Rationale:** Players need hazards to create meaningful constraints. Blocking tiles forces players to route paths around obstacles, creating more interesting patterns.

---

### REQ-POE-015: Use Deterministic Card Deck

WHEN a game starts with a specific seed value
THE SYSTEM SHALL generate the same sequence of cards for that seed

**Rationale:** Players can replay challenging scenarios or share interesting game seeds with others. Deterministic generation enables fair comparison between different strategies.

---

### REQ-POE-016: Show Visual Terrain Types

WHEN displaying path tiles
THE SYSTEM SHALL show each tile's terrain type (Forest, Grassland, Water, Stone) with distinct visual styling

**Rationale:** Players want visual variety and the ability to create aesthetically pleasing paths. Terrain types make the board more interesting to look at and enable future scoring bonuses.

---

### REQ-POE-017: Show Tile Types

WHEN displaying tiles
THE SYSTEM SHALL render different tile shapes (Straight, Corner, Fork, Terminus) based on tile type

**Rationale:** Players need to understand how tiles connect to plan path extensions. Different shapes create visual interest and affect adjacency possibilities.

---

### REQ-POE-018: Handle Click Placement

WHEN a player clicks a valid grid position during placement phase
THE SYSTEM SHALL place the current card at that position

WHEN a player clicks an invalid grid position
THE SYSTEM SHALL provide no action (invalid positions are not clickable)

**Rationale:** Players need intuitive interaction. Click-to-place is familiar and precise for grid-based games. Preventing invalid clicks avoids frustration from accidental mistakes.

---

### REQ-POE-019: Maintain Path Connectivity

WHEN evaluating erosion or placement
THE SYSTEM SHALL ensure all path tiles form a single connected group

WHEN tiles become disconnected
THE SYSTEM SHALL remove tiles until connectivity is restored

**Rationale:** Players need a clear rule for valid paths. A connected path feels cohesive and prevents confusing scattered tile groups.

---

### REQ-POE-020: Preserve Game State Validity

WHEN any game action completes (placement, erosion, skip)
THE SYSTEM SHALL maintain valid game state with consistent tile positions and scores

**Rationale:** Players expect the game to work correctly. State consistency prevents bugs and ensures fair scoring.

---
