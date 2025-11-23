# Bug Report: Paths of Erosion Game Logic Issues

## 🐛 Critical Bugs Found

### **BUG #1: Missing START Tile** ⚠️ CRITICAL

**GAME.md Spec (Line 76):**
> "One starting tile placed in center (neutral stone, marks origin)"

**Current Implementation (`game.rs:31-48`):**
```rust
pub fn new(width: i32, height: i32, seed: u64) -> Self {
    let board = Board::new(width, height);  // ← Empty board!
    // ... no START tile placement
}
```

**Impact:**
- Game starts with completely empty board
- First placement can be anywhere (violates design)
- No visual origin point

**Fix Required:**
```rust
pub fn new(width: i32, height: i32, seed: u64) -> Self {
    let mut board = Board::new(width, height);
    let center = Position::new(width / 2, height / 2);
    board.place_tile(center, TileType::START, 0);  // ← Add this
    // ...
}
```

---

### **BUG #2: Direction Calculation is BACKWARDS** ⚠️ CRITICAL

**Location:** `types.rs:38-49` - `Position::direction_to()`

**The Bug:**
```rust
pub fn direction_to(&self, other: Position) -> Option<Direction> {
    if self.x == other.x && self.y == other.y - 1 {
        Some(Direction::North)  // ← WRONG!
    } else if self.x == other.x && self.y == other.y + 1 {
        Some(Direction::South)  // ← WRONG!
```

**Analysis:**
- If `self.y == other.y - 1`, then `other.y == self.y + 1`
- This means `other` is BELOW `self` (higher y value)
- To reach `other` from `self`, we move DOWN (South), NOT North!

**Coordinate System:**
```rust
// From types.rs:205-206
Direction::North => Position { y: self.y - 1 }  // North = y decreases
Direction::South => Position { y: self.y + 1 }  // South = y increases
```
Screen coordinates: y=0 at top, increases downward

**Proof of Bug:**
```
Position A = (5, 5)
Position B = (5, 6)  ← Below A (larger y)

A.direction_to(B):
  self.y (5) == other.y - 1 (6-1=5)? YES
  Returns: Direction::North ← WRONG! Should be South!

Expected: Going from (5,5) to (5,6) is moving DOWN → South
Actual: Returns North (opposite direction!)
```

**Impact:**
- **Connection validation is COMPLETELY BROKEN**
- Tiles are validated with inverted directions
- This explains why my gameplay violated connection rules!
- Example: My CORNER_NW (connects N+W) could place tile to SOUTH

**Fix Required:**
```rust
pub fn direction_to(&self, other: Position) -> Option<Direction> {
    if self.x == other.x && self.y == other.y - 1 {
        Some(Direction::South)  // ← Swap these
    } else if self.x == other.x && self.y == other.y + 1 {
        Some(Direction::North)  // ← Swap these
    } else if self.x == other.x + 1 && self.y == other.y {
        Some(Direction::West)   // ← Swap these
    } else if self.x == other.x - 1 && self.y == other.y {
        Some(Direction::East)   // ← Swap these
    } else {
        None
    }
}
```

**Validation Logic Affected:**
```rust
// validation.rs:56-67
let connections_ok = adjacent_occupied.iter().all(|&adj_pos| {
    if let (Some(direction), Some(adjacent_tile)) =
        (position.direction_to(adj_pos), board.get_tile(adj_pos)) {
        // ↑ This direction is BACKWARDS!
        let we_connect = tile_type.has_connection(direction);
        let they_connect = adjacent_tile.tile_type.has_connection(direction.opposite());
        // ↑ All connection checks are inverted!
```

---

### **BUG #3: Hazard Blocking Rules Not Implemented**

**GAME.md Spec (Line 49):**
> "When an obstacle is adjacent to a path endpoint, the next path tile *must* fork perpendicular"

**Current Implementation:**
- Hazards only block placement at their position
- No perpendicular forcing logic exists
- `validation.rs` only checks `hazards.is_hazard(position)`

**Impact:**
- Hazards don't create the strategic constraints described in GAME.md
- Game is easier than intended

**Status:** Lower priority (game is still playable)

---

## 🧪 How These Bugs Affected My Gameplay

### What I Observed:
```
Turn 0: Placed CORNER_NW (┘) at (5,5)
  Connects: North, West

Turn 1: Placed T_W (┬) at (5,6) - SOUTH of (5,5)
  Connects: West, North, South

Expected: INVALID (CORNER_NW doesn't connect South)
Actual: ACCEPTED ✓
```

### Why It Was Accepted (Bug Analysis):
```rust
// validation.rs checks:
position = (5,6)
adjacent = (5,5) with CORNER_NW

// Calculate direction
direction = position.direction_to(adjacent)
          = (5,6).direction_to((5,5))
          = Direction::North  ← BUG! Should be South

// Check connections
we_connect = T_W.has_connection(North)?
           = YES ✓  (T_W connects N+W+S)

they_connect = CORNER_NW.has_connection(North.opposite())?
             = CORNER_NW.has_connection(South)?
             = NO ✗

But the validation uses INVERTED direction:
  actual_check = CORNER_NW.has_connection(North)?
               = YES ✓ (CORNER_NW connects N+W)

Result: Validation passes despite being geometrically invalid!
```

---

## ✅ Verification Test Cases

After fixing Bug #2, these should FAIL validation:

```rust
#[test]
fn test_invalid_connection() {
    let mut board = Board::new(10, 10);
    let hazards = Hazards::generate(0, Position::new(5, 5), None, 10, 10, 0);

    // Place CORNER_NW at (5,5) - connects North and West
    board.place_tile(Position::new(5, 5), TileType::CornerNW, 0);

    // Try to place vertical tile SOUTH (should fail - no South connection)
    let result = validate_placement(
        &board,
        &hazards,
        Position::new(5, 6),  // South of corner
        TileType::StraightNS
    );

    assert_eq!(result, Err(PlacementError::InvalidConnection));
}
```

---

## 📊 Priority Assessment

| Bug | Severity | Impact | Fix Complexity |
|-----|----------|--------|----------------|
| #1: Missing START | HIGH | Game doesn't match spec | EASY (1 line) |
| #2: Inverted Directions | CRITICAL | Breaks all connection validation | EASY (4 lines) |
| #3: Hazard Forcing | MEDIUM | Missing game mechanic | COMPLEX |

---

## 🔧 Recommended Fix Order

1. **Fix Bug #2 FIRST** - Direction inversion breaks core gameplay
2. **Fix Bug #1 SECOND** - Add START tile to match spec
3. **Re-run ALL tests** - Validation tests may need updates
4. **Fix Bug #3 later** - Enhancement, not blocker

---

## 🎯 Testing After Fixes

Run these commands to verify:
```bash
# Should show START tile at center
echo '{"action":"new_game","width":10,"height":10,"seed":42}' | cargo run --bin erosion | jq '.new_state.board.tiles'

# Should see only valid connected placements
cargo test --lib validation
```
