// Planet Game — test harness.
//
// CONTRACT: every input method in this file dispatches real DOM events on the
// same elements the game already listens to. It never reaches into the game's
// internal `state` object or calls game functions directly. Consequence:
// anything this harness can make happen, a user with a finger on iOS Safari
// can also make happen — and vice versa. Keep it that way.
//
// Reads come from the public DOM (HUD, log, pause button label). The game's
// `state` lives in a module closure and is not accessible from here, which
// enforces the contract by construction.
//
// Always loaded — the API is inert until called, so there's nothing to gate.
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const stageEl   = () => document.querySelector('.stage');
  const canvasEl  = () => $('planet');
  const pauseBtn  = () => $('pause-btn');

  // Geometry helpers — all based on getBoundingClientRect so they track
  // whatever the real layout is, exactly like a finger does.
  function planetGeom() {
    const rect = canvasEl().getBoundingClientRect();
    return {
      cx: rect.left + rect.width / 2,
      cy: rect.top + rect.height / 2,
      // Must match view.r in game.js: min(w,h) * 0.42
      r: Math.min(rect.width, rect.height) * 0.42,
      rect,
    };
  }

  // Dispatch a full pointer+mouse "tap" gesture. The game currently listens
  // on `click` only, but sending the whole sequence means any future
  // pointer/touch listeners also fire identically to a user gesture.
  function dispatchTap(target, clientX, clientY) {
    const base = {
      bubbles: true, cancelable: true, composed: true,
      clientX, clientY, screenX: clientX, screenY: clientY,
      button: 0, buttons: 1,
    };
    // Pointer sequence — pointerType:'touch' mirrors iOS Safari.
    target.dispatchEvent(new PointerEvent('pointerdown', { ...base, pointerType: 'touch', isPrimary: true, pressure: 0.5 }));
    target.dispatchEvent(new PointerEvent('pointerup',   { ...base, pointerType: 'touch', isPrimary: true, pressure: 0 }));
    // Mouse `click` — this is what the stage listener reads.
    target.dispatchEvent(new MouseEvent('click', base));
  }

  // --- Input API -----------------------------------------------------------

  // Tap at absolute viewport pixel coordinates. Use this when you already
  // have coordinates (e.g., from a snapshot or screenshot).
  function tapPixel(clientX, clientY) {
    dispatchTap(stageEl(), clientX, clientY);
  }

  // Tap at a polar offset from the planet center.
  //   rFrac  in [0, 1.15] — fraction of planet radius. > 1 = outside the disc
  //                         (useful for testing "missed tap" behavior).
  //   theta  in radians, 0 = east, -π/2 = north.
  function tapPolar(rFrac, theta) {
    const g = planetGeom();
    tapPixel(g.cx + Math.cos(theta) * g.r * rFrac,
             g.cy + Math.sin(theta) * g.r * rFrac);
  }

  // Tap at a cartesian offset from the planet center, expressed as
  // fractions of planet radius. (0, 0) = dead center, (1, 0) = east rim.
  function tapFrac(xFrac, yFrac) {
    const g = planetGeom();
    tapPixel(g.cx + xFrac * g.r, g.cy + yFrac * g.r);
  }

  // Toggle pause via the real button click path.
  function pressPause() {
    pauseBtn().dispatchEvent(new MouseEvent('click',
      { bubbles: true, cancelable: true, composed: true, button: 0 }));
  }

  // Dispatch a keydown (+keyup) on window, matching the game's listener.
  //   code:     KeyboardEvent.code  (e.g. 'Space', 'KeyP')
  //   keyValue: optional KeyboardEvent.key override (defaults sensibly)
  function key(code, keyValue) {
    const keyMap = { Space: ' ', KeyP: 'p' };
    const k = keyValue ?? keyMap[code] ?? code;
    const opts = { key: k, code, bubbles: true, cancelable: true };
    window.dispatchEvent(new KeyboardEvent('keydown', opts));
    window.dispatchEvent(new KeyboardEvent('keyup',   opts));
  }

  // --- Read API ------------------------------------------------------------

  function numOf(id) {
    const el = $(id);
    if (!el) return null;
    const n = Number(el.textContent);
    return Number.isFinite(n) ? n : null;
  }

  function getState() {
    const hint = $('tap-hint');
    return {
      stability:  numOf('stability-val'),
      pressure:   numOf('pressure-val'),
      influence:  numOf('influence-val'),
      age:        $('age')?.textContent ?? null,
      epoch:      $('epoch')?.textContent ?? null,
      faultCount: numOf('fault-count'),
      paused:     (pauseBtn().textContent || '').trim().toLowerCase() === 'resume',
      ready:      !!hint && hint.classList.contains('ready'),
      hint:       hint?.textContent ?? null,
    };
  }

  function getLog() {
    // textContent (not innerText) so collapsed <details> still surfaces the
    // log text; innerText returns "" when the ancestor is display:none.
    return Array.from(document.querySelectorAll('#log li')).map(li => ({
      text: (li.textContent || '').replace(/\s+/g, ' ').trim(),
      positive: !!li.querySelector('.good'),
      negative: !!li.querySelector('.bad'),
      eruption: !!li.querySelector('.eruption-tag'),
    }));
  }

  // Poll getState() until predicate(state) is truthy. Resolves with the
  // winning state, rejects with Error on timeout.
  function waitFor(predicate, { timeoutMs = 30000, pollMs = 100 } = {}) {
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      (function poll() {
        let s;
        try { s = getState(); } catch (e) { return reject(e); }
        if (predicate(s)) return resolve(s);
        if (Date.now() - t0 > timeoutMs) return reject(new Error('waitFor timed out'));
        setTimeout(poll, pollMs);
      })();
    });
  }

  // Convenience: resolves when a voluntary release becomes affordable.
  const waitUntilReady = (opts) => waitFor(s => s.ready, opts);

  // --- Export --------------------------------------------------------------

  // Recovery: clear the saved game and reload. The same thing a user can
  // do via DevTools; exposed here so automation and rescue both have one
  // obvious lever. Key must stay in sync with SAVE_KEY in game.js.
  function resetSave() {
    try { localStorage.removeItem('planet-game:save'); } catch (_) {}
    location.reload();
  }

  window.PlanetHarness = {
    tapPixel, tapPolar, tapFrac,
    pressPause, key,
    getState, getLog,
    waitFor, waitUntilReady,
    geom: planetGeom,
    resetSave,
  };
})();
