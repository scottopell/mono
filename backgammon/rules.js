// Backgammon rules engine — pure functions over state.
// See specs/design.md for the state shape and index convention.
//
// Index convention: board[0..23]. P1 pieces are positive; P2 negative.
// P1 moves DECREASING index (home = 0..5, bears off past 0).
// P2 moves INCREASING index (home = 18..23, bears off past 23).
//
// REQ-UB-004 / REQ-UB-005: startRoll takes externally-generated dice so the
//   commit-reveal layer controls randomness; the engine itself is pure.
// REQ-UB-006 / REQ-UB-007: legalMovesFrom enumerates (to, die) pairs.
// REQ-UB-008: moveHistory + undoLastMove enable sub-move undo within a turn.
// REQ-UB-009: canEndTurn enforces the mandatory-use rule.
// REQ-UB-012: bar entry is forced when a checker is on the bar.
// REQ-UB-013: bearing off applies standard overshoot-from-highest rule.
// REQ-UB-014: applyOpeningRoll drives the one-die-per-player opening ritual.
// REQ-UB-015: checkWinner fires when a player has borne off 15.
(() => {
  'use strict';

  function initialState() {
    const board = new Array(24).fill(0);
    board[5] = 5;   board[18] = -5;
    board[7] = 3;   board[16] = -3;
    board[12] = 5;  board[11] = -5;
    board[23] = 2;  board[0]  = -2;
    return {
      board,
      bar: { p1: 0, p2: 0 },
      borneOff: { p1: 0, p2: 0 },
      dice: [null, null],
      diceRemaining: [],
      turn: null,
      phase: 'opening',
      winner: null,
      rollSeq: 0,
      moveHistory: [],
      openingRolls: { p1: null, p2: null },
    };
  }

  function cloneState(s) {
    return {
      board: s.board.slice(),
      bar: { p1: s.bar.p1, p2: s.bar.p2 },
      borneOff: { p1: s.borneOff.p1, p2: s.borneOff.p2 },
      dice: s.dice.slice(),
      diceRemaining: s.diceRemaining.slice(),
      turn: s.turn,
      phase: s.phase,
      winner: s.winner,
      rollSeq: s.rollSeq,
      moveHistory: s.moveHistory.map((m) => ({ ...m })),
      openingRolls: {
        p1: s.openingRolls ? s.openingRolls.p1 : null,
        p2: s.openingRolls ? s.openingRolls.p2 : null,
      },
    };
  }

  const opp = (p) => (p === 'p1' ? 'p2' : 'p1');
  const signOf = (p) => (p === 'p1' ? 1 : -1);
  const uniq = (arr) => [...new Set(arr)];

  function isBlocked(state, idx, player) {
    if (idx < 0 || idx > 23) return false;
    const v = state.board[idx];
    return player === 'p1' ? v <= -2 : v >= 2;
  }

  function canBearOff(state, player) {
    if (state.bar[player] > 0) return false;
    if (player === 'p1') {
      for (let i = 6; i < 24; i++) if (state.board[i] > 0) return false;
    } else {
      for (let i = 0; i < 18; i++) if (state.board[i] < 0) return false;
    }
    return true;
  }

  // "Highest" = farthest from this player's bear-off edge.
  function highestOccupied(state, player) {
    if (player === 'p1') {
      for (let i = 5; i >= 0; i--) if (state.board[i] > 0) return i;
      return -1;
    } else {
      for (let i = 18; i <= 23; i++) if (state.board[i] < 0) return i;
      return 24;
    }
  }

  function legalMovesFrom(state, from) {
    const moves = [];
    if (state.phase !== 'move') return moves;

    const player = state.turn;
    if (!player) return moves;
    const sign = signOf(player);

    if (state.bar[player] > 0 && from !== 'bar') return moves;

    const dice = uniq(state.diceRemaining);

    if (from === 'bar') {
      if (state.bar[player] === 0) return moves;
      for (const d of dice) {
        const to = player === 'p1' ? 24 - d : d - 1;
        if (!isBlocked(state, to, player)) moves.push({ to, die: d });
      }
      return moves;
    }

    if (from < 0 || from > 23) return moves;
    if (sign * state.board[from] <= 0) return moves;

    const bearOff = canBearOff(state, player);

    for (const d of dice) {
      const dest = player === 'p1' ? from - d : from + d;
      if (dest >= 0 && dest <= 23) {
        if (!isBlocked(state, dest, player)) moves.push({ to: dest, die: d });
        continue;
      }
      if (!bearOff) continue;
      const distance = player === 'p1' ? from + 1 : 24 - from;
      if (d === distance) moves.push({ to: 'off', die: d });
      else if (d > distance && from === highestOccupied(state, player)) {
        moves.push({ to: 'off', die: d });
      }
    }
    return moves;
  }

  // All legal (from, to, die) triples for the current player.
  function allLegalMoves(state) {
    const out = [];
    if (state.phase !== 'move') return out;
    if (state.bar[state.turn] > 0) {
      for (const m of legalMovesFrom(state, 'bar')) {
        out.push({ from: 'bar', to: m.to, die: m.die });
      }
      return out;
    }
    const sign = signOf(state.turn);
    for (let i = 0; i < 24; i++) {
      if (sign * state.board[i] > 0) {
        for (const m of legalMovesFrom(state, i)) {
          out.push({ from: i, to: m.to, die: m.die });
        }
      }
    }
    return out;
  }

  function hasAnyLegalMove(state) {
    return allLegalMoves(state).length > 0;
  }

  // REQ-UB-014: opening roll. Each player submits one value; higher wins and
  //   takes the turn with both values as their dice.
  function applyOpeningRoll(state, player, value) {
    if (state.phase !== 'opening') throw new Error('not in opening phase');
    if (![1, 2, 3, 4, 5, 6].includes(value)) throw new Error('bad die value');
    const s = cloneState(state);
    s.openingRolls[player] = value;
    const v1 = s.openingRolls.p1;
    const v2 = s.openingRolls.p2;
    if (v1 == null || v2 == null) return s;
    if (v1 === v2) {
      // Tie → re-roll. Clear and wait for new values.
      s.openingRolls.p1 = null;
      s.openingRolls.p2 = null;
      return s;
    }
    s.turn = v1 > v2 ? 'p1' : 'p2';
    s.dice = [v1, v2];
    s.diceRemaining = [v1, v2]; // opening roll is never a pair (tie path)
    s.phase = 'move';
    s.rollSeq = (s.rollSeq || 0) + 1;
    s.moveHistory = [];
    if (!hasAnyLegalMove(s)) {
      // Edge case: opening dice admit no legal moves. Fall through — the
      // player picks up and the turn passes. canEndTurn returns true.
    }
    return s;
  }

  // REQ-UB-004 / REQ-UB-005: set the turn's dice from externally-supplied
  //   values. Doubles expand to four uses.
  function startRoll(state, dice) {
    if (state.phase !== 'roll') throw new Error('not in roll phase');
    if (!Array.isArray(dice) || dice.length !== 2) {
      throw new Error('need exactly two dice');
    }
    const [d1, d2] = dice;
    if (![1,2,3,4,5,6].includes(d1) || ![1,2,3,4,5,6].includes(d2)) {
      throw new Error('bad die value');
    }
    const s = cloneState(state);
    s.dice = [d1, d2];
    s.diceRemaining = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
    s.phase = 'move';
    s.rollSeq = (s.rollSeq || 0) + 1;
    s.moveHistory = [];
    return s;
  }

  // REQ-UB-008: applyMove never ends the turn. It only applies one sub-move
  //   and records it in history. The caller decides when to end.
  function applyMove(state, move) {
    const legal = legalMovesFrom(state, move.from)
      .some((m) => m.to === move.to && m.die === move.die);
    if (!legal) throw new Error('illegal move');

    const player = state.turn;
    const sign = signOf(player);
    const oSign = -sign;
    const o = opp(player);

    const s = cloneState(state);
    let hit = false;

    if (move.from === 'bar') s.bar[player]--;
    else s.board[move.from] -= sign;

    if (move.to === 'off') {
      s.borneOff[player]++;
    } else {
      if (s.board[move.to] === oSign) {
        s.board[move.to] = 0;
        s.bar[o]++;
        hit = true;
      }
      s.board[move.to] += sign;
    }

    const dIdx = s.diceRemaining.indexOf(move.die);
    s.diceRemaining.splice(dIdx, 1);
    s.moveHistory.push({ from: move.from, to: move.to, die: move.die, hit });

    if (s.borneOff[player] === 15) {
      s.phase = 'gameover';
      s.winner = player;
    }
    return s;
  }

  // REQ-UB-008: reverse the most recent sub-move and return the die to the
  //   pool. No-op if the history is empty.
  function undoLastMove(state) {
    if (!state.moveHistory || state.moveHistory.length === 0) return state;
    const s = cloneState(state);
    const last = s.moveHistory.pop();
    const player = s.turn;
    const sign = signOf(player);
    const o = opp(player);
    const oSign = -sign;

    if (last.to === 'off') s.borneOff[player]--;
    else {
      s.board[last.to] -= sign;
      if (last.hit) {
        // Restore the opponent checker we sent to the bar.
        s.bar[o]--;
        s.board[last.to] = oSign;
      }
    }

    if (last.from === 'bar') s.bar[player]++;
    else s.board[last.from] += sign;

    s.diceRemaining.push(last.die);
    // Gameover reverted if we just undid the bear-off that won.
    if (s.phase === 'gameover' && s.borneOff[player] < 15) {
      s.phase = 'move';
      s.winner = null;
    }
    return s;
  }

  // Brute force: is there any legal continuation that uses MORE dice than
  // moveHistory.length? If yes, pickup is gated (REQ-UB-009).
  function maxPlayableDepth(state) {
    if (state.phase !== 'move') return 0;
    const moves = allLegalMoves(state);
    if (moves.length === 0) return 0;
    let best = 0;
    for (const m of moves) {
      const s2 = applyMove(state, m);
      // After the move we may have phase='gameover' (won); count as a use.
      const depth = 1 + (s2.phase === 'move' ? maxPlayableDepth(s2) : 0);
      if (depth > best) best = depth;
      if (best === state.diceRemaining.length + state.moveHistory.length) {
        // Can't beat the physical dice ceiling; short-circuit.
        return best;
      }
    }
    return best;
  }

  function canEndTurn(state) {
    if (state.phase === 'gameover') return true;
    if (state.phase !== 'move') return false;
    // Reconstruct the at-start state by undoing history.
    let s = state;
    while (s.moveHistory && s.moveHistory.length > 0) s = undoLastMove(s);
    const maxUsable = maxPlayableDepth(s);
    return state.moveHistory.length >= maxUsable;
  }

  function endTurn(state) {
    const s = cloneState(state);
    s.turn = opp(s.turn);
    s.phase = 'roll';
    s.dice = [null, null];
    s.diceRemaining = [];
    s.moveHistory = [];
    return s;
  }

  function checkWinner(state) {
    if (state.borneOff.p1 >= 15) return 'p1';
    if (state.borneOff.p2 >= 15) return 'p2';
    return null;
  }

  window.BackgammonRules = {
    initialState,
    cloneState,
    applyOpeningRoll,
    startRoll,
    applyMove,
    undoLastMove,
    legalMovesFrom,
    allLegalMoves,
    hasAnyLegalMove,
    canEndTurn,
    endTurn,
    canBearOff,
    checkWinner,
  };
})();
