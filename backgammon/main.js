// UI wiring: lobby → waiting → playing.
//
// Role model:
//   role ∈ { 'bottom', 'top', 'local' }
//   Bottom phone plays as p1 (home = indices 0..5, bottom-right quadrant).
//   Top phone plays as p2 (home = indices 18..23, top-right quadrant).
//   Host defaults to bottom; guest defaults to top. (Both phones could swap
//   via a UI toggle in a later pass — not in this cut.)
//
// Authority:
//   Both phones carry full state. Only the active player's phone mutates
//   committed state. Passive phone forwards local taps as world coords and
//   renders live updates from the active phone.
(() => {
  'use strict';

  const rules = window.BackgammonRules;
  const board = window.BackgammonBoard;
  const peer = window.BackgammonPeer;
  const diceProto = window.BackgammonDice;

  const app = {
    role: null,             // 'bottom' | 'top' | 'local'
    me: null,               // 'p1' | 'p2'
    peerApi: null,
    state: null,
    selectedDie: null,      // index into state.dice (0..3), per-device UI state
    rollSession: null,      // active commit-reveal session
    openingRollValue: null, // our own opening-roll value (local display only)
    turnCounter: 0,         // incremented per roll; domain-separates rolls
    status: 'idle',
    aborted: false,
    pendingDiceMsgs: [],    // commit/reveal messages arriving before session ready
  };

  // --- DOM refs ---
  const el = {
    statusDot: document.getElementById('status-dot'),
    screenLobby: document.getElementById('screen-lobby'),
    screenWaiting: document.getElementById('screen-waiting'),
    screenGame: document.getElementById('screen-game'),
    btnNewGame: document.getElementById('btn-new-game'),
    btnLocal: document.getElementById('btn-local'),
    joinForm: document.getElementById('join-form'),
    joinCode: document.getElementById('join-code'),
    lobbyError: document.getElementById('lobby-error'),
    roomCodeDisplay: document.getElementById('room-code-display'),
    btnCancelHost: document.getElementById('btn-cancel-host'),
    canvas: document.getElementById('board'),
    gameRoot: document.getElementById('screen-game'),
    chromeLabel: document.getElementById('chrome-label'),
    chromeTurn: document.getElementById('chrome-turn'),
    chromeMessage: document.getElementById('chrome-message'),
    btnRoll: document.getElementById('btn-roll'),
    btnPickup: document.getElementById('btn-pickup'),
    btnNew: document.getElementById('btn-new'),
  };

  // --- Screen management ---

  function showScreen(name) {
    el.screenLobby.classList.toggle('hidden', name !== 'lobby');
    el.screenWaiting.classList.toggle('hidden', name !== 'waiting');
    el.screenGame.classList.toggle('hidden', name !== 'game');
  }

  function setStatus(s) {
    app.status = s;
    const map = {
      idle: 'status-idle',
      waiting: 'status-connecting',
      connecting: 'status-connecting',
      connected: 'status-connected',
      reconnecting: 'status-reconnecting',
      lost: 'status-lost',
      aborted: 'status-lost',
    };
    el.statusDot.className = 'status-dot ' + (map[s] || 'status-idle');
    el.statusDot.title = 'connection: ' + s;
  }

  // --- Lobby: host ---

  el.btnNewGame.addEventListener('click', () => {
    el.lobbyError.textContent = '';
    startHost();
  });

  function startHost() {
    app.role = 'bottom';
    app.me = 'p1';
    setStatus('connecting');

    app.peerApi = peer.createHost({
      onStatus: (s) => {
        setStatus(s);
        if (s === 'waiting') {
          el.roomCodeDisplay.textContent = app.peerApi.code;
          showScreen('waiting');
        }
      },
      onPeerJoined: () => {
        // Host seeds the initial state, ships it to the guest, and enters
        // the opening roll. The guest will arrive at 'opening' phase once
        // it receives the commit; both phones then kick off their own
        // commit-reveal sessions and the protocol completes symmetrically.
        const s = rules.initialState();
        setState(s);
        enterGame();
        app.peerApi.send({ type: 'commit', state: serializeState(s) });
        app.peerApi.send({ type: 'hello', role: app.role });
      },
      onMessage: handlePeerMessage,
      onError: (err) => {
        console.error('[host] error:', err);
        el.lobbyError.textContent = 'Could not start room. Try again.';
        showScreen('lobby');
        setStatus('idle');
      },
    });
  }

  el.btnCancelHost.addEventListener('click', () => {
    if (app.peerApi) app.peerApi.close();
    app.peerApi = null;
    app.role = null;
    app.me = null;
    setStatus('idle');
    showScreen('lobby');
  });

  // --- Lobby: local hotseat ---

  el.btnLocal.addEventListener('click', () => {
    el.lobbyError.textContent = '';
    app.role = 'local';
    app.me = 'p1';
    setStatus('idle');
    const s = rules.initialState();
    setState(s);
    enterGame();
    // In local mode we just assign both opening values immediately.
    runLocalOpeningRoll();
  });

  // --- Lobby: guest ---

  el.joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = peer.normalizeCode(el.joinCode.value);
    if (code.length < 4) {
      el.lobbyError.textContent = 'Enter a valid room code.';
      return;
    }
    el.lobbyError.textContent = '';
    startGuest(code);
  });

  function startGuest(code) {
    app.role = 'top';
    app.me = 'p2';
    setStatus('connecting');
    app.peerApi = peer.joinAsGuest(code, {
      onStatus: (s) => {
        setStatus(s);
        if (s === 'connected') {
          // Host has already sent initial state by the time we connect;
          // wait for it. Send hello so host knows our role.
          app.peerApi.send({ type: 'hello', role: app.role });
        }
      },
      onMessage: handlePeerMessage,
      onError: (err) => {
        console.error('[guest] error:', err);
        const msg = err.message === 'timeout' || err.message === 'peer-unavailable'
          ? "Couldn't reach that room — check the code."
          : 'Connection error. Try again.';
        el.lobbyError.textContent = msg;
        setStatus('idle');
        showScreen('lobby');
        if (app.peerApi) app.peerApi.close();
        app.peerApi = null;
        app.role = null;
        app.me = null;
      },
    });
  }

  // --- Peer message dispatch ---

  function handlePeerMessage(msg) {
    switch (msg.type) {
      case 'hello':
        // Role ack. Both phones kick off the opening-roll protocol once
        // they're in the 'opening' phase; beginOpeningRoll is a no-op
        // otherwise (guards on state.phase and on an already-active session).
        beginOpeningRoll();
        break;
      case 'commit':
        // Full-state broadcast. Replace our state wholesale.
        if (app.aborted) return;
        setState(hydrateState(msg.state));
        if (el.screenGame.classList.contains('hidden')) enterGame();
        // Guest receiving the initial commit will be in 'opening' phase.
        beginOpeningRoll();
        maybeAfterCommit();
        break;
      case 'live':
        if (app.aborted) return;
        // Intra-turn updates — display-only on the passive side.
        applyLiveUpdate(msg);
        break;
      case 'tap':
        if (app.aborted) return;
        // Forwarded tap. Only the active phone acts on these.
        if (isMyTurn()) handleWorldTap(msg.x, msg.y);
        break;
      case 'diceCommit':
        if (app.rollSession) app.rollSession.onPeerCommit(msg);
        else app.pendingDiceMsgs.push(msg);
        break;
      case 'diceReveal':
        if (app.rollSession) app.rollSession.onPeerReveal(msg);
        else app.pendingDiceMsgs.push(msg);
        break;
      case 'abort':
        abortSession('peer: ' + (msg.reason || 'unspecified'));
        break;
      default:
        // Unknown message; drop.
        break;
    }
  }

  function abortSession(reason) {
    if (app.aborted) return;
    app.aborted = true;
    setStatus('aborted');
    el.chromeMessage.textContent = 'Dice integrity failure — session ended. (' + reason + ')';
    el.chromeMessage.classList.add('error');
    el.btnRoll.classList.add('hidden');
    el.btnPickup.classList.add('hidden');
    el.btnNew.classList.add('hidden');
    if (app.peerApi) app.peerApi.send({ type: 'abort', reason });
  }

  // --- Game entry ---

  function enterGame() {
    showScreen('game');
    applyChromeOrientation();
    requestAnimationFrame(resizeAndRender);
  }

  function applyChromeOrientation() {
    // Top phone's chrome is rotated 180° to read for the sitter opposite.
    el.gameRoot.classList.toggle('role-top', app.role === 'top');
    el.gameRoot.classList.toggle('role-bottom', app.role === 'bottom');
    el.gameRoot.classList.toggle('role-local', app.role === 'local');
  }

  // --- State management ---

  function setState(s) {
    app.state = s;
    app.selectedDie = null;
    // Mirror for devtools / external test drivers
    try {
      document.body.dataset.bgState = JSON.stringify(serializeState(s));
      document.body.dataset.bgRole = app.role || '';
      document.body.dataset.bgMe = app.me || '';
    } catch (_) {}
    renderUi();
    render();
  }

  function hydrateState(raw) {
    return {
      board: Array.from(raw.board),
      bar: { p1: raw.bar.p1, p2: raw.bar.p2 },
      borneOff: { p1: raw.borneOff.p1, p2: raw.borneOff.p2 },
      dice: raw.dice.slice(),
      diceRemaining: raw.diceRemaining.slice(),
      turn: raw.turn,
      phase: raw.phase,
      winner: raw.winner,
      rollSeq: raw.rollSeq,
      moveHistory: (raw.moveHistory || []).map((m) => ({ ...m })),
      openingRolls: raw.openingRolls
        ? { p1: raw.openingRolls.p1, p2: raw.openingRolls.p2 }
        : { p1: null, p2: null },
    };
  }

  function serializeState(s) {
    return {
      board: Array.from(s.board),
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

  // --- Opening roll (REQ-UB-014) ---

  // Both phones run ONE commit-reveal session with count=2. Both derive the
  // same (v1, v2) pair because the protocol combines both sides' secrets;
  // first value is p1's opening roll, second is p2's. Ties → re-roll with a
  // fresh turn counter.
  function beginOpeningRoll() {
    if (app.role === 'local') { runLocalOpeningRoll(); return; }
    if (app.rollSession) return;
    if (!app.state || app.state.phase !== 'opening') return;
    app.turnCounter = (app.turnCounter || 0) + 1;
    const session = diceProto.createRollSession({
      purpose: 'opening',
      count: 2,
      turn: app.turnCounter,
      send: (m) => app.peerApi && app.peerApi.send(m),
      onDice: ([v1, v2]) => {
        app.rollSession = null;
        app.openingRollValue = app.me === 'p1' ? v1 : v2;
        if (v1 === v2) {
          // Tie. Kick another session; both phones will reach this branch
          // since they derive the same dice, so both will re-roll together.
          renderUi();
          beginOpeningRoll();
          return;
        }
        let s = rules.applyOpeningRoll(app.state, 'p1', v1);
        s = rules.applyOpeningRoll(s, 'p2', v2);
        setState(s);
      },
      onAbort: (r) => { app.rollSession = null; abortSession(r); },
    });
    app.rollSession = session;
    session.start();
    drainPendingDice();
  }

  function drainPendingDice() {
    if (!app.rollSession) return;
    const pending = app.pendingDiceMsgs;
    app.pendingDiceMsgs = [];
    for (const m of pending) {
      if (m.type === 'diceCommit') app.rollSession.onPeerCommit(m);
      else if (m.type === 'diceReveal') app.rollSession.onPeerReveal(m);
    }
  }

  function runLocalOpeningRoll() {
    // Local hotseat: pick both values, re-roll on ties.
    let v1, v2;
    do {
      v1 = diceProto.localRandomDice(1)[0];
      v2 = diceProto.localRandomDice(1)[0];
    } while (v1 === v2);
    let s = rules.applyOpeningRoll(app.state, 'p1', v1);
    s = rules.applyOpeningRoll(s, 'p2', v2);
    setState(s);
  }

  // --- Turn roll ---

  function requestTurnRoll() {
    if (app.state.phase !== 'roll') return;
    if (!isMyTurn()) return;
    if (app.role === 'local') {
      const [d1, d2] = diceProto.localRandomDice(2);
      setState(rules.startRoll(app.state, [d1, d2]));
      broadcastLiveState();
      return;
    }
    if (app.rollSession) return;
    app.turnCounter = (app.turnCounter || 0) + 1;
    const session = diceProto.createRollSession({
      purpose: 'turn',
      count: 2,
      turn: app.turnCounter,
      send: (m) => app.peerApi && app.peerApi.send(m),
      onDice: (vals) => {
        app.rollSession = null;
        const next = rules.startRoll(app.state, vals);
        setState(next);
        broadcastLiveState();
      },
      onAbort: (r) => { app.rollSession = null; abortSession(r); },
    });
    app.rollSession = session;
    session.start();
    drainPendingDice();
  }

  // --- Helpers for turn authority ---

  function isMyTurn() {
    if (!app.state) return false;
    if (app.role === 'local') return true;
    return app.state.turn === app.me;
  }

  function maybeAfterCommit() {
    if (!app.state) return;
    if (app.state.phase === 'move' && isMyTurn() && app.state.dice[0] == null) {
      // Shouldn't happen; state always sets dice when entering 'move'.
      return;
    }
    // If it's now the peer's turn to roll, just wait. If it's our turn and
    // we're in 'roll' phase (i.e., the previous turn committed), the roll
    // button becomes available and we wait for the player to tap it.
    renderUi();
  }

  // --- Render ---

  function render() {
    if (!app.state || !el.canvas) return;
    if (el.screenGame.classList.contains('hidden')) return;
    const { ctx } = board.resizeCanvas(el.canvas);
    const ui = computeUiHighlights();
    board.renderBoard(ctx, app.state, currentRole(), ui);
  }

  function currentRole() {
    // In local hotseat, render bottom-phone view (full board would be more
    // useful; TODO). For now it matches the bottom layout.
    return app.role === 'local' ? 'bottom' : app.role;
  }

  function computeUiHighlights() {
    const s = app.state;
    const hi = { sources: [], destinations: [], hasBearOff: false };
    if (!s || s.phase !== 'move' || !isMyTurn()) {
      return { highlights: hi, selectedDie: null };
    }
    // If a die is selected, highlight all legal (source, destination) pairs
    // using that die value. Otherwise, if a player has a bar checker, show
    // bar as the forced source.
    if (app.selectedDie != null && s.dice[0] != null) {
      const isDoubles = s.dice[0] === s.dice[1];
      const dieValue = isDoubles ? s.dice[0] : s.dice[app.selectedDie];
      // Guard: if that die value isn't actually in diceRemaining, skip.
      if (!s.diceRemaining.includes(dieValue)) {
        return { highlights: hi, selectedDie: app.selectedDie };
      }
      const all = rules.allLegalMoves(s).filter((m) => m.die === dieValue);
      const srcSet = new Set();
      const dstSet = new Set();
      for (const m of all) {
        srcSet.add(m.from);
        if (m.to === 'off') dstSet.add('off-' + s.turn);
        else dstSet.add(m.to);
      }
      hi.sources = Array.from(srcSet);
      hi.destinations = Array.from(dstSet);
      if (dstSet.has('off-' + s.turn)) hi.hasBearOff = true;
    }
    return { highlights: hi, selectedDie: app.selectedDie };
  }

  function renderUi() {
    if (!app.state) return;
    const s = app.state;
    const labelFor = (p) => (p === 'p1' ? 'Player 1' : 'Player 2');
    const isLocal = app.role === 'local';

    if (s.phase === 'gameover') {
      el.chromeTurn.textContent = isLocal
        ? `${labelFor(s.winner)} wins!`
        : (s.winner === app.me ? 'You win!' : 'Opponent wins');
      el.chromeMessage.textContent = 'All 15 borne off.';
    } else if (s.phase === 'opening') {
      el.chromeTurn.textContent = 'Opening roll…';
      el.chromeMessage.textContent = app.openingRollValue
        ? `You rolled ${app.openingRollValue}. Waiting for opponent…`
        : 'Rolling to decide who moves first.';
    } else if (s.phase === 'roll') {
      if (isMyTurn()) {
        el.chromeTurn.textContent = 'Your turn — roll';
        el.chromeMessage.textContent = '';
      } else {
        el.chromeTurn.textContent = "Waiting for opponent's roll…";
        el.chromeMessage.textContent = '';
      }
    } else if (s.phase === 'move') {
      if (isMyTurn()) {
        el.chromeTurn.textContent = 'Your turn';
        const canEnd = rules.canEndTurn(s);
        el.chromeMessage.textContent = canEnd
          ? 'Pick up the dice to end your turn.'
          : 'Tap a die, then tap a destination.';
      } else {
        el.chromeTurn.textContent = 'Opponent is moving…';
        el.chromeMessage.textContent = '';
      }
    }

    const label = isLocal
      ? `Hotseat — ${labelFor(s.turn || 'p1')} to act`
      : `You — ${labelFor(app.me)}`;
    el.chromeLabel.textContent = label;

    // Buttons (visibility is role-gated to keep UI clean)
    const yourTurn = isMyTurn();
    el.btnRoll.classList.toggle('hidden', !(yourTurn && s.phase === 'roll'));
    el.btnPickup.classList.toggle('hidden',
      !(yourTurn && s.phase === 'move' && rules.canEndTurn(s)));
    el.btnNew.classList.toggle('hidden',
      s.phase !== 'gameover' || (app.role !== 'bottom' && app.role !== 'local'));
  }

  // --- Broadcasts ---

  function broadcastLiveState() {
    if (app.role === 'local' || !app.peerApi) return;
    app.peerApi.send({
      type: 'live',
      state: serializeState(app.state),
      selectedDie: app.selectedDie,
    });
  }

  function broadcastCommit() {
    if (app.role === 'local' || !app.peerApi) return;
    app.peerApi.send({ type: 'commit', state: serializeState(app.state) });
  }

  function applyLiveUpdate(msg) {
    // Passive-side: accept only if it's the other player's turn.
    const raw = msg.state;
    if (raw.turn === app.me) {
      // Out-of-turn update — ignore (turn authority enforcement).
      return;
    }
    app.state = hydrateState(raw);
    app.selectedDie = msg.selectedDie != null ? msg.selectedDie : null;
    renderUi();
    render();
  }

  // --- Tap pipeline ---

  el.canvas.addEventListener('click', onCanvasTap);

  function onCanvasTap(e) {
    if (!app.state || app.aborted) return;
    const rect = el.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = board.hitTest(x, y, rect.width, rect.height, currentRole(), app.state);
    if (!hit) return;

    if (isMyTurn()) {
      handleLocalHit(hit);
    } else if (app.role !== 'local' && app.peerApi) {
      // Forward to the active phone. The hit descriptor includes a world
      // coord fallback for kinds that don't map cleanly.
      const world = hitToWorld(hit, x, y, rect.width, rect.height);
      if (world) app.peerApi.send({ type: 'tap', x: world.x, y: world.y });
    }
  }

  function hitToWorld(hit, cx, cy, cw, ch) {
    const vp = board.viewportFor(cw, ch, currentRole());
    return board.canvasToWorld(vp, cx, cy);
  }

  // Interpret a tap that originated on either phone.
  function handleLocalHit(hit) {
    const s = app.state;
    if (s.phase !== 'move') return;

    if (hit.kind === 'die') {
      const remaining = s.diceRemaining.slice();
      const isDoubles = s.dice[0] === s.dice[1];
      const value = isDoubles ? s.dice[0] : s.dice[hit.index];
      if (!remaining.includes(value)) return; // used die
      app.selectedDie = hit.index;
      render();
      broadcastLiveState();
      return;
    }

    // If the tap is on a moved-to square or on a checker we placed this
    // turn, undo the most recent sub-move.
    if (hit.kind === 'point' || hit.kind === 'bearOff') {
      if (tryUndoAt(hit)) return;
    }

    // If no die is selected, try to find a uniquely-determined move to this
    // destination.
    if (app.selectedDie == null) {
      tryDirectDestinationTap(hit);
      return;
    }

    const isDoubles = s.dice[0] === s.dice[1];
    const dieValue = isDoubles ? s.dice[0] : s.dice[app.selectedDie];
    if (!s.diceRemaining.includes(dieValue)) return;

    // Destination tap — find a legal move with the selected die that ends
    // at this point.
    let destKey = destKeyFromHit(hit);
    if (destKey == null) return;

    const moves = rules.allLegalMoves(s).filter((m) => m.die === dieValue && moveMatchesDest(m, destKey));
    if (moves.length === 0) return;
    // Ambiguity on source: pick the move whose source is nearest to the
    // destination (standard preference) — or just the first. v1: first.
    const m = moves[0];
    try {
      const next = rules.applyMove(s, m);
      setState(next);
      broadcastLiveState();
    } catch (e) {
      console.warn('[bg] applyMove rejected:', e.message);
    }
  }

  function destKeyFromHit(hit) {
    if (hit.kind === 'point') return hit.idx;
    if (hit.kind === 'bearOff') return 'off';
    return null;
  }

  function moveMatchesDest(m, destKey) {
    if (destKey === 'off') return m.to === 'off';
    return m.to === destKey;
  }

  function tryDirectDestinationTap(hit) {
    const s = app.state;
    const destKey = destKeyFromHit(hit);
    if (destKey == null) return;
    const moves = rules.allLegalMoves(s).filter((m) => moveMatchesDest(m, destKey));
    // Unique move → execute.
    const distinctDieValues = new Set(moves.map((m) => m.die));
    if (moves.length > 0 && distinctDieValues.size === 1 && moves.length === 1) {
      try {
        const next = rules.applyMove(s, moves[0]);
        setState(next);
        broadcastLiveState();
      } catch (_) {}
    }
    // Ambiguous/illegal: do nothing — the player can tap a die to see options.
  }

  function tryUndoAt(hit) {
    const s = app.state;
    if (!s.moveHistory || s.moveHistory.length === 0) return false;
    const last = s.moveHistory[s.moveHistory.length - 1];
    const matches = (hit.kind === 'point' && last.to === hit.idx)
                 || (hit.kind === 'bearOff' && last.to === 'off');
    if (!matches) return false;
    const next = rules.undoLastMove(s);
    setState(next);
    broadcastLiveState();
    return true;
  }

  function handleWorldTap(wx, wy) {
    const hit = board.hitTestWorld(wx, wy, app.state);
    if (hit) handleLocalHit(hit);
  }

  // --- Buttons ---

  el.btnRoll.addEventListener('click', () => {
    requestTurnRoll();
  });

  el.btnPickup.addEventListener('click', () => {
    if (!app.state) return;
    if (!isMyTurn()) return;
    if (app.state.phase !== 'move') return;
    if (!rules.canEndTurn(app.state)) return;
    const next = rules.endTurn(app.state);
    setState(next);
    broadcastCommit();
  });

  el.btnNew.addEventListener('click', () => {
    const s = rules.initialState();
    setState(s);
    if (app.role === 'local') runLocalOpeningRoll();
    else {
      broadcastCommit();
      beginOpeningRoll();
    }
  });

  // --- Resize ---

  function resizeAndRender() { render(); renderUi(); }

  window.addEventListener('resize', resizeAndRender);
  window.addEventListener('orientationchange', resizeAndRender);

  // --- Boot ---

  setStatus('idle');
  showScreen('lobby');

  // Dev affordance
  window.__bg = app;
})();
