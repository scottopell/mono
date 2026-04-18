// Planet Game — MVP simulation
// See VISION.md for the design brief and Laws of the Game this implements.
//
// Law → code map:
//   I.  Time always passes        → setInterval(tick, TICK_MS) at bottom
//   II. All change is permanent   → state.faults is append-only; epoch advance preserves it
//   III. Pressure always releases → tick() auto-calls performRelease({auto:true}) at cap
//   IV. Probabilistic outcomes    → performRelease() rolls in [floor, ceiling] scaled by P
//   V.  Complexity is generative  → (not yet wired — future: prior faults modulate roll)
//   VI. Stability is earned       → crossing STABILITY_GOAL advances epoch, faults carry forward
//
// Tuning constants are grouped below. Tweak freely; no magic numbers hide in the body.
(() => {
  'use strict';

  const TICK_MS = 100;
  const PRESSURE_RATE = 0.45;        // pressure units per second
  const INFLUENCE_BASE = 0.9;        // influence per second, scales w/ pressure
  const RELEASE_COST = 10;           // influence spent per voluntary release
  const AUTO_RELEASE_PENALTY = 0.35; // extra downward bias on unforced discharge (Law III)
  const STABILITY_GOAL = 100;        // crossing this advances the epoch (Law VI)

  const state = {
    ageTicks: 0,
    pressure: 0,
    influence: 0,
    stability: 50,
    faults: [],
    epoch: 1,
    paused: false,
    log: [],
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    stabilityVal: $('stability-val'),
    stabilityFill: $('stability-fill'),
    pressureVal: $('pressure-val'),
    pressureFill: $('pressure-fill'),
    influenceVal: $('influence-val'),
    influenceFill: $('influence-fill'),
    age: $('age'),
    epoch: $('epoch'),
    faultCount: $('fault-count'),
    releaseBtn: $('release-btn'),
    releaseCost: $('release-cost'),
    pauseBtn: $('pause-btn'),
    log: $('log'),
    logCount: $('log-count'),
    stage: document.querySelector('.stage'),
  };

  const canvas = $('planet');
  const ctx = canvas.getContext('2d');
  const view = { w: 0, h: 0, cx: 0, cy: 0, r: 0, dpr: 1 };

  function sizeCanvas() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(200, rect.width);
    const cssH = Math.max(200, rect.height);

    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    view.dpr = dpr;
    view.w = cssW;
    view.h = cssH;
    view.cx = cssW / 2;
    view.cy = cssH / 2;
    view.r = Math.min(cssW, cssH) * 0.42;
  }

  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const randRange = (lo, hi) => lo + Math.random() * (hi - lo);

  function romanEpoch(n) {
    const numerals = ['I','II','III','IV','V','VI','VII','VIII','IX','X'];
    return numerals[n - 1] || String(n);
  }

  function tick() {
    if (state.paused) return;
    state.ageTicks += 1;

    const dt = TICK_MS / 1000;
    state.pressure = clamp(state.pressure + PRESSURE_RATE * dt, 0, 100);

    const pressureBonus = 1 + state.pressure / 200;
    state.influence += INFLUENCE_BASE * dt * pressureBonus;

    if (state.pressure >= 99.99) {
      performRelease({ auto: true });
    }
  }

  function performRelease({ auto = false } = {}) {
    if (!auto && state.influence < RELEASE_COST) return;
    if (!auto) state.influence -= RELEASE_COST;

    const P = state.pressure;
    const variance = P / 100;

    let floor = -P / 10;
    let ceiling = P / 7;
    if (auto) {
      floor *= 1.6;
      ceiling *= 0.6;
    }

    const roll = Math.random();
    const delta = floor + roll * (ceiling - floor) + (auto ? -AUTO_RELEASE_PENALTY * P / 10 : 0);
    state.stability = clamp(state.stability + delta, 0, 100);

    const angle = Math.random() * Math.PI * 2;
    const severity = clamp(variance, 0.08, 1);
    state.faults.push({
      angle,
      lengthFrac: (20 + severity * 110) / 260,
      widthFrac: (1 + severity * 2.8) / 260,
      offsetFrac: randRange(-0.35, 0.35),
      severity,
      positive: delta >= 0,
      auto,
      bornAt: state.ageTicks,
    });

    state.pressure = 0;
    pushLog({
      ageTicks: state.ageTicks,
      P: Math.round(P),
      delta,
      auto,
    });

    if (state.stability >= STABILITY_GOAL && state.epoch < 10) {
      state.epoch += 1;
      state.stability = 55;
      pushLog({
        ageTicks: state.ageTicks,
        epochEnter: state.epoch,
      });
    }

    flashReleaseButton();
  }

  function flashReleaseButton() {
    els.stage.animate(
      [{ filter: 'brightness(1.4)' }, { filter: 'brightness(1)' }],
      { duration: 240, easing: 'ease-out' }
    );
  }

  function pushLog(entry) {
    state.log.unshift(entry);
    if (state.log.length > 40) state.log.pop();
    renderLog();
  }

  function formatAge(t) {
    const seconds = Math.floor(t * TICK_MS / 1000);
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m${s.toString().padStart(2, '0')}s`;
  }

  function renderLog() {
    els.log.innerHTML = state.log.map((e) => {
      if (e.epochEnter) {
        return `<li><span class="age">${formatAge(e.ageTicks)}</span>— Epoch <strong>${romanEpoch(e.epochEnter)}</strong> begins. Geology carries forward.</li>`;
      }
      const sign = e.delta >= 0 ? '+' : '';
      const cls = e.delta >= 0 ? 'good' : 'bad';
      const tag = e.auto ? ' <em>(unforced)</em>' : '';
      return `<li><span class="age">${formatAge(e.ageTicks)}</span>Release at pressure ${e.P} → stability <span class="${cls}">${sign}${e.delta.toFixed(1)}</span>${tag}</li>`;
    }).join('');
    if (els.logCount) els.logCount.textContent = state.log.length ? String(state.log.length) : '';
  }

  function drawPlanet() {
    const { w, h, cx, cy, r } = view;
    ctx.clearRect(0, 0, w, h);

    const bgGrad = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 2.2);
    bgGrad.addColorStop(0, 'rgba(40,50,70,0.15)');
    bgGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    const planetGrad = ctx.createRadialGradient(
      cx - r * 0.35, cy - r * 0.35, r * 0.1,
      cx, cy, r
    );
    planetGrad.addColorStop(0, '#3a4052');
    planetGrad.addColorStop(0.55, '#262b38');
    planetGrad.addColorStop(1, '#121520');
    ctx.fillStyle = planetGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    const scale = r / 150;
    for (const f of state.faults) {
      const ageTicks = state.ageTicks - f.bornAt;
      const freshness = Math.max(0, 1 - ageTicks / 600);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(f.angle);

      const length = f.lengthFrac * 260 * scale;
      const width = Math.max(1, f.widthFrac * 260 * scale);
      const offset = f.offsetFrac * r;
      const halfLen = length / 2;
      const x0 = offset - halfLen;
      const x1 = offset + halfLen;
      const baseHue = f.positive ? 140 : 10;
      const sat = 30 + f.severity * 40;
      const light = 35 + freshness * 25;

      ctx.strokeStyle = `hsla(${baseHue}, ${sat}%, ${light}%, ${0.5 + 0.4 * freshness})`;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, 0);
      ctx.lineTo(x1, 0);
      ctx.stroke();

      if (f.auto) {
        ctx.strokeStyle = `hsla(10, 70%, 50%, ${0.3 * freshness})`;
        ctx.lineWidth = width + 2;
        ctx.stroke();
      }

      ctx.restore();
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    const pressureAlpha = state.pressure / 100;
    const pulse = 0.85 + 0.15 * Math.sin(state.ageTicks * 0.08);
    const glow = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r);
    glow.addColorStop(0, 'rgba(200,90,62,0)');
    glow.addColorStop(1, `rgba(230,90,62,${0.55 * pressureAlpha * pulse})`);
    ctx.fillStyle = glow;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = `rgba(255,255,255,${0.06 + 0.08 * pressureAlpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function renderHUD() {
    els.stabilityVal.textContent = Math.round(state.stability);
    els.stabilityFill.style.width = `${state.stability}%`;

    els.pressureVal.textContent = Math.round(state.pressure);
    els.pressureFill.style.width = `${state.pressure}%`;

    els.influenceVal.textContent = Math.floor(state.influence);
    els.influenceFill.style.width = `${clamp(state.influence, 0, 100)}%`;

    els.age.textContent = formatAge(state.ageTicks);
    els.epoch.textContent = romanEpoch(state.epoch);
    els.faultCount.textContent = state.faults.length;

    els.releaseBtn.disabled = state.influence < RELEASE_COST;
    els.releaseCost.textContent = RELEASE_COST;
  }

  function frame() {
    drawPlanet();
    renderHUD();
    requestAnimationFrame(frame);
  }

  function handleStageTap(e) {
    const rect = canvas.getBoundingClientRect();
    const point = e.changedTouches ? e.changedTouches[0] : e;
    const x = point.clientX - rect.left;
    const y = point.clientY - rect.top;
    const dx = x - view.cx;
    const dy = y - view.cy;
    if (dx * dx + dy * dy <= view.r * view.r * 1.05) {
      performRelease({ auto: false });
    }
  }

  els.stage.addEventListener('click', handleStageTap);
  els.releaseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    performRelease({ auto: false });
  });
  els.pauseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    state.paused = !state.paused;
    els.pauseBtn.textContent = state.paused ? 'Resume' : 'Pause';
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      performRelease({ auto: false });
    }
    if (e.key === 'p' || e.key === 'P') {
      els.pauseBtn.click();
    }
  });

  const ro = new ResizeObserver(sizeCanvas);
  ro.observe(canvas);
  window.addEventListener('orientationchange', () => setTimeout(sizeCanvas, 100));

  sizeCanvas();
  setInterval(tick, TICK_MS);
  requestAnimationFrame(frame);
})();
