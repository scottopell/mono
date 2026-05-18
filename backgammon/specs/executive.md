# Backgammon Multiplayer - Executive Summary

## Requirements Summary

Backgammon Multiplayer lets two people sitting together play backgammon
by laying their phones side by side in landscape so the two screens form
**one continuous board** — left half on the host's phone, right half on
the guest's, the gap between them reading as the bar. There is no
mirrored per-player view; it's a single shared object on the table, like
a real board.

To start, one player taps "New Game" and shares a one-tap invite link
(or short code); the other opens it. Turns alternate naturally: tap
Roll, tap one of the current player's checkers (on either phone), then
tap a die — source plus die determines the destination, so a move is
always completable from whichever phone the checker sits on, even when
it lands on the other person's screen. Illegal moves are blocked, bar
re-entry is enforced, hits land on the hit player's phone, and bearing
off works the moment all fifteen checkers are home. The app tracks who's
won and offers a rematch. A local hotseat mode renders the full board on
one device for solo play/testing.

**Value proposition:** Feels like a shared physical board, not two
synced screens or a correspondence game. Zero account setup. Private
peer-to-peer data path (no third-party game server).

**Deferred:** doubling cube, game history, spectator mode, smooth
animations, sound.

## Technical Summary

Static site (HTML + CSS + plain JS, no build step, no framework) hosted
on GitHub Pages. Two devices connect via WebRTC data channel using
PeerJS for signaling; a self-hosted coturn TURN server provides NAT
traversal fallback. No game data crosses any third-party server — only
the initial WebRTC handshake touches peerjs.com.

**Authoritative state** lives on the room creator (host). The joiner
(guest) is a pure mirror: it sends intent messages (roll, move) and
renders whatever state the host broadcasts back. This host/guest split
eliminates conflict resolution entirely — a turn-based game doesn't
need CRDTs.

**State shape:** A 24-entry array for the board (sign indicates
player, magnitude indicates stack height), plus bar/borneOff counts,
current dice, remaining uses, turn, and phase. Indices are fixed and
shared; there is a single canonical board orientation. The host also
owns the current move *selection* and broadcasts it alongside state.

**v2 split-board model:** Both phones are I/O terminals for the one
host-authoritative game. `board.js` renders a fixed half per device
(`side` = left/right/both) — no perspective flip, no rotation on turn
change. Any tap on either phone is forwarded to the host as a raw intent
(`tap` / `tapDie` / `roll`); the host attributes it to the current turn
(two-people trust model). Moves commit via tap-source-then-tap-die:
`source + die` resolves the destination deterministically, so nothing on
the far phone ever needs to be tapped.

**Rules engine** (`rules.js`) is pure and unchanged from v1 —
`applyMove(state, move)` returns a new state or throws; 32 node
regression tests still pass. Connection layer (`peer.js`) wraps PeerJS;
state broadcasts now carry the selection field too.

## Status Summary

| Requirement | Status | Notes |
|-------------|--------|-------|
| **REQ-BG-001:** Create a Room and Share a Code | ✅ Complete | 6-char room code (no ambiguous glyphs) via PeerJS custom ID |
| **REQ-BG-002:** Join a Room by Code | ✅ Complete | Timeout with retry message if room unreachable |
| **REQ-BG-003:** Play From Your Own Perspective | ⛔ Deprecated | Superseded by REQ-BG-014 (shared single-orientation board; no per-device flip) |
| **REQ-BG-004:** Roll the Dice on Your Turn | ✅ Complete | Roll control shown when phase is roll; doubles expand to 4 uses; dice mirror on both phones |
| **REQ-BG-005:** Move by Tap-to-Select, Tap-to-Destination | ⛔ Deprecated | Superseded by REQ-BG-015 (tap-source then tap-die) |
| **REQ-BG-006:** Prevent Illegal Moves | ✅ Complete | Host validates via `applyMove`; bar re-entry forced before other moves |
| **REQ-BG-007:** Send a Hit Checker to the Bar | ✅ Complete | Hit detection in `applyMove`; bar counts render on both devices |
| **REQ-BG-008:** Bear Off When All Checkers Are Home | ✅ Complete | Standard bear-off rules including overshoot-from-highest |
| **REQ-BG-009:** End the Turn When Dice Are Exhausted | ✅ Complete | Auto-advance when dice used or no legal moves remain |
| **REQ-BG-010:** Declare a Winner | ✅ Complete | Winner banner + "New Game" button to reset |
| **REQ-BG-011:** Show Connection Status | ✅ Complete | Indicator shows connected/waiting/reconnecting/lost; guest auto-reconnects the DataConnection with exponential backoff (3 attempts) before declaring the session lost |
| **REQ-BG-012:** Keep Game State Authoritative and Consistent | ✅ Complete | Host-only mutations; guest mirrors state broadcasts |
| **REQ-BG-013:** Send a One-Tap Invite Link | ✅ Complete | `?room=CODE` URL auto-joins; share button uses Web Share API on mobile, clipboard fallback elsewhere |
| **REQ-BG-014:** One Shared Board Across Two Phones | ✅ Complete | Single fixed orientation; host=left 12, guest=right 12, local=full; bar at the seam; hit shows on hit player's phone; trays per player; verified no rotation on turn flip |
| **REQ-BG-015:** Move by Tap-Source then Tap-Die | ✅ Complete | Source selectable on either phone; playable dice highlighted; destination ghost+die badge when on same panel; die tap commits; cross-half moves verified |

**Progress:** 13 of 13 active complete (REQ-BG-003 and REQ-BG-005 deprecated, replaced by 014/015)

**Known gaps:**

- Higher-die-must-be-used rule (when only one die is playable) is not
  enforced — noted in design.md for v2.
- Hard network drops that outlast three auto-reconnect attempts
  surface as "lost" in the status indicator and require re-entering
  the room code manually. Host state is preserved; only the
  connection needs rebuilding.
- No smooth animation between move states (v1 uses snap-to-position
  per the vision doc's deferred list).
