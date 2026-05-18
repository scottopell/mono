# Backgammon Multiplayer - Technical Design

## Architecture Overview

Static site (HTML + CSS + plain JS, no framework, no build step). Two
devices connect via WebRTC data channel using PeerJS for signaling. The
room creator is the **host** and owns authoritative state; the **guest**
sends intent messages and receives state broadcasts.

```
┌────────────┐                          ┌────────────┐
│  Host      │◄──── WebRTC DataChan ───►│  Guest     │
│  (p1)      │                          │  (p2)      │
│            │   state snapshots →      │            │
│            │   ← intent messages      │            │
│  rules.js  │                          │  rules.js  │
│  board.js  │                          │  board.js  │
└────────────┘                          └────────────┘
      │                                       │
      └─── peerjs.com signaling ──────────────┘
             (handshake only — dropped after
              connection, no game data)

      (Fallback relay: self-hosted coturn TURN
       server, credentials in config.js)
```

**Design principles:**

- Authoritative state lives on exactly one side (host). No CRDT, no
  conflict resolution. Turn-based games don't need them.
- Rules engine is pure — `applyMove(state, move)` returns a new state or
  rejects. Runs on both sides: guest uses it to compute legal moves
  locally for UI; host uses it to validate intents before applying.
- Rendering reads state; it never mutates it. Only two code paths write
  state: host's `applyMove` (authoritative) and guest's `onStateReceived`
  (mirror from network).
- Board orientation is fixed and shared (v2). The state array is always
  indexed the same way; each phone renders a fixed half of one canonical
  orientation (host=left, guest=right, local=both). No per-device flip,
  no rotation on turn change.
- Selection is also host-authoritative and broadcast with state, because
  a tap can originate on either phone (both phones are I/O terminals for
  the one game).

---

## File Layout

```
backgammon/
├── VISION.md               # The original design brief
├── index.html              # Single-page entry
├── style.css               # Board + lobby styling
├── config.example.js       # TURN credentials template
├── rules.js                # Pure game state + legal moves
├── board.js                # Canvas rendering + hit-testing
├── peer.js                 # PeerJS wrapper, host/guest, sync
├── main.js                 # UI wiring: lobby, turn flow, state updates
├── README.md
└── specs/
    ├── requirements.md
    ├── design.md
    └── executive.md
```

`config.js` (not checked in) is loaded before `main.js` and exposes TURN
credentials on `window.BACKGAMMON_CONFIG`. If absent, the app falls back
to STUN-only, which works for most home networks but not symmetric-NAT
cellular.

---

## State Model

```js
{
  board: Array(24),            // positive = p1, negative = p2; 0 = empty
  bar: { p1: 0, p2: 0 },
  borneOff: { p1: 0, p2: 0 },
  dice: [null, null],          // [die1, die2] once rolled; doubles expand to 4 uses
  diceRemaining: [],           // remaining die values to play this turn
  turn: "p1" | "p2",
  phase: "roll" | "move" | "gameover",
  winner: null | "p1" | "p2",
  rollSeq: 0                   // incremented on each roll; drives UI animation
}
```

### Index convention (REQ-BG-003 board orientation)

- Array indices **0–23** are fixed. Index 0 is p1's "24-point" (p2's ace
  point); index 23 is p1's ace point (p2's 24-point).
- **P1 moves decreasing index** (from 23 toward 0, bearing off past 0).
  P1 home = indices 0–5.
- **P2 moves increasing index** (from 0 toward 23, bearing off past 23).
  P2 home = indices 18–23.
- Bar re-entry: P1 re-enters into index `24 - die` (die=1 → 23, die=6 →
  18). P2 re-enters into index `die - 1` (die=1 → 0, die=6 → 5).

Starting position:

| Index | Value | Meaning                         |
|-------|-------|---------------------------------|
|     5 |    +5 | P1 six-point                    |
|     7 |    +3 | P1 bar-point                    |
|    12 |    +5 | P1 mid-point                    |
|    23 |    +2 | P1 twenty-four-point (rear)     |
|    18 |    -5 | P2 six-point (mirror of 5)      |
|    16 |    -3 | P2 bar-point (mirror of 7)      |
|    11 |    -5 | P2 mid-point (mirror of 12)     |
|     0 |    -2 | P2 twenty-four-point (mirror)   |

(Each pair sums to 23 on index, matches on absolute value, opposite sign.)

---

## Rules Engine (`rules.js`)

Pure functions over state. No rendering, no network, no DOM.

**Exports:**

```
initialState()              → state
rollDice(state)             → state' with dice + diceRemaining
legalMovesFrom(state, idx)  → [{to, die}]  — all legal destinations for the
                              checker at idx given remaining dice
applyMove(state, move)      → state' | throws if illegal
canMove(state)              → boolean — is there any legal move at all?
endTurn(state)              → state' with turn flipped, phase='roll',
                              dice cleared
checkWinner(state)          → null | "p1" | "p2"
```

### Legal-move computation (REQ-BG-006, 007, 008)

1. **If the player has a checker on the bar**, only bar re-entry moves
   are legal. Destination must not be blocked (≥2 opponent checkers).
2. **Otherwise, for each remaining die d**:
   - For each point `i` with a checker of the current player:
     - Compute `to = i - d` (p1) or `i + d` (p2).
     - If `to` is in 0..23 and not blocked → legal.
     - Bear off case: if `to < 0` (p1) or `to > 23` (p2) and **all** of
       the player's checkers are in the home board, the move is legal
       if either:
        - `to` is exactly the board edge (die matches distance), or
        - `to` overshoots the edge AND no checkers of this player
          occupy higher points than `i`. (I.e., you can use a 6 to
          bear off from the 4-point only if nothing sits on 5 or 6.)

### Doubles

On a double roll, `diceRemaining` has four entries of the same value.
Each used die is removed one at a time via `applyMove`.

### Forced-use rule (REQ-BG-009)

Standard backgammon: if only one die can be played, the higher must be
played. We enforce the softer version: after each move, recompute legal
moves; if none remain for *any* die, auto-advance to the next phase
(turn end). We document the higher-die rule but don't enforce the
"must use higher if only one playable" corner case in v1 — it's rarely
contested in casual home play and would add meaningful complexity. Flag
for v2.

---

## Rendering (`board.js`) — v2 split board (REQ-BG-014)

HTML5 Canvas 2D. `renderBoard(ctx, state, side, ui)` where `side` is
`"left"` (host phone), `"right"` (guest phone), or `"both"` (local
hotseat / solo). **There is no perspective flip and no rotation on turn
change.** The board has one canonical orientation, identical to v1's old
p1 view, and each device draws a fixed slice of it:

```
top row L→R:    12 13 14 15 16 17 | (bar) | 18 19 20 21 22 23
bottom row L→R: 11 10  9  8  7  6 | (bar) |  5  4  3  2  1  0
```

Panel segment order (left→right):

- `left` : `[P1 tray] [6 cols] [bar strip]`
- `right`: `[bar strip] [6 cols] [P2 tray]`
- `both` : `[P1 tray] [6 cols] [bar] [6 cols] [P2 tray]`

So the two phones placed edge to edge tile into the full board, with each
phone's inner-edge bar strip meeting at the seam (the physical gap reads
as the bar). Point colors alternate by *global* column (0–11) so the
checkerboard pattern stays continuous across the seam.

`slotForIndex(idx, side)` returns `{row, col}` or `null` if that index
is not on this panel; `indexForSlot(side, row, col)` is the inverse used
by hit-testing. Each phone's bar strip shows only that phone's player's
bar checkers (host=left=p1, guest=right=p2) so a hit shows up on the
phone of whoever was hit (REQ-BG-014). Trays: P1's on the left panel,
P2's on the right.

### Interaction — tap-source then tap-die (REQ-BG-015)

`hitTest(x, y, w, h, side)` returns a board index, `"bar"`, `"off"`, or
`null`. Selection is **host-authoritative** (`{source}`), broadcast
alongside state so both phones highlight identically. Every tap on
either phone is forwarded to the host as a raw intent
(`{intent:'tap', loc}` / `{intent:'tapDie', value}` / `{intent:'roll'}`);
the host applies it against the current turn (two-people trust model —
whoever physically taps, the host treats it as the current player's
action). Flow:

1. Tap a current-player checker → host sets selection.
2. Each phone locally computes `legalMovesFrom(state, source)` to
   highlight playable dice; if a destination lands on *this* panel it
   also draws a faint destination marker with the die number.
3. Tap a playable die → host runs `applyMove` with the move whose
   `die` matches; destination is implied, never tapped, so a checker
   whose destination is on the other phone is still moveable.

Tapping `"off"` (a tray) is a deliberate no-op so an accidental tray
tap can't drop the current selection.

### Checker stacking

Up to five checkers render full-size; stacks of 6+ render compressed
with a count label. Bar/tray stacks cap their visible pucks similarly.

---

## Peer Connection (`peer.js`)

Wrapper around PeerJS that abstracts the host/guest asymmetry behind a
single event-emitting object.

**Exports:**

```
createHost({ onGuestJoined, onIntent, onStatus }) → { peerId, send }
joinAsGuest(roomCode, { onState, onStatus })     → { send }
```

`peerId` / `roomCode` is the short code from REQ-BG-001. We use PeerJS's
custom-peer-id feature: generate a 6-char code from a curated alphabet
(`ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — no I/L/O/0/1) and try to claim it
as our peer ID. On collision (very unlikely at two-people scale), retry.

**Message envelope:**

```js
// Host → Guest  (selection broadcast alongside state, v2)
{ type: "state", state: <full state object>, selection: {source}|null }

// Guest → Host  (raw taps; host attributes them to the current turn)
{ type: "intent", intent: "roll" }
{ type: "intent", intent: "tap", loc: <idx|"bar"|"off"|null> }
{ type: "intent", intent: "tapDie", value: <1..6> }
{ type: "intent", intent: "newGame" }
```

Host broadcasts after every state mutation. Guest is pure mirror — it
only renders state it receives. Guest computes legal moves locally for
UI responsiveness (no round-trip to highlight destinations) but actual
mutations are round-tripped.

### TURN fallback (REQ-BG-011 resilience)

PeerJS's `config.iceServers` accepts our TURN URL and credential. We
pass the TURN config unconditionally; WebRTC picks the best candidate
pair automatically (direct UDP preferred, TURN relay fallback).

### Reconnection (REQ-BG-011)

PeerJS emits `disconnected` on signaling loss and `close` on data
channel loss. On either, we:

1. Show "reconnecting" in the status indicator.
2. Attempt `peer.reconnect()` (preserves peer ID).
3. On reconnection, the host re-broadcasts current state; the guest
   re-renders from it.

If reconnect fails after 3 attempts, we show "connection lost" and
offer a "rejoin with code" button that re-runs the full connection
flow. Game state is preserved on the host side regardless.

---

## UI Wiring (`main.js`)

Three top-level screens controlled by a simple mode variable:

- `mode = "lobby"` — initial. "New Game" and "Join by Code" controls.
- `mode = "waiting"` — host has a code, guest hasn't connected yet.
  Shows the code and a copyable display.
- `mode = "playing"` — game is live. Shows board + dice + controls.

**Turn flow (host side):**

```
  applyIntent(intent)
    ↓
  validate with rules.legalMovesFrom / rules.applyMove
    ↓
  mutate state
    ↓
  if checkWinner → phase = "gameover"
  else if diceRemaining.empty or no legal moves → endTurn()
    ↓
  broadcast state to guest
    ↓
  re-render locally
```

**Guest side is strictly:**

```
  user tap → send intent → wait → receive state → render
```

---

## Error Handling Strategy

- **Invalid move attempts:** `applyMove` throws; host catches, ignores,
  and rebroadcasts current state (guest UI self-corrects).
- **Malformed network messages:** Logged to console, dropped. Not
  user-facing — protocol is internal.
- **PeerJS errors:** Surfaced to the status indicator. Three retry
  attempts then full restart.
- **Missing TURN config:** App still starts (`BACKGAMMON_CONFIG`
  undefined → STUN only). Console warning logged.

---

## Testing Strategy

### Rules engine

`rules.js` is pure; it can be exercised directly from a test harness
page (`test.html`) or browser devtools. Target coverage:

- Initial state is the canonical starting position.
- All standard openings produce expected `legalMovesFrom` outputs.
- Bar re-entry blocks other moves until bar is empty.
- Bearing off respects the "overshoot only from the highest point"
  rule.
- Hit-the-blot correctly moves opponent to bar.
- Doubles produce four uses; all four must be used if legal.
- Winner detected when 15 checkers borne off.

### Integration / manual

Two-browser test: open the app in two tabs (or two devices), create a
room on one, join from the other. Play a few full turns; confirm hits
and bearing off appear on both sides and that the board does not rotate
on turn change.

### Split-board continuity

Visual inspection: render `left` and `right` halves with a known state
and confirm they tile into the full canonical board — top row
`12..17|18..23`, bottom `11..6|5..0`, point-color alternation continuous
across the seam, P1's bar/tray only on the left phone and P2's only on
the right. Local hotseat (`both`) renders the whole board on one screen
for solo playtesting.

---

## Security Considerations

- **TURN credentials in static JS:** Acceptable for a private app — the
  credentials only authorize relay use, not access to anything
  sensitive. `config.js` is gitignored to keep them out of the public
  repo; a committed `config.example.js` documents the shape.
- **No user input reaches the server:** All game logic is client-side;
  peerjs.com sees only WebRTC handshake metadata.
- **Trust model:** Both players are assumed to be cooperating. No
  cheat-resistance — the host could lie about dice rolls, but the use
  case is two people playing together, not adversarial play.

---

## Performance Considerations

- State objects are small (<200 bytes serialized). Broadcasting every
  state change is cheap.
- Canvas rendering is straightforward; redraw on state change, not per
  frame. Target: 60fps on mid-range phones for the dice roll animation,
  instant redraw on move.
- TURN relay round-trip adds ~50–200ms depending on location. Turn-based
  play hides this entirely; no perceptible latency for players.
