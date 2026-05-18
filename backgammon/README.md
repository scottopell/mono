# Backgammon

Two-phone multiplayer backgammon as a static site. Lay both phones side
by side in landscape: the two screens form **one continuous board** (host
= left half, guest = right half, the gap between them is the bar). One
player creates a room and shares a one-tap invite link; the other opens
it. Synced in real time via WebRTC.

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
the same network). Click **New Game** in one, share the invite link (or
copy the code to the **Join** field) on the other. Each device renders
its fixed half of the board; place them edge to edge in landscape.

Moves are made by **tapping a checker, then tapping a die** — the die
determines the destination, so a checker whose destination is on the
other phone is still moveable from whichever phone it sits on.

For solo playtesting, click **Play locally (one device)** — renders the
full board on one screen, no peer connection, no flip or rotation.

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

Room creator is **host** and owns authoritative state *and* the current
selection. Both phones are I/O terminals: any tap is forwarded to the
host as a raw intent and attributed to the current turn. The board has
one fixed orientation; `board.js` renders a fixed half per device
(`left`/`right`/`both`). See `specs/design.md` for details.

## Scope

Full game: board, bar, bearing off, hitting, winner detection,
split-board two-phone layout, tap-source-then-tap-die input. Doubling
cube, history, animations, and sound are deferred per `VISION.md`.
