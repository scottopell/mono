# Path of Erosion - Game Design Document

## Overview
A zen-vibed tile-placement puzzle game where players build a winding path through wilderness using a constrained draw system. The core tension: forced card placement vs optional escape hatch. When you can't play the forced card, your path literally erodes away.

---

## Core Loop

### Turn Structure
Each turn follows this sequence:

1. **Draw Forced Card** - Receive one random tile
2. **Attempt Placement** - Must place adjacent to existing path
   - Valid adjacent means: orthogonally next to any path tile (including endpoints and forks)
   - Path tiles can connect to other path tiles even at non-endpoints (enabling forks)
3. **Erosion Check** - If placement is impossible:
   - Remove the last-placed tile from your path
   - If path becomes disconnected, keep removing from endpoints until it's continuous again
   - Forced card is discarded (not placed)
4. **Optional Card Offer** - Player decides to accept or skip
   - If accepted: place it like the forced card (but can be placed anywhere valid)
   - If skipped: it's discarded and turn ends
5. **Score Update** - Visual feedback of current score components

---

## Tile Types

### Path Tiles
- **Straight**: Simple connector (I shape)
- **Corner**: Changes direction 90° (L shape)
- **Fork**: Creates a junction where the path can split multiple directions (T or + shape)
- **Terminus**: Dead-end tile (looks like a clearing or destination)

Each path tile also has a **terrain type**:
- Forest (green)
- Grassland (gold)
- Water (blue)
- Stone (gray)

### Obstacle Tiles
These block further path extension in that direction, forcing forks elsewhere:
- **Rock** - Hard obstacle, completely blocks
- **Thorns** - Spiky vegetation blocks
- **Cliff Edge** - Impassable boundary
- **Deep Water** - Impassable water

When an obstacle is adjacent to a path endpoint, the next path tile *must* fork perpendicular (can't extend straight). If no perpendicular space is available, erosion triggers.

---

## Placement Rules

**Valid Placement:**
- Tile must be orthogonally adjacent to at least one existing path tile
- Terrain matching is optional but encouraged (same terrain = bonus points)
- Multiple branches can share adjacency (forks naturally emerge)

**Invalid Placement / Triggers Erosion:**
- No valid adjacent spaces available to path
- Board boundary reached (if board is bounded)
- All adjacent spaces occupied by non-path tiles

**Forking Mechanic:**
- A path tile placed perpendicular to an existing path creates a fork
- Both directions remain active and can be extended from
- Players score bonus points for coherent regions (all connected tiles of same terrain)

---

## Game Session

### Starting State
- Empty canvas (infinite or very large grid)
- One starting tile placed in center (neutral stone, marks origin)
- Player facing their first forced card draw

### Session Length
- **Target**: 20-30 card draws (roughly 10-15 minutes of play)
- **End Condition**: Player initiates end of session (no hard failure state)
- Could add optional "challenge modes" with specific targets later

### Canvas
- **Web version**: 800x600 pixel viewport with panning/zoom
- **Infinite scroll**: Can build in any direction
- **Visual grid**: Subtle grid lines to show tile positions (snapping)

---

## Erosion System

The core punishment for being forced into dead zones:

**How It Works:**
1. When forced card cannot be placed, do NOT place it
2. Remove the most recently placed tile from the path
3. If this creates disconnection, keep removing tiles from *endpoints only* until path is continuous again
4. Card draw count still increments (you've used up your turn's draw)

**Feel:**
- Visual animation of tiles fading/crumbling away
- Path visibly retracts like it's being reclaimed by wilderness
- Zen moment: losing your work creates poignancy, makes you more thoughtful

**Strategic Consequence:**
- Leads to risk/reward around optional cards: "Do I take this optional card even though it might brick me next turn?"
- Encourages forward planning: think 2-3 draws ahead

---

## Scoring (Zen Model)

No "winning" or "losing"—just degrees of elegance. Score is shown continuously:

### Points Awarded
- **Base**: 1 point per tile placed (never eroded)
- **Terrain Coherence**: Bonus points for large connected regions of same terrain
  - 3 adjacent same-terrain tiles: +2 bonus
  - 5 adjacent same-terrain tiles: +5 bonus
  - 8+ adjacent same-terrain tiles: +10 bonus
- **Forking Efficiency**: Bonus for paths with multiple branches
  - Each fork that creates 3+ extensions: +3 bonus
  - Encourages interesting, organic-looking paths
- **Optional Card Restraint**:
  - Each optional card skipped: +1 bonus (purity/minimalism)
  - Encourages elegant simplicity

### Final Score Breakdown
At session end, show:
- Total tiles placed
- Terrain coherence score
- Branching score
- Optional card restraint bonus
- **Total Score**

Scores are personal/meditative (no leaderboard in base game).

---

## Visual Design

### Aesthetic
- Minimalist, soft colors
- Subtle shadows/highlights (3D-lite effect)
- Calm background (muted forest/nature imagery)
- Smooth animations (1-2 seconds per action)
- Soothing sound design (ambient + soft tile-place SFX)

### Information Display
- **Top**: Current round count ("Draw 5 of 25")
- **Top-Right**: Current score (updated live)
- **Center-Canvas**: Path grows organically
- **Card Display**:
  - Forced card shown prominently in red/orange border
  - Optional card shown in blue/neutral border
  - Clear "SKIP" button for optional
- **Undo Hint**: Small text "path eroding..." when erosion triggers

---

## Hazard Integration

Hazards appear randomly in the deck (roughly 30% of all draws):

**Distribution:**
- Path tiles: 60%
- Hazard tiles: 30%
- Terrain-shifting tiles (change terrain type of region): 10%

**Hazard Placement Rules:**
- Placed orthogonally adjacent to path (doesn't connect TO path, blocks PAST it)
- Next path tile must fork perpendicular
- Creates natural maze-like wandering

**Example Flow:**
```
Turn 1: Place straight path (north-south)
Turn 2: Draw rock hazard → place it to the east
Turn 3: Draw straight path → must place north or south (can't go east past rock)
Turn 4: Player creates fork, path can now go in two directions
```

---

## Game Feel (Zen Principles)

1. **No Failure** - You can always keep playing, erosion is consequence not punishment
2. **Flow** - Quick decision-making (forced card is immediate, optional is 5-sec choice)
3. **Growth** - Building something gradually feels rewarding
4. **Impermanence** - Erosion reminds you: attachments are temporary
5. **Emergence** - Simple rules create complex, beautiful paths
6. **Agency** - Optional card lets you steer despite constraints

---

## Prototype Priorities

### Phase 1 (Playable Core)
- [ ] Grid-based canvas
- [ ] Draw system (forced + optional)
- [ ] Path tile placement (orthogonal adjacency)
- [ ] Erosion system (works, even if not pretty)
- [ ] Score tracking (basic tile count)

### Phase 2 (Mechanics Polish)
- [ ] Hazard tiles block extensions
- [ ] Fork detection and bonus scoring
- [ ] Terrain coherence bonus calculation
- [ ] Optional card restraint bonus

### Phase 3 (Visual Polish)
- [ ] Tile graphics (colors, terrain types)
- [ ] Animations (placement, erosion, score pop-ups)
- [ ] Background and UI polish
- [ ] Sound design

### Phase 4 (Refinement)
- [ ] Game balance (difficulty curve, hazard frequency)
- [ ] Undo/mistakes recovery
- [ ] Accessibility (color-blind mode, keyboard/touch support)
- [ ] Extended session options

---

## Open Questions for Iteration

1. **Board Size**: Fixed 20x20? Infinite? Grows with path?
2. **Draw Limit**: Stop at 30 or let player decide?
3. **Hazard Frequency**: Too many makes game frustrating, too few is boring
4. **Obstacle Shape**: Hazards take 1 tile or multiple?
5. **Co-op/Sharing**: Eventually share paths with friends?

