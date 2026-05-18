// UI wiring: lobby → waiting → playing.
// Owns all DOM interaction and connects peer + rules + board.
//
// v2 model: the two phones form ONE board. Host renders the LEFT half,
// guest the RIGHT half, local hotseat the full board. There is no
// per-player perspective flip. The host owns authoritative game state AND
// the current selection; both are broadcast. Every tap on either device is
// forwarded to the host as a raw intent (tap / tapDie / roll); the host
// attributes it to the current turn (trust model). Moves are committed by
// tap-source-then-tap-die: source + die deterministically picks the
// destination, so no cross-phone destination tapping is needed.
(() => {
  'use strict';

  const rules = window.BackgammonRules;
  const board = window.BackgammonBoard;
  const peer = window.BackgammonPeer;

  const app = {
    role: null,           // 'host' | 'guest' | 'local'
    side: null,           // 'left' (host) | 'right' (guest) | 'both' (local)
    state: null,
    selection: null,      // { source: idx|'bar' } | null  (host-authoritative)
    peerApi: null,
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
    btnShare: document.getElementById('btn-share'),
    shareLinkHint: document.getElementById('share-link-hint'),
    btnCancelHost: document.getElementById('btn-cancel-host'),
    canvas: document.getElementById('board'),
    youLabel: document.getElementById('you-label'),
    turnIndicator: document.getElementById('turn-indicator'),
    diceRow: document.getElementById('dice-row'),
    btnRoll: document.getElementById('btn-roll'),
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
    app.side = 'left';
    setStatus('connecting');

    app.peerApi = peer.createHost({
      onStatus: (s) => {
        setStatus(s);
        if (s === 'waiting') {
          el.roomCodeDisplay.textContent = app.peerApi.code;
          setupShareUI(app.peerApi.code);
          showScreen('waiting');
        }
      },
      onGuestJoined: () => {
        setState(rules.initialState(), null, { broadcast: true });
        enterGame();
      },
      onIntent: (msg) => applyIntentOnHost(msg),
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

  // --- Share invite (REQ-BG-013) ---

  function buildInviteURL(code) {
    const url = new URL(window.location.href);
    url.search = '?room=' + code;
    url.hash = '';
    return url.toString();
  }

  function setupShareUI(code) {
    const url = buildInviteURL(code);
    el.btnShare.dataset.url = url;
    el.btnShare.classList.remove('hidden');
    if (navigator.share) {
      el.btnShare.textContent = 'Share invite link';
      el.shareLinkHint.classList.add('hidden');
    } else {
      el.btnShare.textContent = 'Copy invite link';
      el.shareLinkHint.textContent = url;
      el.shareLinkHint.classList.remove('hidden');
    }
  }

  el.btnShare.addEventListener('click', async () => {
    const url = el.btnShare.dataset.url;
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Backgammon', text: 'Join my game', url });
      } catch (_) { /* user cancelled */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      const orig = el.btnShare.textContent;
      el.btnShare.textContent = 'Copied!';
      setTimeout(() => { el.btnShare.textContent = orig; }, 1500);
    } catch (_) { /* link is shown below the button as fallback */ }
  });

  // --- Lobby: local hotseat (full board on one device, solo playtest) ---

  el.btnLocal.addEventListener('click', () => {
    el.lobbyError.textContent = '';
    app.role = 'local';
    app.side = 'both';
    setStatus('idle');
    setState(rules.initialState(), null, { broadcast: false });
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
    app.side = 'right';
    setStatus('connecting');

    app.peerApi = peer.joinAsGuest(code, {
      onStatus: setStatus,
      onState: (state, selection) => {
        app.state = state;
        app.selection = selection || null;
        mirrorToDom();
        renderUi();
        render();
        if (el.screenGame.classList.contains('hidden')) enterGame();
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

  function enterGame() {
    el.youLabel.textContent = app.side === 'left'
      ? 'This phone — left half (P1 tray)'
      : app.side === 'right'
        ? 'This phone — right half (P2 tray)'
        : 'Hotseat — full board';
    showScreen('game');
    requestAnimationFrame(resizeAndRender);
  }

  // --- State management ---

  function setState(s, selection, { broadcast }) {
    app.state = s;
    app.selection = selection || null;
    if (broadcast && app.role === 'host' && app.peerApi) {
      app.peerApi.send({
        type: 'state',
        state: serializeState(s),
        selection: app.selection,
      });
    }
    mirrorToDom();
    renderUi();
    render();
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
    };
  }

  function mirrorToDom() {
    if (!app.state) return;
    document.body.dataset.bgState = JSON.stringify(serializeState(app.state));
    document.body.dataset.bgSide = app.side || '';
    document.body.dataset.bgSelected =
      app.selection && app.selection.source !== undefined && app.selection.source !== null
        ? String(app.selection.source) : '';
  }

  // --- Intents (host-authoritative) ---

  function forwardIntent(intent) {
    if (app.role === 'host' || app.role === 'local') {
      applyIntentOnHost({ type: 'intent', ...intent });
    } else if (app.peerApi) {
      app.peerApi.send({ type: 'intent', ...intent });
    }
  }

  function applyIntentOnHost(msg) {
    if (!app.state) return;
    try {
      if (msg.intent === 'roll') {
        if (app.state.phase !== 'roll') return;
        setState(rules.rollDice(app.state), null, { broadcast: true });
      } else if (msg.intent === 'tap') {
        applyTap(msg.loc);
      } else if (msg.intent === 'tapDie') {
        applyTapDie(msg.value);
      } else if (msg.intent === 'newGame') {
        setState(rules.initialState(), null, { broadcast: true });
      }
    } catch (e) {
      console.warn('[host] intent rejected:', e.message);
      if (app.peerApi) {
        app.peerApi.send({
          type: 'state',
          state: serializeState(app.state),
          selection: app.selection,
        });
      }
    }
  }

  // Tapping a location only ever (re)selects a source. 'off' (tray) is a
  // no-op so an accidental tray tap doesn't drop the current selection.
  function applyTap(loc) {
    if (app.state.phase !== 'move') return;
    if (loc === 'off') return;
    const player = app.state.turn;

    if (loc === null || loc === undefined) {
      setState(app.state, null, { broadcast: true });
      return;
    }

    if (loc === 'bar') {
      const ok = app.state.bar[player] > 0 &&
        rules.legalMovesFrom(app.state, 'bar').length > 0;
      setState(app.state, ok ? { source: 'bar' } : null, { broadcast: true });
      return;
    }

    if (typeof loc === 'number') {
      // Bar checkers must be entered before anything else can be selected.
      if (app.state.bar[player] > 0) {
        setState(app.state, null, { broadcast: true });
        return;
      }
      const sign = player === 'p1' ? 1 : -1;
      const ok = sign * app.state.board[loc] > 0 &&
        rules.legalMovesFrom(app.state, loc).length > 0;
      setState(app.state, ok ? { source: loc } : null, { broadcast: true });
      return;
    }

    setState(app.state, null, { broadcast: true });
  }

  function applyTapDie(value) {
    if (app.state.phase !== 'move') return;
    if (!app.selection) return;
    const moves = rules.legalMovesFrom(app.state, app.selection.source);
    const m = moves.find((mv) => mv.die === value);
    if (!m) return; // keep selection so another die can be tried
    const next = rules.applyMove(app.state, {
      from: app.selection.source, to: m.to, die: m.die,
    });
    setState(next, null, { broadcast: true });
  }

  // --- Render ---

  function render() {
    if (!app.state || !el.canvas || el.screenGame.classList.contains('hidden')) return;
    const { ctx } = board.resizeCanvas(el.canvas, app.side);
    board.renderBoard(ctx, app.state, app.side, { selection: app.selection });
  }

  function labelFor(p) {
    return p === 'p1' ? 'Player 1' : 'Player 2';
  }

  function renderUi() {
    if (!app.state) return;

    if (app.state.phase === 'gameover') {
      el.turnIndicator.textContent = `${labelFor(app.state.winner)} wins!`;
      el.turnIndicator.classList.remove('waiting');
      el.message.textContent = 'All 15 borne off. Nice game.';
      el.message.classList.add('win');
    } else {
      el.message.classList.remove('win');
      el.message.textContent = '';
      const verb = app.state.phase === 'roll' ? 'to roll' : 'to move';
      el.turnIndicator.textContent = `${labelFor(app.state.turn)} ${verb}`;
      el.turnIndicator.classList.remove('waiting');
    }

    renderDice();

    el.btnRoll.classList.toggle('hidden', app.state.phase !== 'roll');
    const canReset = app.role === 'host' || app.role === 'local';
    el.btnNew.classList.toggle('hidden', app.state.phase !== 'gameover' || !canReset);
  }

  function renderDice() {
    el.diceRow.innerHTML = '';
    const animate = app.state.rollSeq !== app.lastRollSeq && app.state.phase === 'move';
    app.lastRollSeq = app.state.rollSeq;
    if (!app.state.dice[0]) return;

    // Which die values are playable from the current selection?
    let playable = null;
    if (app.selection && app.state.phase === 'move') {
      playable = new Set(
        rules.legalMovesFrom(app.state, app.selection.source).map((m) => m.die)
      );
    }

    const isDoubles = app.state.dice[0] === app.state.dice[1];
    const total = isDoubles ? 4 : 2;
    const remaining = app.state.diceRemaining.slice();

    for (let i = 0; i < total; i++) {
      const value = isDoubles ? app.state.dice[0] : app.state.dice[i];
      const die = document.createElement('div');
      die.className = 'die';
      die.textContent = value;

      const idx = remaining.indexOf(value);
      const used = idx === -1;
      if (used) {
        die.classList.add('used');
      } else {
        remaining.splice(idx, 1);
      }
      if (!used && playable && playable.has(value)) die.classList.add('playable');
      if (animate) die.classList.add('rolling');

      if (!used) {
        die.addEventListener('click', () => forwardIntent({ intent: 'tapDie', value }));
      }
      el.diceRow.appendChild(die);
    }
  }

  // --- Canvas input ---

  el.canvas.addEventListener('click', (e) => {
    if (!app.state || app.state.phase !== 'move') return;
    const rect = el.canvas.getBoundingClientRect();
    const loc = board.hitTest(
      e.clientX - rect.left, e.clientY - rect.top,
      rect.width, rect.height, app.side
    );
    forwardIntent({ intent: 'tap', loc });
  });

  // --- Buttons ---

  el.btnRoll.addEventListener('click', () => forwardIntent({ intent: 'roll' }));
  el.btnNew.addEventListener('click', () => forwardIntent({ intent: 'newGame' }));

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

  (function tryAutoJoin() {
    const code = peer.normalizeCode(
      new URLSearchParams(window.location.search).get('room') || ''
    );
    if (code.length < 4) return;
    history.replaceState({}, '', window.location.pathname);
    startGuest(code);
  })();

  // --- Dev affordances (safe in production; not used by the app) ---

  window.__bg = app;
  window.__bgSetState = (s, sel) => setState(s, sel || null, { broadcast: false });

  // Page coords for a board location ('bar', 'off', or index 0..23) on the
  // current panel, so an external driver can click it with real input.
  window.__bgCoords = function (where) {
    const r = el.canvas.getBoundingClientRect();
    const side = app.side;
    const padX = 6, padY = 6;
    const boardW = r.width - 2 * padX;
    const boardH = r.height - 2 * padY;
    const frame = Math.max(6, Math.min(boardW, boardH) * 0.025);
    const innerW = boardW - 2 * frame;
    const innerH = boardH - 2 * frame;
    const nCols = side === 'both' ? 12 : 6;
    const nTrays = side === 'both' ? 2 : 1;
    const barW = innerW * (side === 'both' ? 0.05 : 0.07);
    const trayW = innerW * (side === 'both' ? 0.06 : 0.11);
    const pointW = (innerW - barW - nTrays * trayW) / nCols;
    const pointH = innerH * 0.44;
    const left = padX + frame;
    const top = padY + frame;

    let cols = [], barX, trayLeftX, trayRightX;
    if (side === 'left') {
      trayLeftX = left;
      const ps = left + trayW;
      for (let c = 0; c < 6; c++) cols.push(ps + pointW * (c + 0.5));
      barX = ps + pointW * 6;
    } else if (side === 'right') {
      barX = left;
      const ps = left + barW;
      for (let c = 0; c < 6; c++) cols.push(ps + pointW * (c + 0.5));
      trayRightX = ps + pointW * 6;
    } else {
      trayLeftX = left;
      const ps1 = left + trayW;
      for (let c = 0; c < 6; c++) cols.push(ps1 + pointW * (c + 0.5));
      barX = ps1 + pointW * 6;
      const ps2 = barX + barW;
      for (let c = 0; c < 6; c++) cols.push(ps2 + pointW * (c + 0.5));
      trayRightX = ps2 + pointW * 6;
    }

    let x, y;
    if (where === 'bar') {
      x = barX + barW / 2; y = top + innerH / 2;
    } else if (where === 'off') {
      const tx = trayLeftX !== undefined ? trayLeftX : trayRightX;
      x = tx + trayW / 2; y = top + innerH / 2;
    } else {
      const slot = board.slotForIndex(Number(where), side);
      if (!slot) return null;
      x = cols[slot.col];
      y = slot.row === 'top' ? top + pointH / 2 : top + innerH - pointH / 2;
    }
    return { x: r.left + x, y: r.top + y };
  };
})();
