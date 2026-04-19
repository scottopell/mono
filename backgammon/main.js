// UI wiring: lobby → waiting → playing.
// Owns all DOM interaction and connects peer + rules + board.
(() => {
  'use strict';

  const rules = window.BackgammonRules;
  const board = window.BackgammonBoard;
  const peer = window.BackgammonPeer;

  const app = {
    role: null,           // 'host' | 'guest' | 'local'
    perspective: null,    // 'p1' | 'p2' — in local mode, follows state.turn
    state: null,
    peerApi: null,
    selected: null,       // current move-source ('bar', 0..23, or null)
    lastRollSeq: 0,
    status: 'idle',
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
    youLabel: document.getElementById('you-label'),
    turnIndicator: document.getElementById('turn-indicator'),
    diceRow: document.getElementById('dice-row'),
    btnRoll: document.getElementById('btn-roll'),
    btnPass: document.getElementById('btn-pass'),
    btnNew: document.getElementById('btn-new'),
    message: document.getElementById('message'),
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
    app.role = 'host';
    app.perspective = 'p1';
    setStatus('connecting');

    app.peerApi = peer.createHost({
      onStatus: (s) => {
        setStatus(s);
        if (s === 'waiting') {
          el.roomCodeDisplay.textContent = app.peerApi.code;
          showScreen('waiting');
        }
      },
      onGuestJoined: () => {
        // Initialize game state and broadcast
        const s = rules.initialState();
        setState(s, { broadcast: true });
        enterGame();
      },
      onIntent: (msg) => {
        applyIntentOnHost(msg);
      },
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
    setStatus('idle');
    showScreen('lobby');
  });

  // --- Lobby: local hotseat (solo playtest, no peer) ---

  el.btnLocal.addEventListener('click', () => {
    el.lobbyError.textContent = '';
    app.role = 'local';
    app.perspective = 'p1';
    setStatus('idle');
    const s = rules.initialState();
    setState(s, { broadcast: false });
    enterGame();
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
    app.role = 'guest';
    app.perspective = 'p2';
    setStatus('connecting');

    app.peerApi = peer.joinAsGuest(code, {
      onStatus: setStatus,
      onState: (state) => {
        setState(state, { broadcast: false });
        if (app.role === 'guest' && el.screenGame.classList.contains('hidden')) {
          enterGame();
        }
      },
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
      },
    });
  }

  // --- Enter game screen ---

  function enterGame() {
    showScreen('game');
    // Defer so the browser has laid out the newly-visible canvas before we measure.
    requestAnimationFrame(resizeAndRender);
  }

  // --- State management ---

  function setState(s, { broadcast }) {
    app.state = s;
    app.selected = null;
    // In local hotseat, the device always shows the active player's perspective.
    if (app.role === 'local' && s && s.phase !== 'gameover') {
      app.perspective = s.turn;
    }
    if (broadcast && app.role === 'host' && app.peerApi) {
      app.peerApi.send({ type: 'state', state: serializeState(s) });
    }
    // Mirror state to DOM for external debuggers that run in isolated worlds.
    document.body.dataset.bgState = JSON.stringify(serializeState(s));
    document.body.dataset.bgPerspective = app.perspective;
    document.body.dataset.bgSelected = app.selected === null ? '' : String(app.selected);
    renderUi();
    render();
  }

  function serializeState(s) {
    // Ensures clean JSON round-trip (no Int8Array or exotic types)
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
    };
  }

  // --- Intents (REQ-BG-012) ---

  function sendIntent(intent) {
    if (app.role === 'host' || app.role === 'local') {
      applyIntentOnHost({ type: 'intent', ...intent });
    } else if (app.peerApi) {
      app.peerApi.send({ type: 'intent', ...intent });
    }
  }

  function applyIntentOnHost(msg) {
    if (!app.state) return;
    try {
      let s;
      if (msg.intent === 'roll') {
        if (app.state.phase !== 'roll') return;
        s = rules.rollDice(app.state);
      } else if (msg.intent === 'move') {
        s = rules.applyMove(app.state, {
          from: msg.from, to: msg.to, die: msg.die,
        });
      } else if (msg.intent === 'endTurn') {
        if (app.state.phase !== 'move') return;
        s = rules.endTurn(app.state);
      } else if (msg.intent === 'newGame') {
        s = rules.initialState();
      } else {
        return;
      }
      setState(s, { broadcast: true });
    } catch (e) {
      console.warn('[host] intent rejected:', e.message);
      // Re-broadcast current state so guest resyncs
      if (app.peerApi) {
        app.peerApi.send({ type: 'state', state: serializeState(app.state) });
      }
    }
  }

  // --- Render ---

  function render() {
    if (!app.state || !el.canvas || el.screenGame.classList.contains('hidden')) return;
    const { ctx } = board.resizeCanvas(el.canvas);
    board.renderBoard(ctx, app.state, app.perspective, { selected: app.selected });
    document.body.dataset.bgSelected = app.selected === null ? '' : String(app.selected);
  }

  function renderUi() {
    if (!app.state) return;

    const isLocal = app.role === 'local';
    el.youLabel.textContent = isLocal
      ? `Hotseat — ${labelFor(app.state.turn)} to act`
      : `You — ${labelFor(app.perspective)}`;

    // Turn indicator
    if (app.state.phase === 'gameover') {
      const winnerLabel = labelFor(app.state.winner);
      el.turnIndicator.textContent = isLocal
        ? `${winnerLabel} wins!`
        : (app.state.winner === app.perspective ? 'You win!' : 'Opponent wins');
      el.turnIndicator.classList.remove('waiting');
      el.message.textContent = 'All 15 borne off. Nice game.';
      el.message.classList.add('win');
    } else {
      el.message.classList.remove('win');
      const yourTurn = app.state.turn === app.perspective;
      const verb = app.state.phase === 'roll' ? 'roll' : 'move';
      if (isLocal) {
        el.turnIndicator.textContent = `${labelFor(app.state.turn)} — ${verb}`;
        el.turnIndicator.classList.remove('waiting');
      } else if (yourTurn) {
        el.turnIndicator.textContent = `Your turn — ${verb}`;
        el.turnIndicator.classList.remove('waiting');
      } else {
        el.turnIndicator.textContent = app.state.phase === 'roll'
          ? "Waiting for opponent's roll…"
          : 'Waiting for opponent…';
        el.turnIndicator.classList.add('waiting');
      }
      el.message.textContent = '';
    }

    // Dice
    renderDice();

    // Buttons
    const yourTurn = app.state.turn === app.perspective;
    el.btnRoll.classList.toggle('hidden', !(yourTurn && app.state.phase === 'roll'));
    el.btnPass.classList.add('hidden'); // auto-handled by rules engine in v1
    const canReset = app.role === 'host' || app.role === 'local';
    el.btnNew.classList.toggle('hidden', app.state.phase !== 'gameover' || !canReset);
  }

  function labelFor(player) {
    return player === 'p1' ? 'Player 1' : 'Player 2';
  }

  function renderDice() {
    el.diceRow.innerHTML = '';
    const animate = app.state.rollSeq !== app.lastRollSeq && app.state.phase === 'move';
    app.lastRollSeq = app.state.rollSeq;

    if (!app.state.dice[0]) return;

    // Mark a die as "used" when it's no longer in diceRemaining.
    // For doubles, show up to 4 dice.
    const isDoubles = app.state.dice[0] === app.state.dice[1];
    const total = isDoubles ? 4 : 2;
    let remaining = app.state.diceRemaining.slice();

    for (let i = 0; i < total; i++) {
      const die = document.createElement('div');
      die.className = 'die';
      const value = isDoubles ? app.state.dice[0] : app.state.dice[i];
      die.textContent = value;

      // Track uses: consume one from remaining if present
      const idx = remaining.indexOf(value);
      if (idx === -1) {
        die.classList.add('used');
      } else {
        remaining.splice(idx, 1);
      }
      if (animate) die.classList.add('rolling');
      el.diceRow.appendChild(die);
    }
  }

  // --- Canvas input ---

  el.canvas.addEventListener('click', onCanvasTap);

  function onCanvasTap(e) {
    if (!app.state) return;
    if (app.state.phase !== 'move') return;
    if (app.state.turn !== app.perspective) return;

    const rect = el.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const target = board.hitTest(x, y, rect.width, rect.height, app.perspective);

    if (target === null) {
      app.selected = null;
      render();
      return;
    }

    const sign = app.perspective === 'p1' ? 1 : -1;
    const hasBarCheckers = app.state.bar[app.perspective] > 0;

    if (app.selected === null) {
      // New selection attempt
      if (hasBarCheckers) {
        if (target === 'bar') {
          const moves = rules.legalMovesFrom(app.state, 'bar');
          if (moves.length > 0) {
            app.selected = 'bar';
          }
        }
        // Else: only bar is selectable when checkers on bar
      } else if (typeof target === 'number' && sign * app.state.board[target] > 0) {
        const moves = rules.legalMovesFrom(app.state, target);
        if (moves.length > 0) app.selected = target;
      }
      render();
      return;
    }

    // Active selection
    if (target === app.selected) {
      app.selected = null;
      render();
      return;
    }

    const moves = rules.legalMovesFrom(app.state, app.selected);
    const match = moves.find((m) => m.to === target);
    if (match) {
      const intent = { intent: 'move', from: app.selected, to: match.to, die: match.die };
      app.selected = null;
      render();
      sendIntent(intent);
      return;
    }

    // Tapping another own piece (with legal moves) switches selection
    if (!hasBarCheckers && typeof target === 'number' && sign * app.state.board[target] > 0) {
      const newMoves = rules.legalMovesFrom(app.state, target);
      if (newMoves.length > 0) {
        app.selected = target;
        render();
        return;
      }
    }

    app.selected = null;
    render();
  }

  // --- Buttons ---

  el.btnRoll.addEventListener('click', () => {
    sendIntent({ intent: 'roll' });
  });

  el.btnNew.addEventListener('click', () => {
    // Host-only per renderUi; resets and broadcasts
    sendIntent({ intent: 'newGame' });
  });

  // --- Resize ---

  function resizeAndRender() {
    render();
    renderUi();
  }

  window.addEventListener('resize', resizeAndRender);
  window.addEventListener('orientationchange', resizeAndRender);

  // --- Boot ---

  setStatus('idle');
  showScreen('lobby');

  // Dev affordance: expose state for devtools inspection.
  // Not used by the app itself; safe to leave in production.
  window.__bg = app;
  window.__bgSetState = (s) => setState(s, { broadcast: false });

  // Test helper: compute page coords for a board location ('bar', 'off',
  // or a board index 0..23) from the active perspective. Returns {x, y}
  // for the external test driver to click with real input events.
  window.__bgCoords = function (where) {
    const canvas = el.canvas;
    const r = canvas.getBoundingClientRect();
    const padX = 6, padY = 6;
    const boardW = r.width - 2 * padX;
    const boardH = r.height - 2 * padY;
    const frame = Math.max(6, Math.min(boardW, boardH) * 0.025);
    const barW = boardW * 0.07;
    const trayW = boardW * 0.08;
    const innerW = boardW - 2 * frame;
    const innerH = boardH - 2 * frame;
    const pointW = (innerW - barW - trayW) / 12;
    const pointH = innerH * 0.44;
    const left = padX + frame;
    const top = padY + frame;
    let x, y;
    if (where === 'bar') {
      x = left + pointW * 6 + barW / 2;
      y = top + innerH / 2;
    } else if (where === 'off') {
      x = left + pointW * 12 + barW + trayW / 2;
      y = top + innerH / 2;
    } else {
      const idx = Number(where);
      const persp = app.perspective;
      const slot = persp === 'p1'
        ? (idx >= 12 ? { row: 'top', col: idx - 12 } : { row: 'bottom', col: 11 - idx })
        : (idx >= 12 ? { row: 'bottom', col: 23 - idx } : { row: 'top', col: idx });
      const colOffset = slot.col < 6
        ? left + pointW * (slot.col + 0.5)
        : left + pointW * 6 + barW + pointW * (slot.col - 6 + 0.5);
      x = colOffset;
      y = slot.row === 'top' ? top + pointH / 2 : top + innerH - pointH / 2;
    }
    return { x: r.left + x, y: r.top + y };
  };
})();
