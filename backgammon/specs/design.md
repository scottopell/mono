# Backgammon — Two-Phone Unified Board — Technical Design

## Architecture Overview

Static site, no build step. Two phones connect via the existing WebRTC data
channel (peer.js, unchanged in structure — only the message protocol is
extended). The two phones together render **one backgammon board**: a shared
world coordinate system; each phone shows its half as a viewport crop.

```
          ┌──────────────── world ────────────────┐
world     │  13 14 15 16 17 18 | 19 20 21 22 23 24│  ← top phone viewport
          │                    |                   │     (points 13–24)
          ├──────── seam (where phones touch) ────┤
world     │  12 11 10  9  8  7 |  6  5  4  3  2  1│  ← bottom phone viewport
          │                    |                   │     (points 1–12)
          └───────────────────────────────────────┘

Each phone draws ONLY its half in shared coordinates. Chrome (text) is drawn
in each phone's LOCAL frame and oriented for its sitter. On the top phone,
chrome is rotated 180° so it reads correctly for the player sitting there.
```

### Core invariant

**The two phones are one flat board.** You could swap in a same-dimension
physical board and each player's experience would be identical. This drives
every choice: no per-player view transform on board graphics; shared world
coordinates for points, checkers, dice-on-board, bar, highlights, bear-off
strip. Only text chrome is rendered in each phone's local frame.

### Authority model

- **Both phones carry full game state.** Symmetric replicas, not host/guest
  mirrors.
- **Only the active player's phone mutates committed state.** Passive phone
  is display-only during the opponent's turn.
- **Commit on dice pickup:** Active phone broadcasts the full state snapshot
  when the active player picks up their dice. This is the hard sync point.
- **Intra-turn updates:** Active phone broadcasts lightweight display-only
  updates (working board, selected die, highlights) during the turn so the
  passive phone can follow along. These do not represent committed state.
- **Tap forwarding:** Every tap on the passive phone's surface is forwarded
  to the active phone as a world-coordinate event. The passive phone never
  interprets taps itself.

---

## File Layout

```
backgammon/
├── index.html              # Two stacked canvas sections + chrome overlay
├── style.css
├── config.example.js       # TURN credentials template (unchanged)
├── rules.js                # Pure game state + legal moves + move history
├── board.js                # Shared-world rendering + per-role viewport crop
├── dice.js                 # Commit-reveal dice protocol
├── peer.js                 # PeerJS wrapper (unchanged connection flow,
│                             extended message types)
├── main.js                 # Role negotiation, move loop, tap forwarding,
│                             intra-turn sync
└── specs/
    ├── requirements.md
    ├── design.md
    └── executive.md
```

---

## State Model

```js
{
  board: Array(24),            // positive = p1, negative = p2; 0 = empty
  bar: { p1: 0, p2: 0 },
  borneOff: { p1: 0, p2: 0 },
  dice: [null, null],          // committed dice for this turn
  diceRemaining: [],           // die values still available to play
  turn: "p1" | "p2",
  phase: "opening" | "roll" | "move" | "gameover",
  winner: null | "p1" | "p2",
  rollSeq: 0,                  // increments per roll; drives animation
  moveHistory: [],             // sub-moves made this turn (for undo)
  openingRolls: { p1: null, p2: null }  // used only during 'opening'
}
```

### Index convention

Unchanged from the mirrored design — indices 0–23 are fixed across both
phones. P1 moves decreasing index (home = 0–5); P2 moves increasing index
(home = 18–23).

### `moveHistory` entry shape

Each entry captures enough to invert the move:

```js
{ from, to, die, hit }
// from: 0..23 or 'bar'
// to:   0..23 or 'off'
// die:  number
// hit:  boolean — true if this move sent an opponent checker to the bar
```

Undo pops the last entry, reverses it, and pushes the die back into
`diceRemaining`.

### Role assignment

Roles are **board halves**, not player identities:

```
role ∈ { 'bottom', 'top' }
```

The bottom-phone player's `player` identity (p1 or p2) follows backgammon
convention: whichever player has their home in the bottom half of the world.
In our world, p1's home (indices 0–5) lives in the bottom half and p1 bears
off at the lower-right. So **bottom phone = p1**, **top phone = p2**, always.
This is a cosmetic choice — the rules engine is player-symmetric.

---

## Rules Engine (`rules.js`)

Pure functions. Exposes:

```
initialState()                  → state (phase: 'opening')
applyOpeningRoll(state, p, v)   → state' with opening roll recorded;
                                  may transition to 'move' with dice set
                                  once both rolls in
startRoll(state, dice)          → state' with given dice, phase 'move',
                                  doubles expanded, rollSeq++
legalMovesFrom(state, from)     → [{ to, die }]
applyMove(state, move)          → state' (appends to moveHistory, does NOT
                                  auto-end turn)
undoLastMove(state)             → state' or null if no history
canEndTurn(state)               → boolean (implements pickup gate)
endTurn(state)                  → state' with turn flipped, phase 'roll',
                                  history cleared
checkWinner(state)              → null | 'p1' | 'p2'
```

### Key differences from the old engine

- **`applyMove` no longer auto-ends the turn.** The old engine would call
  `endTurn` when `diceRemaining` emptied or no legal moves remained. The new
  engine always returns control to the caller, who decides when to pick up.
- **`moveHistory` enables undo.** Each `applyMove` appends; `undoLastMove`
  pops and reverses.
- **`canEndTurn` implements the mandatory-use rule.** Returns false when a
  different legal sub-move sequence could have used more dice than the
  player has actually used. The brute-force search is cheap — at most four
  dice, at most 24 checker sources.
- **Dice values are provided externally.** `startRoll(state, [d1, d2])`
  accepts the dice from the commit-reveal layer rather than rolling them
  internally. This keeps rules pure and lets tests inject deterministic
  dice.

### Pickup-gate algorithm (`canEndTurn`)

```
function maxPlayable(state):
  if no legal move: return 0
  best = 0
  for each legal move m:
    s' = applyMove(state, m)
    best = max(best, 1 + maxPlayable(s'))
  return best

canEndTurn(state) = moveHistory.length >= maxPlayable(stateAtTurnStart)
```

`stateAtTurnStart` is reconstructed by undoing all moves in history, or
equivalently memoized when the turn starts.

---

## Rendering (`board.js`)

### World coordinate system

Board world is a rectangle. Origin at top-left of the world. Width × Height
arbitrary — CSS sizes the canvas, board.js scales into it. For simplicity:

```
world = { width: W, height: H }
H = 2 * halfH
bottom half (world y in [halfH, H]) holds points 1–12 (indices 0–11)
top half    (world y in [0, halfH])  holds points 13–24 (indices 12–23)
seam at y = halfH
```

Within each half, points are arranged left-to-right in the standard
backgammon layout: outer board, bar, home board. The bar is a vertical
strip at the world's horizontal middle; the bear-off tray sits beyond the
home board's outer edge.

### Point-to-world mapping

Each of the 24 points maps to an anchor in world coordinates:

```
pointAnchor(idx)
  -> { x, y, tipY, half: 'top'|'bottom' }
```

Standard convention: point 1 (index 0) is p1's ace, bottom-right of the
board. Point 24 (index 23) is p1's 24-point, top-right. Our world mirrors
that layout.

### Viewport crop

`renderBoard(ctx, state, role, uiState)` draws only its half:

- `role === 'bottom'`: world's bottom half (y in [halfH, H]) mapped to the
  full canvas.
- `role === 'top'`: world's top half (y in [0, halfH]) mapped to the full
  canvas.

Because points, checkers, highlights, and dice are all drawn from world
coordinates, no per-phone board flip is needed — each phone just clips to
its half.

### Chrome orientation

Chrome (player names, pip counts, turn indicator, unusable-die labels,
pickup prompt) is **not** on the canvas. It's HTML DOM overlaid on the
viewport, positioned on the outer long edge:

- **Bottom phone:** chrome on the bottom edge of the screen (far from the
  seam). Text reads in the device's natural orientation.
- **Top phone:** chrome on the top edge of the screen (far from the seam).
  Text is `transform: rotate(180deg)` so it reads correctly for the sitter
  across the table.

Using DOM for chrome keeps rotation trivial (one CSS transform) and gives
us ordinary text rendering + tap targets for the pickup button.

### Dice rendering

Dice render on the active player's home quadrant in **shared world
coordinates** — both phones draw them if the quadrant straddles the seam,
or only one phone draws them if they sit entirely within that phone's half.
Since the home quadrant of each player sits entirely within one half, only
that phone actually draws them. But both phones compute the same world
position, which is what matters.

Dice are **only interactive** (receive tap events and change selection) on
the active player's phone. Cross-phone tap forwarding means a passive-phone
tap on dice is forwarded and ignored (not active → reject).

### Bear-off strip

When the active player's 15 checkers are all in their home quadrant, the
bear-off strip renders along the outer short edge of that quadrant. In
world coordinates, this is the vertical strip beyond the home board, on
the active player's side (right for p1, right for p2 — standard). It
renders on the phone that owns that half only.

### Hit-testing

`hitTest(x, y, role)` converts a device-local (canvas pixel) tap into a
world-coordinate target:

```
hitTest returns one of:
  { kind: 'point', idx: 0..23 }
  { kind: 'bar' }
  { kind: 'bearOff' }
  { kind: 'die', index: 0..3 }      // which die was tapped
  { kind: 'world', x, y }            // for forwarding — raw world coords
  null
```

Each phone's hit test covers its half only. A tap that falls in the
viewport is first resolved against interactive targets (points, bar, dice,
bear-off strip). A tap that doesn't resolve to a known target is forwarded
as raw world coords to the active phone, which re-runs its own hit test
in world space.

---

## Commit-Reveal Dice (`dice.js`)

Goal: neither phone can bias the dice, and any tampering is detectable.

### Protocol

For each roll (opening-roll-one-die or turn-roll-two-dice):

1. **Generate secret.** Each phone picks a 256-bit random secret + 128-bit
   salt.
2. **Commit.** Each phone sends `commit = SHA-256(secret || salt)` to the
   other. Until both commits are in, no reveal happens.
3. **Reveal.** Each phone sends `(secret, salt)` once it has received the
   other's commit.
4. **Verify.** Each phone checks the other's `SHA-256(secret || salt) ===
   commit`. Mismatch → session ends with a cheating signal (REQ-UB-005).
5. **Combine.** `combined = secret_bottom XOR secret_top`. Pass through
   `HMAC-SHA-256(combined, "roll:" || turnCounter || ":" || purpose)` for
   domain separation.
6. **Derive.** Take successive bytes of the HMAC output mod 6, add 1. Each
   byte gives one die value. Opening roll needs one value per side (each
   side runs the protocol independently for their own die); turn roll
   needs two; doubles expand to four uses after derivation, no extra
   protocol step.

### State machine

```
idle ──roll-requested──▶ committed ──both-commits-received──▶ revealed
                                                                   │
                                                          verify ok│verify-fail
                                                                   ▼
                                                                 done / aborted
```

### Storage

`dice.js` holds per-roll state in a small in-memory object. No persistence
— a mid-roll disconnect aborts the roll and falls back to "pick up the
dice, start a new turn" handling.

### Fallback for solo / local mode

Local hotseat (single device, for debugging) skips the protocol entirely
and just calls `Math.random()`. This path is explicit — guarded by
`role === 'local'` — not an automatic degradation.

---

## Peer Messaging (`peer.js`)

Connection flow is unchanged (host creates room with code; guest joins by
code). The existing `send` / `onData` plumbing carries the new message
types.

### Message envelope types

```
// Role announce (first message each phone sends after connection opens)
{ type: 'hello', role: 'bottom' | 'top' }

// Tap forwarded from passive to active (world coordinates)
{ type: 'tap', x: number, y: number }

// Intra-turn update — active phone → passive phone
{ type: 'live', state: <partial snapshot>, selectedDie: 0..3 | null }

// Commit-reveal
{ type: 'diceCommit', commit: <hex>, purpose: 'opening' | 'turn', turn: n }
{ type: 'diceReveal', secret: <hex>, salt: <hex>, purpose, turn }

// Commit — active phone → passive phone, on dice pickup
{ type: 'commit', state: <full snapshot> }

// Session control
{ type: 'abort', reason: string }
```

`<partial snapshot>` for intra-turn updates includes `board`, `bar`,
`borneOff`, `diceRemaining`, `moveHistory`. It does **not** include
`turn` or `phase` — those only change at commit.

`<full snapshot>` at commit includes everything in the state model.

### Role negotiation

Both phones send `hello` after the connection opens. If both claim the
same role, the host wins (its role stands); guest re-claims the other.
Host defaults to `bottom`, guest defaults to `top`. First-boot conflict
is vanishingly rare — the default roles don't collide.

---

## UI Wiring (`main.js`)

### Screen state

```
mode ∈ { 'lobby', 'waiting', 'opening-roll', 'playing', 'gameover' }
```

### Turn flow

```
opening-roll phase
  - both phones run commit-reveal for one die each
  - higher-roller's phone becomes active, uses both values as first turn
  - equal values → re-roll

playing phase — active player
  1. tap 'Roll' button (in chrome) → commit-reveal protocol for two dice
  2. dice land, phase → move
  3. tap die → highlights; tap destination → applyMove (local) + live broadcast
  4. tap moved checker → undoLastMove (local) + live broadcast
  5. repeat 3–4 until done
  6. tap 'Pick up dice' button (in chrome) → canEndTurn gate → endTurn +
     commit broadcast → both phones update committed state → turn passes

playing phase — passive player
  - receives live updates, renders in-progress board
  - local taps forwarded to active as { type: 'tap', x, y } in world coords
  - active phone ignores forwarded taps that would violate turn authority
    (extra safety; passive phone also knows not to act locally)
```

### Tap pipeline

Every pointer event on the passive phone:

```
device (x, y) → canvas-local → world-coord conversion (via role's viewport)
              → if on the device's own half, forward as { tap, wx, wy }
              → active phone receives, re-runs hit-test against world coords,
                dispatches as if tapped locally
```

Active phone's own local taps skip forwarding and go straight to the
dispatcher.

### Selection & undo

Selection state lives only on the active phone:

```
selection = {
  die: 0..3 | null,       // which die is selected
  // source is inferred from (die, destination) since direction is fixed
}
```

Undo: tap a board point whose top checker is the most recent move's target.
Runs `undoLastMove`. Easier variant: undo the most recent sub-move whenever
the player taps any moved checker (we only support last-first undo — stack
discipline is fine for v1).

---

## Error Handling

- **Commit-reveal mismatch:** abort session with visible banner
  ("Dice integrity check failed — session ended"). Do not recover.
- **Out-of-turn intent:** active phone silently ignores taps forwarded
  from the passive phone when it is not the active player. Passive phone
  ignores its own locally-resolved intents for the same reason.
- **Illegal move attempt:** `applyMove` throws; active phone catches and
  broadcasts current live state so passive phone re-syncs.
- **Connection drop:** existing reconnect logic in peer.js handles this
  (3 attempts with backoff); on reconnect, the active player re-broadcasts
  live state.

---

## Testing Strategy

### Rules engine

Pure, testable in isolation:

- `applyMove` does not auto-end; `moveHistory` accumulates.
- `undoLastMove` is an exact inverse of `applyMove` (round-trip
  property test).
- `canEndTurn` returns false when a longer legal sequence exists.
- Doubles produce four dice in `diceRemaining`.
- Bear-off legal only when home is full; overshoot-from-highest rule.

### Commit-reveal

- Deterministic test with fixed secrets/salts — expected derived dice.
- Tampering test — one side sends wrong reveal → verification fails.

### Rendering

- Visual inspection: place two phones long-edges-touching, confirm seam
  looks continuous.
- Test harness: single-canvas debug view that renders the whole world for
  comparison with the split-phone view.

### Integration

- Two-browser test: run on two tabs sized like phone viewports;
  bottom-phone tab plays through a full turn, confirm top-phone tab
  follows via live updates; pick up dice; confirm commit.

---

## Security & Trust

- Commit-reveal on dice is the only adversarial protection. The rest of
  the game assumes cooperating players (a rogue active phone could
  broadcast an illegal state, but no mechanism polices board state — v1
  trusts the active phone for state, policed only by visual inspection).
- TURN credentials remain in `config.js` as before.

---

## Performance

- Full state is small (<300 bytes serialized). Commit broadcasts are
  trivial; live updates are similar.
- Canvas redraws on state change, not per frame.
- Tap forwarding adds one data-channel round-trip (~5–50ms on same-network
  WebRTC, up to 200ms over TURN relay). Players notice this on cross-seam
  taps only; within-phone taps are local and instant.

---

## Out of Scope

- Doubling cube, match play, Crawford/Jacoby rules — single games only.
- Animations beyond what's needed for clarity.
- Accessibility beyond reasonable tap target sizes.
- Any change to the existing pairing / signaling / data channel setup.
