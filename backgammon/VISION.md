# Backgammon — Two-Phone Multiplayer Vision

*Product & technical vision — April 2026*

-----

My wife and I want to play backgammon together. On vacation, on the couch, wherever – phones out, each person looking at their own screen, pieces moving in real time. The game should feel like a physical board between us, not a turn-passing email chain. This document describes what that should look like and how to build it as a static site with no managed backend.

In this document I focus on the UX model and technical architecture. Rules enforcement edge cases (hitting blots, bearing off rule variations, doubling cube) are noted but deferred – get the core game working first.

## The Playing Condition

Two people. Two phones. Sitting together or across a network. Each player sees the board from their own perspective – their home board at the bottom, their pieces moving toward bearing off. The board is not a shared top-down view; it rotates 180 degrees between the two clients.

This is the central design constraint everything else flows from: **the board is always rendered from the current player's perspective, with their pieces moving bottom-to-top.**

When a piece moves on one phone, it moves on the other phone within a frame or two. Dice are rolled once, the result is authoritative for both players, and the turn structure enforces who can interact at any given moment.

## Connection Model

The app is a static HTML + JavaScript site hosted on GitHub Pages. There is no application server. Real-time sync is handled via **PeerJS (WebRTC data channels)**, with a self-hosted `coturn` TURN server for NAT traversal.

### Why WebRTC over a hosted service

The alternative – Firebase Realtime Database or similar – would work but adds a persistent third-party dependency and requires account management. WebRTC with a self-hosted TURN relay keeps the data path private and eliminates recurring service concerns. The TURN server is lightweight and already integrated into the homelab stack.

### Session establishment

One player creates a game and receives a short **room code** (4–6 alphanumeric characters). The second player enters that code on their device. PeerJS uses a public signaling server (peerjs.com) solely to exchange the initial WebRTC handshake – after that, the data channel is direct peer-to-peer (or relayed through coturn if direct connection fails). No game data touches the signaling server.

The TURN server credentials are embedded in the static site config. This is acceptable for a private personal app – the credentials authorize relay usage, not access to anything sensitive.

### Connectivity config

A `config.js` at the root of the site holds TURN credentials and is excluded from the public repository:

```js
window.BACKGAMMON_CONFIG = {
  turn: {
    urls: [
      "turn:turn.yourdomain.com:5349?transport=tcp",
      "turn:turn.yourdomain.com:3478"
    ],
    username: "user",
    credential: "password"
  }
};
```

## Game State Model

All authoritative game state lives in a single JavaScript object. One peer is designated **host** (the room creator) – they own the authoritative state and are responsible for broadcasting updates. The guest receives state updates and renders accordingly. This is a simple leader/follower model that avoids conflict resolution entirely, which is appropriate for a strictly turn-based game.

```js
{
  board: [...],        // 24-point array, positive = player 1 pieces, negative = player 2
  bar: { p1: 0, p2: 0 },
  borneOff: { p1: 0, p2: 0 },
  dice: [null, null],  // current roll, null if not yet rolled
  diceUsed: [false, false],
  turn: "p1" | "p2",
  phase: "roll" | "move" | "end",
  moveHistory: []
}
```

On each state change, the host serializes and sends the full state object to the guest over the data channel. The guest never writes state – it sends **intent messages** (roll request, move attempt) to the host, which validates and applies them.

## UI & Board Rendering

Rendered in plain HTML Canvas or SVG – no framework dependency. The board should look clean and tactile, not like a generic web game.

### Board layout

Standard backgammon geometry: 24 points arranged in two rows of 12, separated by a bar in the center. Points alternate in two colors. Checkers stack on their respective points with a count label when stacks exceed a readable height.

### Perspective flip

Player 2's board is the same data rendered with point indices reversed and piece colors swapped. A utility function `renderBoard(state, playerPerspective)` handles this – the underlying state never changes, only the rendering transform.

### Interaction model

- **Roll dice button** appears on the active player's screen during the `roll` phase. Inactive player sees a waiting indicator.
- **Dice result** animates briefly (shake + reveal) then displays as static pip icons for the remainder of the turn.
- **Moving pieces:** Tap a point to select it (highlights valid destinations), tap a destination to confirm the move. Valid moves are computed locally from the current state and dice remaining.
- **Turn end:** Automatically advances when all dice are used, or a "Pass" button appears if no legal moves exist.

### Sync feedback

A subtle connection indicator (dot, corner of screen) shows peer connection state: connected, reconnecting, or disconnected. On reconnect, the host re-sends current state.

## Dice

Dice are rolled by the host on a roll request from the active player. The result is included in the state broadcast, so both players see the same numbers simultaneously. Doubles are handled per standard rules (four moves available).

No server-side randomness is needed – this is a game between two people who trust each other. `Math.random()` is fine.

## Scope

### In scope for v1

- Full board rendering with perspective flip
- WebRTC peer connection with TURN fallback
- Room code session establishment
- Dice rolling, move validation (legal moves, bar re-entry, bearing off)
- Real-time state sync
- Basic win detection

### Explicitly deferred

- **Doubling cube** – adds significant game logic complexity, save for v2
- **Game history / replay** – no persistent storage in v1
- **Spectator mode**
- **Animations** – pieces snap to position in v1, smooth animation is a polish pass
- **Sound**
- **Account system or matchmaking** – this is a two-person private app

## Open Questions

- Should the room code be human-readable (e.g., `BEAR-7`) or just random alphanumeric? Readability wins if we're calling it out to each other in person.
- PeerJS's free signaling server is fine for personal use but is an external dependency. Worth self-hosting `peerjs-server` in the homelab stack alongside coturn, or is that over-engineering for this use case?
- What happens if the connection drops mid-turn? The host holds authoritative state, so reconnect + re-broadcast is straightforward – but the UX of that moment needs consideration.
