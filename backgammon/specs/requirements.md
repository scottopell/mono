# Backgammon — Two-Phone Unified Board Requirements

## User Story

As two people who want to play backgammon together, we want to hold our phones
side-by-side so that the two screens together *are* the backgammon board — one
continuous surface spanning two devices. Sitting on opposite sides, each of us
sees our own half of the board from our own seat, taps checkers and dice on
either phone's surface, and the game feels like a physical board sitting
between us.

## Overview

Two-player, two-device backgammon. Phones are held landscape, long edges
touching; players sit on opposite sides of the stack. Bottom phone owns points
1–12; top phone owns points 13–24. The board is rendered in a single shared
world coordinate system — each phone shows a viewport crop of that world.
Players naturally see their half right-side-up from their seat because they
sit opposite each other; there is no per-player perspective flip on the board
surface itself.

Turn bookends are physical gestures: rolling dice starts the turn, picking up
dice ends it. Between bookends, the player taps a die to reveal legal moves,
then taps a destination to commit a sub-move. Tapping an already-moved checker
undoes that sub-move.

WebRTC pairing (room codes, signaling, data channel) is out of scope for this
change — already built and tested.

---

## Requirements

### REQ-UB-001: Two Phones Form One Continuous Board

WHEN two paired phones are placed landscape with their long edges touching
THE SYSTEM SHALL render the bottom phone's half of the board on the bottom
phone and the top phone's half on the top phone, using a single shared
world coordinate system so the seam between devices looks like the
midline of a physical backgammon board

WHEN a checker is at any point on the board
THE SYSTEM SHALL display it on the phone whose half owns that point, at the
correct position within the continuous board surface

**Rationale:** The game should feel like a physical board that happens to be
split across two pieces of glass. If the illusion breaks — if points jump,
shift, or re-orient across the seam — the shared-board feeling dies and the
app becomes "two devices showing a game" instead of "one game on two screens."

---

### REQ-UB-002: See Your Own Half Right-Side-Up From Your Seat

WHEN a player looks at their own phone from their seat opposite the other
player
THE SYSTEM SHALL display their own half of the board right-side-up for them,
with their home quadrant on their right-hand side

**Rationale:** Players shouldn't have to mentally rotate what they're
looking at. Because they sit opposite each other on a shared board, each
naturally sees their half correctly oriented — the system just has to not
actively flip it.

---

### REQ-UB-003: Read Player-Facing Text From Your Seat

WHEN each phone displays player-facing text (name, pip count, turn indicator,
instructional hints)
THE SYSTEM SHALL orient that text so it reads correctly for the player
sitting on that phone's side

WHEN the top phone displays its chrome
THE SYSTEM SHALL position the chrome along the outer long edge of that phone
(away from the seam) and rotate it 180° relative to the board surface so it
reads correctly for the top-side sitter

**Rationale:** Board graphics don't need orientation — the checker on point 7
is just a checker wherever you're sitting. But text has a reading direction;
if "Your turn" shows up upside-down to the person whose turn it is, the UI
feels broken. Each player's chrome belongs on the far side of their own
phone, reading toward them.

---

### REQ-UB-004: Roll Dice to Start Your Turn

WHEN it is a player's turn and the dice have not yet been rolled
THE SYSTEM SHALL allow only the active player to initiate a dice roll, and
SHALL display the rolled dice on both phones in the active player's home
quadrant

WHEN the active player rolls doubles
THE SYSTEM SHALL display four dice of the same value

**Rationale:** Rolling is the tactile start of a turn. Both players need to
see what was rolled at the same moment so there's no question about what's
on the table. Dice living on the active player's side keeps them out of the
way and signals whose turn it is at a glance.

---

### REQ-UB-005: Dice Values Agreed By Both Phones

WHEN each phone generates its contribution to a dice roll
THE SYSTEM SHALL combine both phones' contributions so that neither phone
alone determines the outcome

WHEN the two phones' contributions disagree on commitment or reveal
THE SYSTEM SHALL end the session with a clearly surfaced cheating signal
rather than silently recovering

**Rationale:** Peer-to-peer play with no trusted server means each phone
could, in principle, pick favorable rolls. A two-sided protocol that mixes
both phones' entropy removes that possibility without either player having
to trust the other. Explicit failure on mismatch preserves integrity — a
silent fallback would invite exactly the cheating the protocol prevents.

---

### REQ-UB-006: Tap a Die to See Your Options

WHEN the active player taps one of their dice
THE SYSTEM SHALL highlight every legal source point for that die value and
every legal destination, on both phones, so the player can see all moves
that die enables

WHEN the active player taps a different die
THE SYSTEM SHALL switch the highlights to reflect the newly selected die

**Rationale:** The UI should teach the game by showing what's possible. A
new player learns by seeing where each die lets them move; an experienced
player moves faster because they can confirm at a glance. Tapping die-first
(rather than source-first) also matches the cross-phone geometry — you can
spend a die without caring which phone the source lives on.

---

### REQ-UB-007: Tap a Destination to Move

WHEN a die is selected and the active player taps a legal destination for
that die on either phone
THE SYSTEM SHALL move the checker from the unique legal source to that
destination and consume the selected die

WHEN no die is selected and the active player taps a destination that
exactly one die can reach
THE SYSTEM SHALL complete that move and consume the matching die

WHEN no die is selected and the active player taps a destination that is
ambiguous or illegal
THE SYSTEM SHALL do nothing harmful and SHALL NOT display an error — the
player can tap a die to see their options

**Rationale:** Because destinations legitimately live on the opposite phone
from sources, tapping source-then-destination would force the player to
tap across the seam for every move. Die-then-destination is both more
compact and uniquely determines the source (direction of play is fixed).
The UI should guide, never scold — ambiguous taps lead to helpful
highlights, not scolding dialogs.

---

### REQ-UB-008: Undo a Sub-Move Before Picking Up

WHEN the active player taps a checker they moved earlier in the current turn,
before picking up the dice
THE SYSTEM SHALL return that checker to where it came from and return the
die to the pool of available dice

WHEN the active player has picked up the dice
THE SYSTEM SHALL treat the turn as committed and SHALL NOT allow undo

**Rationale:** Backgammon players think by trying. If a combination doesn't
work out once a later move is attempted, the player needs to back up without
restarting the turn. Picking up the dice is the hard commit — before that,
the turn is malleable; after, it is not.

---

### REQ-UB-009: Pick Up Dice to End Your Turn

WHEN the active player has consumed all dice they can legally use
AND the active player picks up the dice
THE SYSTEM SHALL commit the turn and pass the move to the other player

WHEN the active player attempts to pick up the dice while a legal sequence
exists that would use more dice than they have used
THE SYSTEM SHALL prevent pickup and signal that more dice remain to play

WHEN one or more dice cannot be used by any legal sequence
THE SYSTEM SHALL display those dice as unusable and allow pickup with them
unused

**Rationale:** A physical turn ends when you pick up your dice — that is the
universal signal for "I'm done." Forcing the gesture keeps each turn's end
deliberate and preserves the mandatory-use rule: you can't skip dice just
to deny your opponent information. Greying out truly-stuck dice communicates
"you didn't forget, this one genuinely can't be played."

---

### REQ-UB-010: Tap Across the Seam

WHEN the active player taps a location on the passive player's phone
THE SYSTEM SHALL treat that tap as if it occurred at the same world
position on the active phone

WHEN the passive player taps anything on their own phone during the other
player's turn
THE SYSTEM SHALL ignore the tap and SHALL NOT mutate game state

**Rationale:** The board spans two devices by design. A move from point 8 to
point 13 has its destination on the opposite phone from the die. The active
player needs to be able to tap anywhere on the entire board, regardless of
which phone renders that location. The passive player sitting across can't
act on their own — that matches physical backgammon, where touching your
opponent's pieces mid-turn is meaningless.

---

### REQ-UB-011: Watch Your Opponent Move in Real Time

WHEN the active player selects a die or completes a sub-move
THE SYSTEM SHALL update the passive player's phone to reflect the current
in-progress board within a visible moment

**Rationale:** Half the fun of backgammon is watching your opponent think
and move. If the opponent's phone only updates at turn end, the game
becomes a series of reveals instead of a live shared experience. Seeing
sub-moves and selection highlights as they happen keeps both players in the
same conversation.

---

### REQ-UB-012: Enter From the Bar Before Anything Else

WHEN the active player has one or more checkers on the bar
THE SYSTEM SHALL allow only bar-entry moves until all of their checkers are
off the bar

WHEN the active player taps a die while on the bar
THE SYSTEM SHALL highlight the bar-entry destination for that die if legal,
or highlight nothing if that die cannot enter

**Rationale:** Re-entering from the bar is a rule players already know from
physical play. Enforcing it automatically keeps the flow tactile — the
player learns which dice let them back in by tapping them, rather than
being presented with a modal explanation.

---

### REQ-UB-013: Bear Off From Your Home Quadrant

WHEN all fifteen of the active player's checkers are in their home quadrant
THE SYSTEM SHALL display a bear-off tap strip along the outer short edge of
that quadrant on the active player's own phone

WHEN the active player selects a die and taps the bear-off strip
THE SYSTEM SHALL bear one checker off using that die if bear-off is legal
for that die, applying standard bear-off rules (exact match preferred; a
higher die may bear off only if no checker occupies a higher point)

**Rationale:** Bearing off is the closing act of a winning game and deserves
its own surface — a dedicated target makes the intent unambiguous. Placing
the strip on the player's own phone matches physical play: checkers come
off toward you, not toward your opponent.

---

### REQ-UB-014: Opening Roll Decides First Turn

WHEN a new game begins
THE SYSTEM SHALL have each player roll one die, declare the higher roller
the first mover, and use both rolled values as that player's first-turn
dice

WHEN both players roll the same value
THE SYSTEM SHALL re-roll until the values differ

**Rationale:** The opening roll is backgammon tradition. Keeping it
preserves the game's feel; re-rolling ties avoids the awkwardness of an
arbitrary tiebreaker that doesn't match how players resolve it in person.

---

### REQ-UB-015: Declare a Winner

WHEN one player has borne off all fifteen of their checkers
THE SYSTEM SHALL display the winner on both phones and offer a one-tap
control to start a new game

**Rationale:** Games need endings. A clear announcement and an easy rematch
path keeps the session going if both players want to play another.

---

### REQ-UB-016: Create and Join a Room (Inherited)

WHEN a user starts a new game or joins by room code
THE SYSTEM SHALL establish the peer connection using the already-implemented
pairing flow (room codes, WebRTC data channel)

**Rationale:** Pairing is already built and out of scope for this change.
Documented here so future readers understand that REQ-UB-010 and REQ-UB-011
depend on a working data channel without restating how pairing itself works.

**Dependencies:** (External — implemented in `peer.js`, unchanged.)

---
