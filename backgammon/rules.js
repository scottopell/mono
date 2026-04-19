// Backgammon rules engine — pure functions over state.
// See specs/design.md for the full state shape and index convention.
//
// Index convention: board[0..23]. P1 pieces are positive; P2 negative.
// P1 moves DECREASING index (home = 0..5, bears off past 0).
// P2 moves INCREASING index (home = 18..23, bears off past 23).
//
// REQ-BG-006: legal-move computation.
// REQ-BG-007: hit detection.
// REQ-BG-008: bearing off including overshoot rule.
// REQ-BG-009: auto-end when no legal moves remain.
// REQ-BG-010: winner detection.
(() => {
  'use strict';

  function initialState() {
    // Standard starting position. Each pair (i, 23-i) is symmetric.
    const board = new Array(24).fill(0);
    board[5] = 5;   board[18] = -5;
    board[7] = 3;   board[16] = -3;
    board[12] = 5;  board[11] = -5;
    board[23] = 2;  board[0] = -2;
    return {
      board,
      bar: { p1: 0, p2: 0 },
      borneOff: { p1: 0, p2: 0 },
      dice: [null, null],
      diceRemaining: [],
      turn: 'p1',
      phase: 'roll',
      winner: null,
      rollSeq: 0,
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
  // P1 bears off past 0, so highest = largest occupied index in 0..5.
  // P2 bears off past 23, so highest = smallest occupied index in 18..23.
  function highestOccupied(state, player) {
    if (player === 'p1') {
      for (let i = 5; i >= 0; i--) if (state.board[i] > 0) return i;
      return -1;
    } else {
      for (let i = 18; i <= 23; i++) if (state.board[i] < 0) return i;
      return 24;
    }
  }

  // Returns array of { to, die } where `to` is 0..23 or "off".
  function legalMovesFrom(state, from) {
    const moves = [];
    if (state.phase !== 'move') return moves;

    const player = state.turn;
    const sign = signOf(player);

    // Bar rule: if any checker on bar, only bar re-entry moves are legal.
    if (state.bar[player] > 0 && from !== 'bar') return moves;

    const dice = uniq(state.diceRemaining);

    if (from === 'bar') {
      if (state.bar[player] === 0) return moves;
      for (const d of dice) {
        const to = player === 'p1' ? 24 - d : d - 1;
        if (!isBlocked(state, to, player)) {
          moves.push({ to, die: d });
        }
      }
      return moves;
    }

    if (from < 0 || from > 23) return moves;
    if (sign * state.board[from] <= 0) return moves;

    const bearOff = canBearOff(state, player);

    for (const d of dice) {
      const dest = player === 'p1' ? from - d : from + d;

      if (dest >= 0 && dest <= 23) {
        if (!isBlocked(state, dest, player)) {
          moves.push({ to: dest, die: d });
        }
        continue;
      }

      if (!bearOff) continue;

      const distance = player === 'p1' ? from + 1 : 24 - from;
      if (d === distance) {
        moves.push({ to: 'off', die: d });
      } else if (d > distance && from === highestOccupied(state, player)) {
        moves.push({ to: 'off', die: d });
      }
    }

    return moves;
  }

  function hasAnyLegalMove(state) {
    if (state.phase !== 'move') return false;
    if (state.bar[state.turn] > 0) {
      return legalMovesFrom(state, 'bar').length > 0;
    }
    const sign = signOf(state.turn);
    for (let i = 0; i < 24; i++) {
      if (sign * state.board[i] > 0 && legalMovesFrom(state, i).length > 0) {
        return true;
      }
    }
    return false;
  }

  function rollDice(state) {
    if (state.phase !== 'roll') throw new Error('not in roll phase');
    const s = cloneState(state);
    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    s.dice = [d1, d2];
    s.diceRemaining = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
    s.phase = 'move';
    s.rollSeq = (s.rollSeq || 0) + 1;
    if (!hasAnyLegalMove(s)) return endTurn(s);
    return s;
  }

  function applyMove(state, move) {
    const legal = legalMovesFrom(state, move.from)
      .some((m) => m.to === move.to && m.die === move.die);
    if (!legal) throw new Error('illegal move');

    const player = state.turn;
    const sign = signOf(player);
    const oSign = -sign;
    const o = opp(player);

    const s = cloneState(state);

    if (move.from === 'bar') {
      s.bar[player]--;
    } else {
      s.board[move.from] -= sign;
    }

    if (move.to === 'off') {
      s.borneOff[player]++;
    } else {
      if (s.board[move.to] === oSign) {
        s.board[move.to] = 0;
        s.bar[o]++;
      }
      s.board[move.to] += sign;
    }

    const dIdx = s.diceRemaining.indexOf(move.die);
    s.diceRemaining.splice(dIdx, 1);

    if (s.borneOff[player] === 15) {
      s.phase = 'gameover';
      s.winner = player;
      return s;
    }

    if (s.diceRemaining.length === 0 || !hasAnyLegalMove(s)) {
      return endTurn(s);
    }
    return s;
  }

  function endTurn(state) {
    const s = cloneState(state);
    s.turn = opp(s.turn);
    s.phase = 'roll';
    s.dice = [null, null];
    s.diceRemaining = [];
    return s;
  }

  // Public API
  window.BackgammonRules = {
    initialState,
    cloneState,
    rollDice,
    applyMove,
    legalMovesFrom,
    hasAnyLegalMove,
    endTurn,
    canBearOff,
  };
})();
