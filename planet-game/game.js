// Planet Game — MVP simulation
// See VISION.md for the design brief and Laws of the Game this implements.
//
// Law → code map:
//   I.   Time always passes        → driveLoop() uses performance.now() deltas +
//                                    visibilitychange catchup, so time advances even while
//                                    the tab is backgrounded or the browser throttles timers.
//   II.  All change is permanent   → state.faults is append-only; epoch advance preserves it.
//                                    state.planetSeed fixes the terrain so the same world
//                                    carries forward across epochs. Full state is serialized
//                                    to localStorage (key "planet-game:save") on a 1s cadence
//                                    plus pagehide/beforeunload/visibilitychange, so reloads
//                                    don't wipe history.
//   III. Pressure always releases  → tick() auto-calls performRelease({auto:true}) at cap
//   IV.  Probabilistic outcomes    → performRelease() rolls in [floor, ceiling] scaled by P
//   V.   Complexity is generative  → faultDensityAt(x,y) modulates each release's distribution:
//                                    virgin crust = tighter/safer, scarred = wider swing w/ neg drift.
//                                    Positive deltas render as ridges, negative as canyons, so the
//                                    map encodes the release history geologically.
//   VI.  Stability is earned       → crossing STABILITY_GOAL advances epoch, faults carry forward
//
// Tuning constants are grouped below. Tweak freely; no magic numbers hide in the body.
(() => {
  'use strict';

  const TICK_MS = 100;
  const PRESSURE_RATE = 0.45;        // pressure units per second
  const INFLUENCE_BASE = 0.9;        // influence per second, scales w/ pressure
  const RELEASE_COST = 10;           // influence spent per voluntary release (Normal tier)
  const AUTO_RELEASE_PENALTY = 0.35; // extra downward bias on unforced discharge (Law III)
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

  // Volcanic axis — the second pressure system, inverse to tectonic in every
  // meaningful way. Tectonic releases CREATE scars; volcanic releases HEAL
  // them. Volcanic pressure builds faster the more scarred the planet is,
  // so scarring stops being purely bad: it fuels the repair cycle. Without
  // scars there are no hotspots, and volcanism has nowhere to vent.
  const VOLCANIC_BASE_RATE = 0.04;       // baseline V-per-second on pristine crust
  const VOLCANIC_PER_FAULT = 0.035;      // extra V/s per tracked fault
  const VOLCANIC_FAULT_CAP = 50;         // saturates rate at this many faults
  const VOLCANIC_MIN_RELEASE = 30;       // min V needed for a manual vent
  const VOLCANIC_RESURFACE_RADIUS = 0.28;// normalized — how far resurfacing reaches
  const VOLCANIC_RESURFACE_STRENGTH = 0.65; // 0..1 — how much nearby scarring fades
  const VOLCANIC_PRUNE_SEVERITY = 0.06;  // faults below this after resurfacing are removed
  const HOTSPOT_DENSITY_MIN = 0.55;      // crust density above this qualifies as a hotspot
  const HOTSPOT_MAX = 6;                 // UI clarity cap — don't litter with dots
  const HOTSPOT_GRID = 14;               // scan resolution for hotspot search
  const HOTSPOT_HIT_R = 0.11;            // normalized tap radius for hotspot hit-testing


  const SAVE_KEY = 'planet-game:save';
  const SAVE_VERSION = 1;
  const SAVE_INTERVAL_MS = 1000;

  const state = {
    ageTicks: 0,
    pressure: 0,
    volcanic: 0,
    influence: 0,
    stability: 50,
    faults: [],
    epoch: 1,
    paused: false,
    log: [],
    lastTap: null,                   // {x, y, density, bornAt} — preview marker on the planet
    planetSeed: (Math.random() * 0xffffffff) >>> 0,
  };

  function persistState() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: SAVE_VERSION,
        planetSeed: state.planetSeed,
        ageTicks: state.ageTicks,
        pressure: state.pressure,
        volcanic: state.volcanic,
        influence: state.influence,
        stability: state.stability,
        epoch: state.epoch,
        faults: state.faults,
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
    state.planetSeed = (saved.planetSeed >>> 0) || state.planetSeed;
    state.ageTicks   = Math.max(0, saved.ageTicks | 0);
    state.pressure   = Math.max(0, Math.min(100, Number(saved.pressure) || 0));
    state.volcanic   = Math.max(0, Math.min(100, Number(saved.volcanic) || 0));
    state.influence  = Math.max(0, Number(saved.influence) || 0);
    state.stability  = Math.max(0, Math.min(100, Number(saved.stability) || 50));
    state.epoch      = clamp(saved.epoch | 0, 1, MAX_EPOCH);
    state.faults     = Array.isArray(saved.faults) ? saved.faults : [];
    state.log        = Array.isArray(saved.log) ? saved.log : [];
  }

  const $ = (id) => document.getElementById(id);
  const els = {
    stabilityVal: $('stability-val'),
    stabilityFill: $('stability-fill'),
    pressureVal: $('pressure-val'),
    pressureFill: $('pressure-fill'),
    volcanicVal: $('volcanic-val'),
    volcanicFill: $('volcanic-fill'),
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

  // Law V — how scarred is the crust at this 2D point?
  // Gaussian sum over existing faults weighted by severity and Euclidean distance
  // in normalized planet coordinates (x,y ∈ roughly [-1, 1]).
  // 0 = virgin; saturates around DENSITY_SCARRING_CAP for very crowded zones.
  function faultDensityAt(x, y) {
    const s2 = DENSITY_SIGMA * DENSITY_SIGMA;
    let d = 0;
    for (const f of state.faults) {
      const dx = f.x - x;
      const dy = f.y - y;
      d += f.severity * Math.exp(-(dx * dx + dy * dy) / s2);
    }
    return d;
  }

  // Hotspots — places where scarring has clustered enough that the mantle
  // finds a path up. Recomputed whenever faults change (release, resurface,
  // epoch advance), not per-frame. We scan a coarse grid, keep points above
  // HOTSPOT_DENSITY_MIN, and prune neighbors so dots don't crowd.
  let hotspotsCache = [];
  function refreshHotspots() {
    const candidates = [];
    const step = 2 / HOTSPOT_GRID;
    for (let i = -HOTSPOT_GRID; i <= HOTSPOT_GRID; i++) {
      for (let j = -HOTSPOT_GRID; j <= HOTSPOT_GRID; j++) {
        const x = i / HOTSPOT_GRID;
        const y = j / HOTSPOT_GRID;
        if (x * x + y * y > 0.85) continue; // keep hotspots off the rim
        const d = faultDensityAt(x, y);
        if (d >= HOTSPOT_DENSITY_MIN) candidates.push({ x, y, d });
      }
    }
    candidates.sort((a, b) => b.d - a.d);
    const picked = [];
    const minSep2 = (step * 2.5) * (step * 2.5);
    for (const c of candidates) {
      const tooClose = picked.some(p => {
        const dx = p.x - c.x, dy = p.y - c.y;
        return (dx * dx + dy * dy) < minSep2;
      });
      if (!tooClose) picked.push(c);
      if (picked.length >= HOTSPOT_MAX) break;
    }
    hotspotsCache = picked;
  }

  function findHotspotAt(px, py) {
    const r2 = HOTSPOT_HIT_R * HOTSPOT_HIT_R;
    let best = null, bestD = Infinity;
    for (const h of hotspotsCache) {
      const dx = h.x - px, dy = h.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < r2 && d2 < bestD) { best = h; bestD = d2; }
    }
    return best;
  }

  function volcanicRate() {
    const n = Math.min(state.faults.length, VOLCANIC_FAULT_CAP);
    return VOLCANIC_BASE_RATE + VOLCANIC_PER_FAULT * n;
  }

  // Uniform random point on the planet disk (for unforced discharges
  // and keyboard-space releases that lack a pointer location).
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
    state.volcanic = clamp(state.volcanic + volcanicRate() * dt, 0, 100);

    const pressureBonus = 1 + state.pressure / 200;
    state.influence += INFLUENCE_BASE * dt * pressureBonus;

    if (state.pressure >= 99.99) {
      // Unforced discharge: location is random (you didn't choose)
      const p = randomDiskPoint();
      performRelease({ auto: true, x: p.x, y: p.y });
    }
    if (state.volcanic >= 99.99) {
      // Volcanism needs a hotspot to vent. If there isn't one (pristine
      // crust), the heat simmers just short of peak — it can't go anywhere.
      const target = hotspotsCache[0];
      if (target) {
        performVolcanicRelease({ auto: true, x: target.x, y: target.y });
      } else {
        state.volcanic = 95;
      }
    }
  }

  function performRelease({ auto = false, x = null, y = null, tier = CHARGE_TIERS[0] } = {}) {
    const { will, mult } = tier;
    if (!auto && state.influence < will) return;
    if (!auto) state.influence -= will;

    let px = x, py = y;
    if (px == null || py == null) {
      const p = randomDiskPoint();
      px = p.x;
      py = p.y;
    }

    const P = state.pressure;
    const density = faultDensityAt(px, py);
    const { floor, ceiling, scarring } = releaseBounds(P, density, auto);

    const roll = Math.random();
    const rawDelta = floor + roll * (ceiling - floor);
    const delta = auto ? rawDelta : rawDelta * mult;
    state.stability = clamp(state.stability + delta, 0, 100);

    const severity = clamp(P / 100, 0.08, 1);
    // Kept for scar rendering: radial orientation and distance-from-center
    // are derived from the tap point rather than randomized.
    const angle = Math.atan2(py, px);
    const offsetFrac = Math.sqrt(px * px + py * py);
    state.faults.push({
      x: px,
      y: py,
      angle,
      lengthFrac: (20 + severity * 110) / 260,
      widthFrac: (1 + severity * 2.8) / 260,
      offsetFrac,
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
      tier: auto ? null : tier.label,
    });

    // Feedback marker — the ring AND the floating delta number. Players
    // need to see cause/effect at the moment of release: the planet
    // responded *here*, with *this much* stability change.
    state.lastTap = {
      x: px, y: py, density,
      delta, auto,
      bornAt: state.ageTicks,
    };

    refreshHotspots();
    maybeAdvanceEpoch();
    flashStage();
  }

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

  // Volcanic release — the mirror of performRelease. Requires a hotspot
  // target (existing or forced) and enough V built up. Creates a positive
  // volcanic ridge at the vent site AND resurfaces nearby faults, so the
  // planet gains stability AND heals simultaneously. This is what makes
  // scarring worth having: it's fuel for the repair cycle.
  function performVolcanicRelease({ auto = false, x, y, tier = CHARGE_TIERS[0] } = {}) {
    if (x == null || y == null) return false;
    const { will, mult } = tier;
    if (!auto) {
      if (state.volcanic < VOLCANIC_MIN_RELEASE) return false;
      if (state.influence < will) return false;
      state.influence -= will;
    }

    const V = state.volcanic;
    // Positive delta scaled by V. Manual vents carry a patience bonus;
    // auto eruptions are louder but less useful (Law III — unchosen hurts).
    // Charged vents apply the same tier multiplier as tectonic releases.
    const base = V / 11;                          // ~9 at V=100
    const variance = 0.4 + Math.random() * 0.55;  // 0.4..0.95
    let delta = base * variance;
    if (auto) delta *= 0.35;
    else delta *= mult;
    state.stability = clamp(state.stability + delta, 0, 100);

    // New volcanic ridge — always positive, always bright. Tagged so the
    // renderer can distinguish it from tectonic scars.
    const severity = clamp(V / 100, 0.25, 1);
    const angle = Math.atan2(y, x);
    const offsetFrac = Math.sqrt(x * x + y * y);
    state.faults.push({
      x, y, angle,
      lengthFrac: (30 + severity * 90) / 260,
      widthFrac: (2 + severity * 3) / 260,
      offsetFrac,
      severity,
      positive: true,
      auto,
      volcanic: true,
      bornAt: state.ageTicks,
    });

    // Resurface nearby scars — radially weighted fade. Prune what's left
    // below threshold so the repair feels real (fault count drops).
    const newest = state.faults[state.faults.length - 1];
    const r2 = VOLCANIC_RESURFACE_RADIUS * VOLCANIC_RESURFACE_RADIUS;
    for (const f of state.faults) {
      if (f === newest) continue;
      const dx = f.x - x, dy = f.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r2) continue;
      const nearness = 1 - d2 / r2;            // 0..1 with 1 at center
      f.severity *= 1 - nearness * VOLCANIC_RESURFACE_STRENGTH;
    }
    state.faults = state.faults.filter(f =>
      f === newest || f.severity > VOLCANIC_PRUNE_SEVERITY);

    state.volcanic = 0;

    pushLog({
      ageTicks: state.ageTicks,
      volcanic: true,
      V: Math.round(V),
      delta,
      auto,
      tier: auto ? null : tier.label,
    });

    state.lastTap = {
      x, y,
      density: faultDensityAt(x, y),
      delta, auto,
      volcanic: true,
      bornAt: state.ageTicks,
    };

    refreshHotspots();
    maybeAdvanceEpoch();
    flashStage();
    return true;
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

  function drawScarringRing() {
    const { cx, cy, r } = view;
    const inner = r * 1.02;
    const outer = r * 1.11;
    const step = (Math.PI * 2) / HEATMAP_SAMPLES;

    for (let i = 0; i < HEATMAP_SAMPLES; i++) {
      const a = i * step;
      // Sample 2D density at the planet rim; interior-only scars fade naturally.
      const density = faultDensityAt(Math.cos(a), Math.sin(a));
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
    const LIFETIME = 28;               // ticks (~2.8s at 100ms/tick)
    const life = Math.max(0, 1 - age / LIFETIME);
    if (life <= 0) { state.lastTap = null; return; }

    const px = cx + state.lastTap.x * r;
    const py = cy + state.lastTap.y * r;
    const { delta, auto } = state.lastTap;

    ctx.save();

    // Expanding ring — color encodes which system fired:
    //   volcanic auto = red-orange burst
    //   volcanic manual = warm orange vent
    //   tectonic auto = red eruption
    //   tectonic manual = warm tan release
    const { volcanic } = state.lastTap;
    const ringColor = volcanic
      ? (auto ? `rgba(255, 120, 60, ${0.8 * life})` : `rgba(255, 175, 95, ${0.85 * life})`)
      : (auto ? `rgba(230, 95, 70, ${0.75 * life})` : `rgba(240, 220, 180, ${0.8 * life})`);
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, 6 + (1 - life) * 18, 0, Math.PI * 2);
    ctx.stroke();

    // Floating delta number — drifts upward and fades. Green = positive,
    // red = negative. This is the single most important bit of feedback
    // in the whole game: did my tap help or hurt?
    if (typeof delta === 'number') {
      const rise = (1 - life) * 32;
      const fontSize = Math.max(22, Math.round(r * 0.14));
      const sign = delta >= 0 ? '+' : '';
      const txt = `${sign}${delta.toFixed(1)}`;
      const good = delta >= 0;
      // Ease the fade so the number stays readable for most of its life.
      const textAlpha = Math.min(1, life * 1.6);
      const tx = px;
      const ty = py - 18 - rise;
      ctx.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      // Black outline via 4-directional offset — legible on any terrain tone.
      ctx.fillStyle = `rgba(0, 0, 0, ${0.75 * textAlpha})`;
      for (const [ox, oy] of [[-2,0],[2,0],[0,-2],[0,2],[1,1],[-1,-1]]) {
        ctx.fillText(txt, tx + ox, ty + oy);
      }
      ctx.fillStyle = good
        ? `rgba(140, 230, 160, ${textAlpha})`
        : `rgba(240, 115, 105, ${textAlpha})`;
      ctx.fillText(txt, tx, ty);
    }

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

    // Faults — positive releases render as bright ridges (mountains),
    // negative as shadowed trenches (canyons). Two strokes per fault fake
    // a shaded profile on flat 2D canvas.
    const scale = r / 150;
    for (const f of state.faults) {
      const ageTicks = state.ageTicks - f.bornAt;
      const freshness = Math.max(0, 1 - ageTicks / 600);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(f.angle);

      const length = f.lengthFrac * 260 * scale;
      const baseWidth = Math.max(1.5, f.widthFrac * 260 * scale);
      const offset = f.offsetFrac * r;
      const halfLen = length / 2;
      const x0 = offset - halfLen;
      const x1 = offset + halfLen;

      ctx.lineCap = 'round';

      if (f.positive) {
        // Shadow slab (casts toward the unlit side of the feature).
        ctx.strokeStyle = `hsla(25, 30%, 12%, ${0.55 * (0.55 + 0.45 * freshness)})`;
        ctx.lineWidth = baseWidth * 1.9;
        ctx.beginPath();
        ctx.moveTo(x0, baseWidth * 0.45);
        ctx.lineTo(x1, baseWidth * 0.45);
        ctx.stroke();
        // Volcanic ridges are warmer and glow hotter when young; tectonic
        // ridges stay neutral tan. Easy to tell lava from mountain.
        const ridgeHue = f.volcanic ? 15 : 40;
        const ridgeSat = f.volcanic ? 65 : 22;
        const ridgeLight = f.volcanic ? (68 - 6 * (1 - freshness)) : (72 - 8 * (1 - freshness));
        ctx.strokeStyle = `hsla(${ridgeHue}, ${ridgeSat}%, ${ridgeLight}%, ${0.75 + 0.2 * freshness})`;
        ctx.lineWidth = baseWidth * 0.75;
        ctx.beginPath();
        ctx.moveTo(x0, -baseWidth * 0.25);
        ctx.lineTo(x1, -baseWidth * 0.25);
        ctx.stroke();
      } else {
        // Canyon depth (dark floor).
        ctx.strokeStyle = `hsla(18, 55%, 10%, ${0.65 + 0.25 * freshness})`;
        ctx.lineWidth = baseWidth * 1.5;
        ctx.beginPath();
        ctx.moveTo(x0, 0);
        ctx.lineTo(x1, 0);
        ctx.stroke();
        // Lit upper rim.
        ctx.strokeStyle = `hsla(35, 22%, 62%, ${0.45 * freshness + 0.2})`;
        ctx.lineWidth = baseWidth * 0.45;
        ctx.beginPath();
        ctx.moveTo(x0, -baseWidth * 0.8);
        ctx.lineTo(x1, -baseWidth * 0.8);
        ctx.stroke();
      }

      if (f.auto) {
        ctx.strokeStyle = `hsla(10, 70%, 45%, ${0.28 * freshness})`;
        ctx.lineWidth = baseWidth * 2.4;
        ctx.beginPath();
        ctx.moveTo(x0, 0);
        ctx.lineTo(x1, 0);
        ctx.stroke();
      }

      ctx.restore();
    }
    ctx.restore();

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

    drawHotspots();
    drawLastTap();
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

  function drawHotspots() {
    if (!hotspotsCache.length) return;
    const { cx, cy, r } = view;
    const volcAlpha = clamp(state.volcanic / VOLCANIC_MIN_RELEASE, 0.25, 1);
    const phase = state.ageTicks * 0.08;

    // Clip to the planet disc — hotspots near the rim have glow radii
    // larger than the remaining margin, and without a clip the fillRect
    // would bleed outside the silhouette.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    for (const h of hotspotsCache) {
      const px = cx + h.x * r;
      const py = cy + h.y * r;
      // Each hotspot pulses at a slightly offset phase so they don't blink
      // in lockstep — feels alive rather than mechanical.
      const phaseOffset = h.x * 3.7 + h.y * 5.1;
      const pulse = 0.65 + 0.35 * Math.sin(phase + phaseOffset);
      const size = 4 + 4 * pulse;

      // Outer glow — radial gradient so it fades into the crust.
      const glow = ctx.createRadialGradient(px, py, 0, px, py, size * 3.5);
      glow.addColorStop(0, `rgba(255, 150, 70, ${0.55 * volcAlpha * pulse})`);
      glow.addColorStop(0.5, `rgba(255, 100, 40, ${0.25 * volcAlpha * pulse})`);
      glow.addColorStop(1, 'rgba(255, 100, 40, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(px - size * 3.5, py - size * 3.5, size * 7, size * 7);

      // Core dot — solid and bright enough to tap on.
      ctx.fillStyle = `rgba(255, 200, 120, ${0.85 * volcAlpha})`;
      ctx.beginPath();
      ctx.arc(px, py, size * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function updateHint() {
    if (!els.hint) return;
    const ready = state.influence >= RELEASE_COST;
    const urgent = state.pressure >= 85;
    els.hint.classList.toggle('ready', ready && !urgent);
    els.hint.classList.toggle('urgent', urgent);

    const volcReady = state.volcanic >= VOLCANIC_MIN_RELEASE && hotspotsCache.length > 0 && ready;
    // When Will stockpiles past the Focused threshold, signal that holding
    // pays off. Past Deep, suggest the heaviest tier.
    const canFocus = state.influence >= CHARGE_TIERS[1].will;
    const canDeep  = state.influence >= CHARGE_TIERS[2].will;

    if (urgent && ready) {
      els.hint.textContent = 'pressure cresting — choose where to let it go';
    } else if (urgent) {
      const pct = Math.floor((state.influence / RELEASE_COST) * 100);
      els.hint.textContent = `pressure cresting — will ${pct}% (it will erupt without you)`;
    } else if (volcReady) {
      els.hint.textContent = 'a hotspot glows — tap to vent and heal the scars around it';
    } else if (canDeep) {
      els.hint.textContent = 'hold to focus — release deep for a heavier tap';
    } else if (canFocus) {
      els.hint.textContent = 'hold the tap a beat longer for a focused release';
    } else if (ready) {
      els.hint.textContent = 'focus the pressure — smooth crust feels steadier';
    } else {
      const pct = Math.floor((state.influence / RELEASE_COST) * 100);
      els.hint.textContent = `gathering will… ${pct}%`;
    }
  }

  function renderHUD() {
    els.stabilityVal.textContent = Math.round(state.stability);
    els.stabilityFill.style.width = `${state.stability}%`;

    els.pressureVal.textContent = Math.round(state.pressure);
    els.pressureFill.style.width = `${state.pressure}%`;

    els.volcanicVal.textContent = Math.round(state.volcanic);
    els.volcanicFill.style.width = `${state.volcanic}%`;

    els.influenceVal.textContent = Math.floor(state.influence);
    els.influenceFill.style.width = `${clamp(state.influence, 0, 100)}%`;

    els.age.textContent = formatAge(state.ageTicks);
    els.epoch.textContent = `${romanEpoch(state.epoch)} · ${epochInfo(state.epoch).name}`;
    els.faultCount.textContent = state.faults.length;

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
    // cue instead of silently no-opping inside performRelease.
    for (let i = CHARGE_TIERS.length - 1; i >= 0; i--) {
      const t = CHARGE_TIERS[i];
      if (heldMs >= t.holdMs && state.influence >= t.will) return t;
    }
    return null;
  }

  function resolveTap(px, py, tier) {
    if (!tier) return null;
    // If the tap lands on a hotspot AND volcanic is charged, route volcanic.
    // Falls through to tectonic otherwise so the hotspot overlay doesn't
    // dead-zone half the planet.
    const hit = findHotspotAt(px, py);
    if (hit && state.volcanic >= VOLCANIC_MIN_RELEASE && state.influence >= tier.will) {
      return performVolcanicRelease({ auto: false, x: hit.x, y: hit.y, tier });
    }
    return performRelease({ auto: false, x: px, y: py, tier });
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
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      // No pointer info from the keyboard — pick a random disk point.
      const p = randomDiskPoint();
      performRelease({ auto: false, x: p.x, y: p.y });
    }
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
  refreshHotspots(); // restore hotspot positions for any loaded faults
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
