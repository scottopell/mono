# Backgammon

Two-phone multiplayer backgammon as a static site. One player creates a
room and shares a short code; the other joins. Both see the board from
their own perspective in real time via WebRTC.

See [`VISION.md`](./VISION.md) for the product vision and
[`specs/`](./specs/) for requirements, design, and status.

## Running locally

No build step. Any static file server will work:

```bash
# pick one
python3 -m http.server 8080
npx http-server . -p 8080
```

Then open http://localhost:8080 in two browser tabs (or two devices on
the same network). Click **New Game** in one, copy the code to the
**Join** field in the other.

For solo playtesting, click **Play locally (one device)** — runs a
hotseat game on the same device. The board flips perspective to the
active player each turn.

## Deployment

Static site — publish to GitHub Pages or any static host. Before
deploying, copy `config.example.js` to `config.js` and fill in your
TURN credentials (needed for cross-network NAT traversal on some
mobile networks). `config.js` is gitignored so credentials don't land
in the public repo.

Without `config.js` the app falls back to STUN-only and works on most
home networks but will fail on symmetric-NAT cellular connections.

## Architecture

- `index.html` + `style.css` — shell
- `rules.js` — pure game state + legal-move computation
- `board.js` — canvas rendering + tap hit-testing
- `peer.js` — PeerJS (WebRTC) session management
- `main.js` — UI wiring, lobby → game flow

Room creator is **host** and owns authoritative state. The joiner is a
**guest** mirror — it sends intents (roll, move) and renders whatever
state the host broadcasts back. See `specs/design.md` for details.

## Scope

v1 implements the full game (board, bar, bearing off, hitting,
winner). Doubling cube, history, animations, and sound are deferred
per `VISION.md`.
