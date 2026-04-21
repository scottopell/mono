# Backgammon

Two-phone unified-board backgammon as a static site. Two phones held
landscape, long edges touching, become a single backgammon board — bottom
phone owns points 1–12, top phone owns points 13–24. Each player sees
their half right-side-up from their seat; taps on either phone resolve
across the entire shared board.

See [`VISION.md`](./VISION.md) for the original product direction and
[`specs/`](./specs/) for the active requirements, design, and status. The
current design is the two-phone unified board — the prior mirrored-board
design is preserved in git history.

## Running locally

No build step. Any static file server will work:

```bash
# pick one
python3 -m http.server 8080
npx http-server . -p 8080
```

Then open http://localhost:8080 on two devices (or two browser tabs).
Tap **New Game** in one, share the code, **Join** in the other. Hold the
phones long-edges-touching with the host at the bottom.

**Play locally (one device)** runs a hotseat mode for development. It
renders only the bottom half of the board (useful for rules debugging,
not for a real game).

## Deployment

Static site — publish to GitHub Pages or any static host. Before
deploying, copy `config.example.js` to `config.js` and fill in your TURN
credentials (needed for cross-network NAT traversal on some mobile
networks). `config.js` is gitignored.

## Architecture

- `index.html` + `style.css` — shell; chrome overlay rotates 180° on the
  top phone so text reads for the sitter opposite.
- `rules.js` — pure game state, legal-move computation, move history,
  pickup gate (mandatory-use rule).
- `board.js` — canvas rendering in a shared world coordinate system with
  a role-based viewport crop per phone.
- `dice.js` — SHA-256 commit-reveal dice protocol. Neither phone alone
  can bias the rolls; mismatch aborts the session.
- `peer.js` — PeerJS (WebRTC) session management, unchanged from the
  prior mirrored design. Carries the new message protocol.
- `main.js` — UI wiring; role negotiation, die-first move loop, tap
  forwarding, commit-reveal orchestration, explicit pickup.

**Turn bookends are physical gestures:** rolling dice starts the turn,
picking up dice ends it. Between them, tap a die to see legal moves,
tap a destination to commit a sub-move, tap a moved checker to undo.

## Scope

Full single-game backgammon (bar, bear-off, hitting, doubles, opening
roll, mandatory-use rule). **Out of scope:** doubling cube, match play,
any change to pairing/WebRTC transport.
