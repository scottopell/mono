// Planet Game — MVP simulation
// See VISION.md for the design brief and Laws of the Game this implements.
//
// Law → code map:
//   I.   Time always passes        → setInterval(tick, TICK_MS) at bottom
//   II.  All change is permanent   → state.faults is append-only; epoch advance preserves it
//   III. Pressure always releases  → tick() auto-calls performRelease({auto:true}) at cap
//   IV.  Probabilistic outcomes    → performRelease() rolls in [floor, ceiling] scaled by P
//   V.   Complexity is generative  → faultDensityAtAngle() modulates each release's distribution:
//                                    virgin crust = tighter/safer, scarred = wider swing w/ neg drift
//   VI.  Stability is earned       → crossing STABILITY_GOAL advances epoch, faults carry forward
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

  // Law V tuning
  const DENSITY_SIGMA = 0.35;        // radians (~20°) — how wide each fault's influence spreads
  const DENSITY_SCARRING_CAP = 1.5;  // saturation point for "how scarred" this area is
  const HEATMAP_SAMPLES = 72;        // angular resolution of the scarring ring around the planet

  const state = {
    ageTicks: 0,
    pressure: 0,
    influence: 0,
    stability: 50,
    faults: [],
    epoch: 1,
    paused: false,
    log: [],
    lastTap: null,                   // {angle, density, bornAt} — preview marker on the planet
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
    pauseBtn: $('pause-btn'),
    log: $('log'),
    logCount: $('log-count'),
    stage: document.querySelector('.stage'),
    hint: $('tap-hint'),
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

  // Law V — how scarred is the crust at this angle?
  // Gaussian sum over existing faults weighted by severity.
  // 0 = virgin; saturates around DENSITY_SCARRING_CAP for very crowded zones.
  function faultDensityAtAngle(angle) {
    const s2 = DENSITY_SIGMA * DENSITY_SIGMA;
    let d = 0;
    for (const f of state.faults) {
      let diff = f.angle - angle;
      diff = ((diff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      d += f.severity * Math.exp(-(diff * diff) / s2);
    }
    return d;
  }

  function releaseBounds(pressure, density, auto = false) {
    const P = pressure;
    const scarring = clamp(density, 0, DENSITY_SCARRING_CAP) / DENSITY_SCARRING_CAP; // 0..1

    // Virgin crust: narrow band, positive drift. Scarred crust: wider band, negative drift.
    const widthMult = 0.55 + scarring * 1.15;
    const meanShift = (1 - scarring) * (P / 40) - scarring * (P / 25);

    let floor = meanShift - (P / 10) * widthMult;
    let ceiling = meanShift + (P / 7) * widthMult;

    if (auto) {
      floor *= 1.5;
      ceiling *= 0.55;
      floor -= AUTO_RELEASE_PENALTY * P / 8;
    }
    return { floor, ceiling, scarring };
  }

  function tick() {
    if (state.paused) return;
    state.ageTicks += 1;

    const dt = TICK_MS / 1000;
    state.pressure = clamp(state.pressure + PRESSURE_RATE * dt, 0, 100);

    const pressureBonus = 1 + state.pressure / 200;
    state.influence += INFLUENCE_BASE * dt * pressureBonus;

    if (state.pressure >= 99.99) {
      // Unforced discharge: angle is random (you didn't choose)
      performRelease({ auto: true, angle: Math.random() * Math.PI * 2 });
    }
  }

  function performRelease({ auto = false, angle = null } = {}) {
    if (!auto && state.influence < RELEASE_COST) return;
    if (!auto) state.influence -= RELEASE_COST;

    const a = angle != null ? angle : Math.random() * Math.PI * 2;
    const P = state.pressure;
    const density = faultDensityAtAngle(a);
    const { floor, ceiling, scarring } = releaseBounds(P, density, auto);

    const roll = Math.random();
    const delta = floor + roll * (ceiling - floor);
    state.stability = clamp(state.stability + delta, 0, 100);

    const severity = clamp(P / 100, 0.08, 1);
    state.faults.push({
      angle: a,
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
      scarring,
    });

    state.lastTap = { angle: a, density, bornAt: state.ageTicks };

    if (state.stability >= STABILITY_GOAL && state.epoch < 10) {
      state.epoch += 1;
      state.stability = 55;
      pushLog({
        ageTicks: state.ageTicks,
        epochEnter: state.epoch,
      });
    }

    flashStage();
  }

  function flashStage() {
    els.stage.animate(
      [{ filter: 'brightness(1.5)' }, { filter: 'brightness(1)' }],
      { duration: 260, easing: 'ease-out' }
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

  function zoneLabel(scarring) {
    if (scarring < 0.15) return 'virgin';
    if (scarring < 0.5) return 'worn';
    return 'scarred';
  }

  function renderLog() {
    els.log.innerHTML = state.log.map((e) => {
      if (e.epochEnter) {
        return `<li><span class="age">${formatAge(e.ageTicks)}</span>— Epoch <strong>${romanEpoch(e.epochEnter)}</strong> begins. Geology carries forward.</li>`;
      }
      const sign = e.delta >= 0 ? '+' : '';
      const cls = e.delta >= 0 ? 'good' : 'bad';
      const tag = e.auto ? ' <em>(unforced)</em>' : '';
      const zone = e.scarring != null ? ` <span class="zone">${zoneLabel(e.scarring)}</span>` : '';
      return `<li><span class="age">${formatAge(e.ageTicks)}</span>Release at P${e.P}${zone} → stability <span class="${cls}">${sign}${e.delta.toFixed(1)}</span>${tag}</li>`;
    }).join('');
    if (els.logCount) els.logCount.textContent = state.log.length ? String(state.log.length) : '';
  }

  function drawScarringRing() {
    const { cx, cy, r } = view;
    const inner = r * 1.02;
    const outer = r * 1.11;
    const step = (Math.PI * 2) / HEATMAP_SAMPLES;

    for (let i = 0; i < HEATMAP_SAMPLES; i++) {
      const a = i * step;
      const density = faultDensityAtAngle(a);
      const scarring = clamp(density, 0, DENSITY_SCARRING_CAP) / DENSITY_SCARRING_CAP;
      if (scarring < 0.02) continue;

      const alpha = 0.15 + scarring * 0.55;
      const hue = 30 - scarring * 30; // yellow → red
      ctx.beginPath();
      ctx.arc(cx, cy, (inner + outer) / 2, a - step * 0.55, a + step * 0.55);
      ctx.strokeStyle = `hsla(${hue}, 70%, ${45 + scarring * 20}%, ${alpha})`;
      ctx.lineWidth = outer - inner;
      ctx.stroke();
    }
  }

  function drawLastTap() {
    if (!state.lastTap) return;
    const { cx, cy, r } = view;
    const age = state.ageTicks - state.lastTap.bornAt;
    const life = Math.max(0, 1 - age / 18);
    if (life <= 0) { state.lastTap = null; return; }

    const a = state.lastTap.angle;
    const x = cx + Math.cos(a) * r * 1.18;
    const y = cy + Math.sin(a) * r * 1.18;
    ctx.save();
    ctx.strokeStyle = `rgba(240, 220, 180, ${0.8 * life})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 6 + (1 - life) * 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlanet() {
    const { w, h, cx, cy, r } = view;
    ctx.clearRect(0, 0, w, h);

    const bgGrad = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 2.2);
    bgGrad.addColorStop(0, 'rgba(40,50,70,0.15)');
    bgGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    drawScarringRing();

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

    drawLastTap();
  }

  function updateHint() {
    if (!els.hint) return;
    const ready = state.influence >= RELEASE_COST;
    if (ready) {
      els.hint.textContent = `tap the planet to release — aim for virgin crust`;
      els.hint.classList.add('ready');
    } else {
      const pct = Math.floor((state.influence / RELEASE_COST) * 100);
      els.hint.textContent = `accumulating influence… ${pct}%`;
      els.hint.classList.remove('ready');
    }
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

    updateHint();
  }

  function frame() {
    drawPlanet();
    renderHUD();
    requestAnimationFrame(frame);
  }

  function angleFromPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const dx = x - view.cx;
    const dy = y - view.cy;
    const dist2 = dx * dx + dy * dy;
    const maxR = view.r * 1.15;
    if (dist2 > maxR * maxR) return null;
    return Math.atan2(dy, dx);
  }

  function handleStageTap(e) {
    const point = e.changedTouches ? e.changedTouches[0] : e;
    const angle = angleFromPoint(point.clientX, point.clientY);
    if (angle == null) return;
    performRelease({ auto: false, angle });
  }

  els.stage.addEventListener('click', handleStageTap);
  els.pauseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    state.paused = !state.paused;
    els.pauseBtn.textContent = state.paused ? 'Resume' : 'Pause';
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      performRelease({ auto: false, angle: Math.random() * Math.PI * 2 });
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
