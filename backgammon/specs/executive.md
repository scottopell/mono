# Backgammon — Two-Phone Unified Board — Executive Summary

## Requirements Summary

Two people want to play backgammon together, holding their phones
long-edges-touching so the two screens *are* the board — one continuous
surface spanning two devices. Sitting on opposite sides, each player sees
their own half of the board right-side-up from their seat and can tap any
point on the entire board, including points rendered on the other phone.

To play: roll dice to start your turn; tap a die to see every move it
enables; tap a destination to commit a sub-move; tap an already-moved
checker to undo; pick up the dice to end the turn. Dice use a commit-reveal
protocol so neither phone alone can bias the rolls. A bear-off strip
appears on your home quadrant once all 15 of your checkers are home.

**Value proposition:** Feels like a physical board, not a split-screen
multiplayer game. Pairing is unchanged from the previous version — scan a
code, start playing.

**Scope:** Full single-game backgammon with bar, bear-off, hitting,
doubles, opening roll, and the mandatory-use rule. **Out of scope:**
doubling cube, match play, any change to pairing / WebRTC transport.

## Technical Summary

Two phones carry full symmetric replicas of game state. The board is
rendered in a single **shared world coordinate system**; each phone shows
its half as a viewport crop. Board graphics (points, checkers, dice,
bar, highlights, bear-off strip) have no per-phone flip — the two phones
physically arranged opposite each other show each player their own half
right-side-up naturally. Only text chrome (player names, turn indicator,
pickup button) is rendered per-phone in local coordinates, rotated 180°
on the top phone so it reads for the sitter across the table.

**Turn bookends are physical gestures:** rolling dice starts the turn,
picking up dice ends it. Between bookends, move loop is die-first:
tap die → highlights → tap destination → move. Source is inferred from
die + destination because direction of play is fixed. Tap an
already-moved checker to undo. Pickup enforces the mandatory-use rule
via a brute-force search for longer legal sequences.

**Networking:** the existing WebRTC data channel carries three new
message classes — tap-forwarding (passive phone's local taps forward to
active in world coordinates), intra-turn live updates (in-progress board
to the passive phone), and commit broadcasts (full state on dice
pickup). Commit-reveal dice protocol layers on top: each phone commits a
hash, reveals the preimage, and dice are derived from XOR + HMAC of both
secrets. Mismatch aborts the session.

**Authority:** only the active player's phone mutates committed state.
Passive phone is display-only and forwards taps for the active phone to
interpret. This splits "which phone mutates state" from "which points a
tap can reach" — taps span both phones, mutations are single-writer.

## Status Summary

| Requirement | Status | Notes |
|-------------|--------|-------|
| **REQ-UB-001:** Two Phones Form One Continuous Board | 🔄 In Progress | `board.js` rewritten for shared world coords + role-based viewport crop |
| **REQ-UB-002:** See Your Own Half Right-Side-Up From Your Seat | 🔄 In Progress | No per-player flip on board surface; player sees their half correctly by physical seating |
| **REQ-UB-003:** Read Player-Facing Text From Your Seat | 🔄 In Progress | DOM chrome rotated 180° on top phone via CSS |
| **REQ-UB-004:** Roll Dice to Start Your Turn | 🔄 In Progress | Active-player roll button in chrome; dice render on active player's home quadrant |
| **REQ-UB-005:** Dice Values Agreed By Both Phones | 🔄 In Progress | Commit-reveal protocol in `dice.js`; SHA-256 commitments; HMAC-SHA-256 combine |
| **REQ-UB-006:** Tap a Die to See Your Options | 🔄 In Progress | Selected die → legal source + destination highlights in world coords on both phones |
| **REQ-UB-007:** Tap a Destination to Move | 🔄 In Progress | Die + destination uniquely determines source; direct-tap with no die selection legal if unambiguous |
| **REQ-UB-008:** Undo a Sub-Move Before Picking Up | 🔄 In Progress | `moveHistory` in state; `undoLastMove` inverts last entry |
| **REQ-UB-009:** Pick Up Dice to End Your Turn | 🔄 In Progress | Pickup control in chrome; `canEndTurn` enforces mandatory-use rule via brute-force search |
| **REQ-UB-010:** Tap Across the Seam | 🔄 In Progress | Passive phone forwards local taps as `{ type: 'tap', x, y }` in world coords |
| **REQ-UB-011:** Watch Your Opponent Move in Real Time | 🔄 In Progress | Live intra-turn broadcasts of working state (board + history) from active → passive |
| **REQ-UB-012:** Enter From the Bar Before Anything Else | 🔄 In Progress | Existing bar logic in rules engine preserved; die-first selection highlights bar-entry target |
| **REQ-UB-013:** Bear Off From Your Home Quadrant | 🔄 In Progress | Bear-off strip along outer short edge of home quadrant; standard overshoot rule |
| **REQ-UB-014:** Opening Roll Decides First Turn | 🔄 In Progress | Each phone runs commit-reveal for one die; higher roller acts first with both values |
| **REQ-UB-015:** Declare a Winner | 🔄 In Progress | Winner banner + New Game control, broadcast on commit |
| **REQ-UB-016:** Create and Join a Room (Inherited) | ✅ Complete | Existing pairing in `peer.js` unchanged |

**Progress:** 1 of 16 complete (pairing inherited from prior version)

**Known gaps:**

- The prior mirrored-board design (REQ-BG-001 through REQ-BG-012) is
  superseded by this design. Git history preserves the prior
  requirements; only REQ-BG-001 / REQ-BG-002 (pairing) survive unchanged
  as REQ-UB-016.
- Higher-die-must-be-used-when-only-one-playable corner case: `canEndTurn`
  enforces the general mandatory-use rule (can't pick up if more dice
  could have been used), which covers this as a subcase.
- Animations beyond snap-to-position are deferred to a later pass.
