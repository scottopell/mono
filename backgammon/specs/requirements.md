# Backgammon Multiplayer Requirements

## User Story

As two people who want to play backgammon together without being at the same
table, we need a static-hosted web app where each of us sees the board from
our own perspective on our own phone, with moves reflected in near-real-time
so the game feels like a shared physical board rather than a turn-passing
email exchange.

## Overview

Two-player, two-device backgammon as a static site. One player creates a
room and shares a short code; the other joins with it. Both players view
the same game state from their own perspective (board rotates 180° between
clients). The host device owns authoritative state; the guest sends intents
(roll, move) which the host validates and rebroadcasts.

---

## Requirements

### REQ-BG-001: Create a Room and Share a Code

WHEN a user taps "New Game" in the lobby
THE SYSTEM SHALL generate a short room code (4–6 characters, no ambiguous
glyphs like 0/O or 1/I/L)

WHEN the room code has been generated
THE SYSTEM SHALL display the code prominently so the user can read it aloud
or send it to the other player

**Rationale:** The two players are typically together or on a call. A short,
speakable code makes starting a game feel like saying "want to play?" rather
than filling out a form. Avoiding ambiguous characters prevents the annoying
"was that a zero or an O?" exchange.

---

### REQ-BG-002: Join a Room by Code

WHEN a user types a room code into the join field and taps "Join"
THE SYSTEM SHALL attempt to connect to that room and transition into the game
when the connection is established

WHEN the entered code matches no open room
THE SYSTEM SHALL display "Couldn't reach that room — check the code" within
ten seconds and allow the user to retry

**Rationale:** Joining should feel as lightweight as saying "ok I'm in." A
clear error path keeps the failure from looking like a silent hang, which is
the most frustrating multiplayer failure mode.

---

### REQ-BG-003: Play From Your Own Perspective

WHEN either player views the board
THE SYSTEM SHALL render that player's home board at the bottom of their
screen and their pieces moving bottom-to-top toward bearing off

WHEN a move happens
THE SYSTEM SHALL animate or update the same move consistently on both
devices, preserving each player's perspective

**Rationale:** A backgammon player's mental model of "my home is here, I move
this way" is rooted in physical play. Flipping the board per-device preserves
that embodied sense. Without this, the app feels like watching a game you
can't orient in.

---

### REQ-BG-004: Roll the Dice on Your Turn

WHEN it is your turn to roll
THE SYSTEM SHALL show a prominent "Roll" control on your device and a
"waiting for opponent" indicator on the other device

WHEN you tap Roll
THE SYSTEM SHALL display two dice values (four moves available on doubles)
on both devices within a visible moment of the tap

**Rationale:** Rolling is the most tactile part of a backgammon turn —
"what did you get?" is half the fun. Both players need to see the same
numbers at the same time, or trust evaporates.

---

### REQ-BG-005: Move by Tap-to-Select, Tap-to-Destination

WHEN it is your turn and dice remain
THE SYSTEM SHALL let you tap one of your points to select it and highlight
all legal destinations given the unused dice

WHEN you tap a highlighted destination
THE SYSTEM SHALL complete the move, consume the appropriate die, and update
both devices

WHEN you tap anywhere else or tap the selected point again
THE SYSTEM SHALL clear the selection without moving

**Rationale:** On a phone, drag-and-drop is fiddly and error-prone. Two taps
with explicit highlighting of legal targets keeps each move deliberate and
removes "did it really land there?" ambiguity.

---

### REQ-BG-006: Prevent Illegal Moves

WHEN you attempt a move that is not legal (blocked point, wrong direction,
insufficient dice, bar re-entry required, not yet bearing off)
THE SYSTEM SHALL refuse the move and leave the state unchanged

WHEN you have checkers on the bar
THE SYSTEM SHALL require you to re-enter them before any other move is
offered as legal

**Rationale:** Enforcing rules automatically removes the social friction of
"wait, can I do that?" and lets the game flow at the pace of thinking rather
than the pace of rule-checking.

---

### REQ-BG-007: Send a Hit Checker to the Bar

WHEN you move onto a point occupied by exactly one opponent checker
THE SYSTEM SHALL move your checker onto that point and place the opponent's
checker onto the bar on both devices

**Rationale:** Hitting a blot is a core rhythm of backgammon. Players need
to see the hit happen visibly on both screens so the opponent feels the
consequence of leaving the blot, not just a silent state change.

---

### REQ-BG-008: Bear Off When All Checkers Are Home

WHEN all fifteen of your checkers are in your home board
THE SYSTEM SHALL allow moves that bear a checker off using a die value that
exactly matches (or, for bear off only, exceeds) a checker's distance to the
edge

WHEN you bear off a checker
THE SYSTEM SHALL increment your borne-off count on both devices

**Rationale:** Bearing off is the satisfying payoff of building your home
board. Players care about seeing the count climb — it's the closing act of
the game.

---

### REQ-BG-009: End the Turn When Dice Are Exhausted

WHEN you have used both dice (or all four on doubles)
THE SYSTEM SHALL automatically pass the turn to your opponent

WHEN you have no legal move with any remaining die
THE SYSTEM SHALL automatically forfeit the remaining dice and pass the turn

**Rationale:** Backgammon has a rule where unplayable dice are simply lost.
Automating the forfeit keeps the game moving at the pace of thinking rather
than forcing players to tap through a redundant confirmation for a result
they can't change.

---

### REQ-BG-010: Declare a Winner

WHEN one player has borne off all fifteen checkers
THE SYSTEM SHALL declare that player the winner on both devices and offer a
"New Game" control that resets the board

**Rationale:** Games need an ending moment. A clear winner announcement with
a one-tap rematch keeps the session alive if they want to keep playing.

---

### REQ-BG-011: Show Connection Status

WHEN the peer connection is active
THE SYSTEM SHALL display a subtle "connected" indicator

WHEN the peer connection drops
THE SYSTEM SHALL display a "reconnecting" indicator and attempt to
re-establish the channel automatically

WHEN the connection is restored
THE SYSTEM SHALL re-sync the current game state from the host and resume
play without requiring either player to restart

**Rationale:** Phones drop connections constantly (WiFi handoff, background
app, elevator). The game must not lose state when that happens — losing a
half-finished game to a network blip would be the fastest way to kill the
app's usefulness.

---

### REQ-BG-012: Keep Game State Authoritative and Consistent

WHEN the guest device sends a move or roll intent
THE SYSTEM SHALL validate the intent on the host and apply it only if legal,
then rebroadcast the full updated state

WHEN either device renders the board
THE SYSTEM SHALL render from the same underlying state, differing only in
perspective

**Rationale:** Disagreement about "whose turn is it" or "where's that
checker" would ruin the shared-board illusion. A single authoritative state
on the host eliminates that class of bug entirely.

---
