// Planet Game — events-not-ticks rewrite, Phase 1 (rip-out + data model).
// See spec.allium for the target domain shape and ROADMAP.md for the slice plan.
//
// Phase 1 strips the old Pressure/Volcanic mechanics and installs the new
// state arrays (events / features / scars) plus epochAnchor. The game loads
// without errors but taps are no-ops — Phase 2 wires up event spawning and
// the handle-event tap path.
//
// Surviving infrastructure:
//   - Time loop (driveLoop + MAX_CATCHUP_MS catchup, Law I)
//   - Terrain bake + epoch palette tinting (Law II / VI)
//   - Charged-tap UX (CHARGE_TIERS, drawChargeIndicator) — reframed in Phase 2
//   - localStorage persistence (SAVE_VERSION bumped to 2; v1 saves drop)
(() => {
  'use strict';

  const TICK_MS = 100;
  const INFLUENCE_BASE = 0.9;        // influence per second
  const RELEASE_COST = 10;           // influence spent per voluntary release (Normal tier)
  const STABILITY_GOAL = 100;        // crossing this advances the epoch (Law VI)

  // Charged release tiers — hold the tap longer to pour more Will into the
  // release. Multiplier scales the delta on BOTH sides: a Deep tap on
  // virgin crust is a big win; a Deep tap on scarred crust is a big loss.
  // Ground choice matters more when you're charged. Hold thresholds are
  // in milliseconds; the pie-chart indicator shows progress.
  const CHARGE_TIERS = [
    { label: 'Normal',  holdMs: 0,    will: 10,  mult: 1 },
    { label: 'Focused', holdMs: 400,  will: 50,  mult: 2 },
    { label: 'Deep',    holdMs: 1000, will: 100, mult: 3 },
  ];
  const CHARGE_MAX_MS = 1300;        // past this the ring is full; no further tier

  // Time-flow tuning (Law I)
  const MAX_CATCHUP_MS = 10 * 60 * 1000; // cap offline catchup at 10 minutes of sim-time

  // Law V tuning — density is now 2D, measured at the actual release point
  const DENSITY_SIGMA = 0.3;         // fraction of planet radius — how wide each fault's influence spreads
  const DENSITY_SCARRING_CAP = 1.5;  // saturation point for "how scarred" this area is
  const HEATMAP_SAMPLES = 72;        // angular resolution of the scarring ring around the planet

  // Terrain tuning — same seed across epochs (Law II: persistent world)
  const TERRAIN_RES = 512;           // offscreen noise buffer resolution (square)
  const NOISE_SCALE = 3.2;           // continents per planet width
  const NOISE_OCTAVES = 4;

  // Law VI — each epoch has a name and a palette shift applied at bake time.
  // Same seed, same continents, different mood: Hadean is red and molten,
  // Cambrian is cool and aqueous, Stillness is pale and crystalline. The
  // arc is 10 beats — molten youth → crystalline rest.
  //
  // tint = [rMul, gMul, bMul, whiteBlend]:
  //   - rMul/gMul/bMul are multiplied into the shaded base RGB
  //   - whiteBlend in [0,1] lifts the result toward white at the end
  //     (pure multiplication can't brighten dark oceans toward "pale")
  const EPOCHS = [
    { name: 'Hadean',        tint: [1.55, 0.55, 0.42, 0.00] },
    { name: 'Archean',       tint: [0.75, 0.90, 0.70, 0.00] },
    { name: 'Proterozoic',   tint: [0.72, 1.05, 1.25, 0.00] },
    { name: 'Cambrian',      tint: [0.60, 1.05, 1.35, 0.05] },
    { name: 'Carboniferous', tint: [0.60, 1.35, 0.75, 0.00] },
    { name: 'Mesozoic',      tint: [1.35, 1.05, 0.55, 0.08] },
    { name: 'Cenozoic',      tint: [0.92, 1.10, 1.00, 0.05] },
    { name: 'Anthropocene',  tint: [1.20, 0.92, 0.75, 0.10] },
    { name: 'Twilight',      tint: [0.85, 0.72, 1.18, 0.00] },
    { name: 'Stillness',     tint: [1.15, 1.15, 1.30, 0.45] },
  ];
  const MAX_EPOCH = EPOCHS.length;
  const epochInfo = (n) => EPOCHS[clamp(n, 1, MAX_EPOCH) - 1];

  const SAVE_KEY = 'planet-game:save';
  const SAVE_VERSION = 2;
  const SAVE_INTERVAL_MS = 1000;

  const state = {
    ageTicks: 0,
    influence: 0,
    stability: 50,
    events: [],          // {kind, x, y, spawnedAt, lifetime, status: 'active'}
    features: [],        // {kind, x, y, quality, bornInEpoch}
    scars: [],           // {x, y, damage, bornInEpoch, sourceEvent: null}
    epochAnchor: 50,
    epoch: 1,
    paused: false,
    log: [],
    planetSeed: (Math.random() * 0xffffffff) >>> 0,
  };

  function persistState() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: SAVE_VERSION,
        planetSeed: state.planetSeed,
        ageTicks: state.ageTicks,
        influence: state.influence,
        stability: state.stability,
        epoch: state.epoch,
        events: state.events,
        features: state.features,
        scars: state.scars,
        epochAnchor: state.epochAnchor,
        log: state.log,
      }));
    } catch (_) {
      // localStorage unavailable (private mode, quota, disabled) — fail silent.
    }
  }

  function loadSavedState() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      if (!saved || saved.v !== SAVE_VERSION) return null;
      return saved;
    } catch (_) {
      return null;
    }
  }

  function applySavedState(saved) {
    state.planetSeed  = (saved.planetSeed >>> 0) || state.planetSeed;
    state.ageTicks    = Math.max(0, saved.ageTicks | 0);
    state.influence   = Math.max(0, Number(saved.influence) || 0);
    state.stability   = Math.max(0, Math.min(100, Number(saved.stability) || 50));
    state.epoch       = clamp(saved.epoch | 0, 1, MAX_EPOCH);
    state.events      = Array.isArray(saved.events) ? saved.events : [];
    state.features    = Array.isArray(saved.features) ? saved.features : [];
    state.scars       = Array.isArray(saved.scars) ? saved.scars : [];
    state.epochAnchor = Number.isFinite(saved.epochAnchor) ? saved.epochAnchor : 50;
    state.log         = Array.isArray(saved.log) ? saved.log : [];
  }

  const $ = (id) => document.getElementById(id);
  const els = {
    stabilityVal: $('stability-val'),
    stabilityFill: $('stability-fill'),
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

  function romanEpoch(n) {
    const numerals = ['I','II','III','IV','V','VI','VII','VIII','IX','X'];
    return numerals[n - 1] || String(n);
  }

  // Scar density at a 2D point (formerly faultDensityAt — repurposed in
  // Phase 2 of the events-not-ticks rewrite). Gaussian sum over existing
  // scars weighted by damage and Euclidean distance in normalized planet
  // coordinates (x,y ∈ roughly [-1, 1]). 0 = virgin; saturates around
  // DENSITY_SCARRING_CAP for very crowded zones. Currently unused; Phase 2
  // will wire it into spawn-bias logic for BuildingPlume events.
  function scarDensityAt(x, y) {
    const s2 = DENSITY_SIGMA * DENSITY_SIGMA;
    let d = 0;
    for (const s of state.scars) {
      const dx = s.x - x;
      const dy = s.y - y;
      d += s.damage * Math.exp(-(dx * dx + dy * dy) / s2);
    }
    return d;
  }

  // Uniform random point on the planet disk.
  function randomDiskPoint() {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random());
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  }

  // Deterministic integer-lattice hash → [0, 1). Seeded so the same planet
  // recurs across epochs / reloads-within-a-session, honoring Law II.
  // Math.imul keeps every step in signed-32-bit space — plain `*` would
  // overflow Number.MAX_SAFE_INTEGER for larger seeds and desync the noise.
  function hash2(ix, iy, seed) {
    let h = Math.imul(ix | 0, 374761393);
    h = (h + Math.imul(iy | 0, 668265263)) | 0;
    h = (h + Math.imul(seed | 0, 1274126177)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967296;
  }

  function smoothstep(t) { return t * t * (3 - 2 * t); }

  function valueNoise(x, y, seed) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const a = hash2(xi,     yi,     seed);
    const b = hash2(xi + 1, yi,     seed);
    const c = hash2(xi,     yi + 1, seed);
    const d = hash2(xi + 1, yi + 1, seed);
    const u = smoothstep(xf);
    const v = smoothstep(yf);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  function fbm(x, y, seed) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < NOISE_OCTAVES; i++) {
      sum += amp * valueNoise(x * freq, y * freq, seed + i * 131);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }

  // Elevation → RGB palette. Biomes are ordered so continents sit above
  // sea level and peaks cap out in pale rock.
  function heightToColor(h) {
    if (h < 0.40) return [22, 42, 78];     // deep ocean
    if (h < 0.47) return [38, 72, 112];    // shelf
    if (h < 0.50) return [72, 110, 138];   // shallows
    if (h < 0.53) return [148, 134, 94];   // beach
    if (h < 0.62) return [82, 112, 70];    // plains
    if (h < 0.72) return [100, 110, 60];   // hills
    if (h < 0.82) return [126, 100, 76];   // mountain flank
    return [205, 196, 178];                // peaks
  }

  // Offscreen canvas holding the planet's surface. Baked once (per seed),
  // blitted per-frame — no per-frame noise sampling.
  let terrainCanvas = null;

  function bakeTerrain() {
    const c = document.createElement('canvas');
    c.width = TERRAIN_RES;
    c.height = TERRAIN_RES;
    const tctx = c.getContext('2d');
    const img = tctx.createImageData(TERRAIN_RES, TERRAIN_RES);
    const data = img.data;
    const seed = state.planetSeed;
    const half = TERRAIN_RES / 2;
    // Law VI — epoch tint recolors the same seeded terrain. Continents stay
    // put; the mood shifts.
    const [tr, tg, tb, tw] = epochInfo(state.epoch).tint;

    for (let py = 0; py < TERRAIN_RES; py++) {
      for (let px = 0; px < TERRAIN_RES; px++) {
        const nx = (px - half) / half; // [-1, 1]
        const ny = (py - half) / half;
        const idx = (py * TERRAIN_RES + px) * 4;
        const d2 = nx * nx + ny * ny;
        if (d2 > 1) { data[idx + 3] = 0; continue; }

        // Pull elevation down near the rim so oceans fringe the disc —
        // continents read as a planet, not a square noise patch.
        const rimPull = 0.28 * d2 * d2;
        const h = fbm(nx * NOISE_SCALE, ny * NOISE_SCALE, seed) - rimPull;

        // Directional lighting: top-left lit, bottom-right shaded.
        const light = 0.55 - nx * 0.32 - ny * 0.42;
        const shade = Math.max(0.42, Math.min(1.08, 0.78 + light * 0.55));

        // Limb darkening: subtle falloff near the circumference adds sphericality.
        const limb = 1 - 0.28 * d2;

        const [r, g, b] = heightToColor(h);
        const k = shade * limb;
        const rr = r * k * tr, gg = g * k * tg, bb = b * k * tb;
        const inv = 1 - tw;
        data[idx]     = Math.min(255, rr * inv + 255 * tw);
        data[idx + 1] = Math.min(255, gg * inv + 255 * tw);
        data[idx + 2] = Math.min(255, bb * inv + 255 * tw);
        data[idx + 3] = 255;
      }
    }
    tctx.putImageData(img, 0, 0);
    terrainCanvas = c;
  }

  function tick() {
    if (state.paused) return;
    state.ageTicks += 1;

    const dt = TICK_MS / 1000;
    state.influence += INFLUENCE_BASE * dt;
  }

  // Epoch advance — kept here so Phase 4 can wire it back in once stability
  // becomes derived from features/scars. Currently unreferenced.
  function maybeAdvanceEpoch() {
    if (state.stability >= STABILITY_GOAL && state.epoch < MAX_EPOCH) {
      state.epoch += 1;
      state.stability = 55;
      bakeTerrain(); // Law VI: epoch tint shifts, same continents
      pushLog({
        ageTicks: state.ageTicks,
        epochEnter: state.epoch,
      });
    }
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
        const name = epochInfo(e.epochEnter).name;
        return `<li><span class="age">${formatAge(e.ageTicks)}</span>— The <strong>${name}</strong> begins. Your memory carries forward.</li>`;
      }
      const sign = e.delta >= 0 ? '+' : '';
      const cls = e.delta >= 0 ? 'good' : 'bad';
      const autoTag = e.auto ? ' <span class="eruption-tag">unforced</span>' : '';
      // Tier tag — only show for Focused/Deep; Normal is the default and
      // doesn't need to crowd the log.
      const tierTag = (e.tier && e.tier !== 'Normal')
        ? ` <span class="tier-tag tier-${e.tier.toLowerCase()}">${e.tier.toLowerCase()}</span>` : '';
      if (e.volcanic) {
        const vLabel = e.auto ? 'Hotspot burst' : 'Vented';
        return `<li><span class="age">${formatAge(e.ageTicks)}</span>${vLabel} at V${e.V}${tierTag} <span class="volcanic-tag">volcanic</span> → stability <span class="${cls}">${sign}${e.delta.toFixed(1)}</span>${autoTag}</li>`;
      }
      const label = e.auto ? 'Erupted' : 'Released';
      const zone = e.scarring != null ? ` <span class="zone">${zoneLabel(e.scarring)}</span>` : '';
      return `<li><span class="age">${formatAge(e.ageTicks)}</span>${label} at P${e.P}${zone}${tierTag} → stability <span class="${cls}">${sign}${e.delta.toFixed(1)}</span>${autoTag}</li>`;
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

    // Terrain: baked offscreen noise blitted into the disc. Clipping keeps
    // the square source image from bleeding outside the sphere silhouette.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    if (terrainCanvas) {
      ctx.drawImage(terrainCanvas, cx - r, cy - r, r * 2, r * 2);
    } else {
      ctx.fillStyle = '#1a1f2c';
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }

    // Scars — placeholder rendering until Phase 3 redoes geology visuals
    // properly. Each scar is a simple dark dot scaled by its damage. Phase 2
    // will populate state.scars from auto-resolved events; here we just
    // ensure existing scar data renders without crashing.
    for (const s of state.scars) {
      const px = cx + s.x * r;
      const py = cy + s.y * r;
      const dot = Math.max(2, Math.min(6, (s.damage || 1) * 0.6));
      ctx.fillStyle = 'rgba(15, 12, 10, 0.85)';
      ctx.beginPath();
      ctx.arc(px, py, dot, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Subtle epoch rim — keeps the silhouette legible against the background.
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    drawChargeIndicator();
  }

  // Pie-chart charge ring — appears at the pointerdown location and fills
  // clockwise as the player holds. Three tick marks on the outer edge
  // show tier thresholds (Normal / Focused / Deep). Color ramps cooler→
  // warmer as hold progresses so you can feel the tier shift peripherally.
  function drawChargeIndicator() {
    if (!activeCharge) return;
    const { cx, cy, r } = view;
    const px = cx + activeCharge.x * r;
    const py = cy + activeCharge.y * r;
    const heldMs = performance.now() - activeCharge.startedMs;
    const progress = clamp(heldMs / CHARGE_MAX_MS, 0, 1);
    const tier = tierFromHold(heldMs);
    const ringR = Math.max(24, r * 0.12);
    const twoPi = Math.PI * 2;
    const start = -Math.PI / 2; // 12 o'clock

    // Not enough Will for even Normal — show a brief text cue at the tap
    // point and bail. No ring (a ring would misleadingly suggest the
    // hold is doing something).
    if (!tier) {
      const need = CHARGE_TIERS[0].will;
      const fontSize = Math.max(12, Math.round(r * 0.065));
      ctx.save();
      ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      for (const [ox, oy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        ctx.fillText(`need ${need} will`, px + ox, py + oy);
      }
      ctx.fillStyle = 'rgba(240, 180, 170, 0.95)';
      ctx.fillText(`need ${need} will`, px, py);
      ctx.restore();
      return;
    }

    ctx.save();

    // Unfilled track — subtle dark halo so the fill has contrast.
    ctx.strokeStyle = 'rgba(10, 12, 18, 0.55)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(px, py, ringR, 0, twoPi);
    ctx.stroke();

    // Filled arc — hue slides from tan through amber to hot red as progress climbs.
    const hue = 42 - progress * 30;                   // 42 (tan) → 12 (red-orange)
    const sat = 30 + progress * 60;                   // 30 → 90
    const light = 62 + progress * 4;
    ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, 0.95)`;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(px, py, ringR, start, start + progress * twoPi);
    ctx.stroke();

    // Tier tick marks — small outward notches on the ring where each
    // tier kicks in. Highlights the current one.
    for (let i = 1; i < CHARGE_TIERS.length; i++) {
      const t = CHARGE_TIERS[i];
      const frac = t.holdMs / CHARGE_MAX_MS;
      const ang = start + frac * twoPi;
      const x0 = px + Math.cos(ang) * (ringR - 4);
      const y0 = py + Math.sin(ang) * (ringR - 4);
      const x1 = px + Math.cos(ang) * (ringR + 6);
      const y1 = py + Math.sin(ang) * (ringR + 6);
      const reached = heldMs >= t.holdMs;
      ctx.strokeStyle = reached
        ? 'rgba(255, 220, 180, 0.95)'
        : 'rgba(220, 210, 190, 0.35)';
      ctx.lineWidth = reached ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }

    // Tier label — floats under the ring so you can read the current mode.
    const fontSize = Math.max(12, Math.round(r * 0.075));
    ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const label = `${tier.label.toLowerCase()} · ${tier.will} will`;
    const ty = py + ringR + 10;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    for (const [ox, oy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      ctx.fillText(label, px + ox, ty + oy);
    }
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${Math.min(92, light + 25)}%, 1)`;
    ctx.fillText(label, px, ty);

    ctx.restore();
  }

  function updateHint() {
    if (!els.hint) return;
    const ready = state.influence >= RELEASE_COST;
    els.hint.classList.toggle('ready', ready);
    els.hint.classList.remove('urgent');

    if (ready) {
      els.hint.textContent = 'awaiting events — taps do nothing yet (Phase 2)';
    } else {
      const pct = Math.floor((state.influence / RELEASE_COST) * 100);
      els.hint.textContent = `gathering will… ${pct}%`;
    }
  }

  function renderHUD() {
    els.stabilityVal.textContent = Math.round(state.stability);
    els.stabilityFill.style.width = `${state.stability}%`;

    els.influenceVal.textContent = Math.floor(state.influence);
    els.influenceFill.style.width = `${clamp(state.influence, 0, 100)}%`;

    els.age.textContent = formatAge(state.ageTicks);
    els.epoch.textContent = `${romanEpoch(state.epoch)} · ${epochInfo(state.epoch).name}`;
    if (els.faultCount) els.faultCount.textContent = state.scars.length;

    updateHint();
  }

  function frame() {
    drawPlanet();
    renderHUD();
    requestAnimationFrame(frame);
  }

  // Returns the tap location in normalized planet coordinates (x,y each in
  // roughly [-1, 1]), or null if the tap missed. Taps slightly outside the
  // disc are clamped to the rim so edge-targeting stays forgiving.
  function pointFromClient(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const dx = (clientX - rect.left) - view.cx;
    const dy = (clientY - rect.top) - view.cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxR = view.r * 1.15;
    if (dist > maxR) return null;
    if (dist > view.r) {
      const s = view.r / dist;
      return { x: (dx / view.r) * s, y: (dy / view.r) * s };
    }
    return { x: dx / view.r, y: dy / view.r };
  }

  // Charge tracking — ephemeral UI state, not persisted. Records the tap
  // location at pointerdown; pointerup reads the elapsed time and picks
  // the highest tier the player can afford.
  let activeCharge = null; // { x, y, startedMs, pointerId }

  function tierFromHold(heldMs) {
    // Walk the tier table from highest to lowest and pick the first one
    // whose threshold we've crossed AND the player can afford. Returns
    // null if the player cannot afford any tier (including Normal), so
    // the caller can suppress the release and surface a clear "need N"
    // cue instead of silently no-opping inside the tap-resolution path.
    for (let i = CHARGE_TIERS.length - 1; i >= 0; i--) {
      const t = CHARGE_TIERS[i];
      if (heldMs >= t.holdMs && state.influence >= t.will) return t;
    }
    return null;
  }

  function resolveTap(px, py, tier) {
    // Phase 1 stub — tap routing is no-op until Phase 2 wires up event hit-testing.
    return null;
  }

  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return; // left/primary only
    // Ignore additional pointerdowns while a charge is already in flight,
    // otherwise multi-touch (or an accidental double-press) would orphan
    // the first pointer's capture and leave activeCharge in a bad state.
    if (activeCharge) return;
    const p = pointFromClient(e.clientX, e.clientY);
    if (!p) return;
    // setPointerCapture so pointerup always lands on this element even if
    // the finger drifts off the canvas during the hold.
    try { els.stage.setPointerCapture(e.pointerId); } catch (_) {}
    activeCharge = {
      x: p.x, y: p.y,
      startedMs: performance.now(),
      pointerId: e.pointerId,
    };
    e.preventDefault();
  }

  function onPointerUp(e) {
    if (!activeCharge || e.pointerId !== activeCharge.pointerId) return;
    const held = performance.now() - activeCharge.startedMs;
    const { x, y } = activeCharge;
    activeCharge = null;
    try { els.stage.releasePointerCapture(e.pointerId); } catch (_) {}
    const tier = tierFromHold(held);
    resolveTap(x, y, tier);
  }

  function onPointerCancel(e) {
    if (!activeCharge || e.pointerId !== activeCharge.pointerId) return;
    activeCharge = null;
    try { els.stage.releasePointerCapture(e.pointerId); } catch (_) {}
  }

  els.stage.addEventListener('pointerdown', onPointerDown);
  els.stage.addEventListener('pointerup', onPointerUp);
  els.stage.addEventListener('pointercancel', onPointerCancel);
  els.pauseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    state.paused = !state.paused;
    els.pauseBtn.textContent = state.paused ? 'Resume' : 'Pause';
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'p' || e.key === 'P') {
      els.pauseBtn.click();
    }
  });

  const ro = new ResizeObserver(sizeCanvas);
  ro.observe(canvas);
  window.addEventListener('orientationchange', () => setTimeout(sizeCanvas, 100));

  // Law I — time always passes. setInterval alone gets throttled (or halted)
  // in backgrounded tabs, so we drive simulation from real wall-clock deltas
  // and catch up missed ticks when the tab wakes up. MAX_CATCHUP_MS caps the
  // backlog so returning after hours doesn't stall the frame.
  let lastLoopMs = performance.now();
  let accumulatorMs = 0;

  function driveLoop() {
    const now = performance.now();
    const elapsed = now - lastLoopMs;
    lastLoopMs = now;
    if (state.paused) return;
    accumulatorMs += Math.min(elapsed, MAX_CATCHUP_MS);
    if (accumulatorMs > MAX_CATCHUP_MS) accumulatorMs = MAX_CATCHUP_MS;
    while (accumulatorMs >= TICK_MS) {
      tick();
      accumulatorMs -= TICK_MS;
    }
  }

  // Restore save (if any) before anything reads planetSeed or draws the HUD.
  const savedState = loadSavedState();
  if (savedState) applySavedState(savedState);
  renderLog();

  sizeCanvas();
  bakeTerrain();
  setInterval(driveLoop, TICK_MS);
  setInterval(persistState, SAVE_INTERVAL_MS);

  // Also persist on the events most likely to precede a reload/tab-close,
  // so nothing is lost between the periodic saves. pagehide is what iOS
  // Safari actually fires (beforeunload is unreliable there).
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) persistState();
    else driveLoop();
  });
  window.addEventListener('pagehide', persistState);
  window.addEventListener('beforeunload', persistState);

  requestAnimationFrame(frame);
})();
