# Backgammon Multiplayer - Executive Summary

## Requirements Summary

Backgammon Multiplayer solves the problem of wanting to play backgammon
with a specific person who happens to be elsewhere (or right next to you
with their own phone) without passing a single device back and forth.
Each player uses their own phone, sees the board from their own
perspective — their home board at the bottom, their pieces moving toward
bearing off — and every move appears in near-real-time on both screens.

To start, one player taps "New Game" and shares a short code; the other
enters it. From there, turns alternate naturally: roll dice, tap a
checker, tap the destination. Illegal moves are blocked, bar re-entry is
enforced, and bearing off works the moment all fifteen checkers are
home. The app tracks who's won and offers a rematch.

**Value proposition:** Feels like a shared physical board, not a
correspondence game. Zero account setup — share a code, start playing.
Private peer-to-peer data path (no third-party game server). Works over
any network the two phones happen to be on.

**Scope (v1):** Full game with bar, bearing off, hitting blots, winner
detection. **Deferred to v2:** doubling cube, game history, spectator
mode, smooth animations, sound.

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
current dice, remaining uses, turn, and phase. Indices are fixed across
both clients; perspective flip is a render-time transform only.

**Rules engine** (`rules.js`) is pure — `applyMove(state, move)` returns
a new state or throws. It runs on both sides: the guest uses it locally
to highlight legal destinations in the UI, and the host uses it to
validate before applying. Rendering (`board.js`) takes state plus a
perspective argument and draws to Canvas 2D. Connection layer
(`peer.js`) wraps PeerJS with a simple intent/state message protocol.

## Status Summary

| Requirement | Status | Notes |
|-------------|--------|-------|
| **REQ-BG-001:** Create a Room and Share a Code | ✅ Complete | 6-char room code (no ambiguous glyphs) via PeerJS custom ID |
| **REQ-BG-002:** Join a Room by Code | ✅ Complete | Timeout with retry message if room unreachable |
| **REQ-BG-003:** Play From Your Own Perspective | ✅ Complete | Per-device perspective transform in `board.js`; state indices shared |
| **REQ-BG-004:** Roll the Dice on Your Turn | ✅ Complete | Active-player Roll button; other device shows waiting; doubles expand to 4 uses |
| **REQ-BG-005:** Move by Tap-to-Select, Tap-to-Destination | ✅ Complete | Legal destinations highlighted on selection; tap elsewhere clears |
| **REQ-BG-006:** Prevent Illegal Moves | ✅ Complete | Host validates via `applyMove`; bar re-entry forced before other moves |
| **REQ-BG-007:** Send a Hit Checker to the Bar | ✅ Complete | Hit detection in `applyMove`; bar counts render on both devices |
| **REQ-BG-008:** Bear Off When All Checkers Are Home | ✅ Complete | Standard bear-off rules including overshoot-from-highest |
| **REQ-BG-009:** End the Turn When Dice Are Exhausted | ✅ Complete | Auto-advance when dice used or no legal moves remain |
| **REQ-BG-010:** Declare a Winner | ✅ Complete | Winner banner + "New Game" button to reset |
| **REQ-BG-011:** Show Connection Status | ✅ Complete | Indicator shows connected/waiting/reconnecting/lost; guest auto-reconnects the DataConnection with exponential backoff (3 attempts) before declaring the session lost |
| **REQ-BG-012:** Keep Game State Authoritative and Consistent | ✅ Complete | Host-only mutations; guest mirrors state broadcasts |

**Progress:** 12 of 12 complete

**Known gaps:**

- Higher-die-must-be-used rule (when only one die is playable) is not
  enforced — noted in design.md for v2.
- Hard network drops that outlast three auto-reconnect attempts
  surface as "lost" in the status indicator and require re-entering
  the room code manually. Host state is preserved; only the
  connection needs rebuilding.
- No smooth animation between move states (v1 uses snap-to-position
  per the vision doc's deferred list).
