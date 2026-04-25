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

  // Phase 2: events not ticks — discrete map phenomena that ripen visibly
  const MAX_ACTIVE_EVENTS = 5;          // queue cap; spawning pauses when full (Phase 2). Background scars (queue-full → scar drop) is Phase 4 scope.
  const SPAWN_INTERVAL_MIN_MS = 30 * 1000;  // shortest gap between spawns
  const SPAWN_INTERVAL_MAX_MS = 60 * 1000;  // longest gap between spawns
  const MINOR_EVENT_LIFETIME_MIN_MS = 45 * 1000;
  const MINOR_EVENT_LIFETIME_MAX_MS = 120 * 1000;
  const SCAR_DAMAGE_MIN = 3;            // damage applied when an event auto-resolves
  const SCAR_DAMAGE_MAX = 10;

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
    lastSpawnAt: 0,                  // ms timestamp of most recent spawn
    nextSpawnIntervalMs: 0,          // randomised interval until next spawn attempt
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
        lastSpawnAt: state.lastSpawnAt,
        nextSpawnIntervalMs: state.nextSpawnIntervalMs,
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
    state.lastSpawnAt = Number.isFinite(saved.lastSpawnAt) ? saved.lastSpawnAt : 0;
    state.nextSpawnIntervalMs = Number.isFinite(saved.nextSpawnIntervalMs) ? saved.nextSpawnIntervalMs : 0;
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

  // Inclusive-min / exclusive-max float in [min, max). Used for randomised
  // spawn intervals and event lifetimes — anywhere we want a uniform
  // pick in a tunable window without pulling in a full RNG abstraction.
  function pickRandomInRange(min, max) {
    return min + Math.random() * (max - min);
  }

  // Choose a position on the planet disk for a new event. If any scars
  // exist, bias toward already-scarred regions (the spec's hint that the
  // map should "telegraph" future events). Otherwise fall back to uniform.
  //
  // Strategy: draw K=8 candidate points uniformly on the disc; weight each
  // by scarDensityAt(x, y) + 0.1 (the +0.1 floor keeps virgin crust in
  // play so spawning never starves on a lightly-scarred map); then pick
  // weighted-randomly. Phase 2 only uses StressedFault, which is naturally
  // scar-attracted; later kinds (BuildingPlume, etc.) will swap in their
  // own bias functions.
  function pickSpawnPosition() {
    if (state.scars.length === 0) return randomDiskPoint();
    const K = 8;
    const candidates = [];
    let total = 0;
    for (let i = 0; i < K; i++) {
      const p = randomDiskPoint();
      const w = scarDensityAt(p.x, p.y) + 0.1;
      candidates.push({ p, w });
      total += w;
    }
    let pick = Math.random() * total;
    for (const c of candidates) {
      pick -= c.w;
      if (pick <= 0) return c.p;
    }
    return candidates[candidates.length - 1].p;
  }

  // Spawn a new active event on the planet. Honours the queue cap; updates
  // the spawn-cadence bookkeeping so the next attempt waits a fresh
  // randomised interval. Phase 2 ships StressedFault only; the spec lists
  // five more kinds (BuildingPlume, Orogeny, Supervolcano, Rifting,
  // GlacialAdvance) for later phases.
  function spawnEvent() {
    if (state.events.length >= MAX_ACTIVE_EVENTS) return;
    const pos = pickSpawnPosition();
    const lifetime = pickRandomInRange(MINOR_EVENT_LIFETIME_MIN_MS, MINOR_EVENT_LIFETIME_MAX_MS);
    state.events.push({
      kind: 'StressedFault',     // only event type in PR 1; v1 spec lists 5 more for later phases
      x: pos.x,
      y: pos.y,
      spawnedAt: performance.now(),
      lifetime,
      status: 'active',
    });
    state.lastSpawnAt = performance.now();
    state.nextSpawnIntervalMs = pickRandomInRange(SPAWN_INTERVAL_MIN_MS, SPAWN_INTERVAL_MAX_MS);
  }

  // Event ripeness in [0, 1]. 0 = just spawned, 1 = ready to auto-resolve.
  // Read off wall-clock so backgrounded tabs catch up correctly when the
  // tick loop drains its accumulator.
  function eventMaturity(event) {
    return clamp((performance.now() - event.spawnedAt) / event.lifetime, 0, 1);
  }

  // Convert a fully-mature active event into a Scar. Status flips to
  // 'resolved_auto' so the next sweep filters it out of state.events.
  function autoResolveEvent(event) {
    const damage = pickRandomInRange(SCAR_DAMAGE_MIN, SCAR_DAMAGE_MAX);
    state.scars.push({
      x: event.x,
      y: event.y,
      damage,
      bornInEpoch: state.epoch,
      sourceEvent: event.kind,
    });
    event.status = 'resolved_auto';
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

    // Spawn cadence — fire a spawn attempt when the next interval has elapsed
    // and the queue has room.
    const now = performance.now();
    if (state.lastSpawnAt === 0) {
      state.lastSpawnAt = now;
      state.nextSpawnIntervalMs = pickRandomInRange(SPAWN_INTERVAL_MIN_MS, SPAWN_INTERVAL_MAX_MS);
    }
    if (now - state.lastSpawnAt >= state.nextSpawnIntervalMs && state.events.length < MAX_ACTIVE_EVENTS) {
      spawnEvent();
    }

    // Auto-resolve any event whose maturity has hit 1.0
    for (const event of state.events) {
      if (event.status === 'active' && eventMaturity(event) >= 1.0) {
        autoResolveEvent(event);
      }
    }

    // Sweep resolved events out of the active list
    state.events = state.events.filter(e => e.status === 'active');
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

  // Map maturity → one of 5 discrete visual stages. Discrete (not smoothly
  // interpolated) on purpose — per the design pivot, the moment a fault
  // crosses from one look to the next is supposed to be a *thing that
  // happened*, not a number ticking. The 5 stages give the player something
  // legible to react to as ripeness climbs.
  function faultStage(maturity) {
    if (maturity < 0.20) return 'hairline';
    if (maturity < 0.45) return 'fissure';
    if (maturity < 0.70) return 'glowingCrack';
    if (maturity < 0.90) return 'pulsing';
    return 'aboutToRupture';
  }

  // Draw all live events. Single switch on event.kind today (StressedFault
  // is the only kind in PR 1); structured this way so adding plumes /
  // orogeny / etc. later is just another `if` branch + a draw helper.
  function drawEvents() {
    for (const event of state.events) {
      if (event.status !== 'active') continue;
      if (event.kind === 'StressedFault') drawStressedFault(event);
    }
  }

  // Draw a single StressedFault. Position is the event's normalized planet
  // coordinate scaled into pixel space. Orientation is *radial* — the line
  // points outward from planet center, so it visually reads as a crack
  // running along the radius (a fissure pointing toward space). Five
  // discrete visual treatments correspond to the maturity stages.
  //
  // Halos use a two-stroke pattern (wider transparent stroke under the
  // crisp line) rather than ctx.shadowBlur — shadowBlur is much slower per
  // draw call and we may have up to 5 events on screen each frame.
  function drawStressedFault(event) {
    const { cx, cy, r } = view;
    const px = cx + event.x * r;
    const py = cy + event.y * r;
    const stage = faultStage(eventMaturity(event));
    // Radial-aligned line: the crack runs along the radius from planet
    // center, so atan2(y, x) is exactly the orientation we want.
    const ang = Math.atan2(event.y, event.x);

    let length, width, color, halo = null;
    switch (stage) {
      case 'hairline':
        length = 18; width = 0.5;
        color = 'rgba(60, 50, 45, 0.4)';
        break;
      case 'fissure':
        length = 28; width = 1.2;
        color = 'rgba(40, 30, 25, 0.7)';
        break;
      case 'glowingCrack':
        length = 36; width = 2;
        color = 'rgba(180, 80, 50, 0.8)';
        halo = { color: 'rgba(180, 80, 50, 0.4)', width: 6 };
        break;
      case 'pulsing': {
        // ~220ms half-period; sin wave in [0,1] used to lerp between a
        // bright peak color and a dim trough. Subtle, not flashy.
        const t = (Math.sin(performance.now() / 220) + 1) * 0.5;
        const rC = Math.round(180 + (220 - 180) * t);
        const gC = Math.round(70 + (110 - 70) * t);
        const bC = Math.round(40 + (60 - 40) * t);
        const aC = 0.6 + 0.4 * t;
        length = 40; width = 2.5;
        color = `rgba(${rC}, ${gC}, ${bC}, ${aC})`;
        halo = { color: `rgba(${rC}, ${gC}, ${bC}, ${0.35 * aC})`, width: 8 };
        break;
      }
      case 'aboutToRupture':
        length = 44; width = 3;
        color = 'rgba(245, 90, 50, 1)';
        halo = { color: 'rgba(245, 90, 50, 0.55)', width: 12 };
        break;
    }

    const dx = Math.cos(ang) * length * 0.5;
    const dy = Math.sin(ang) * length * 0.5;

    ctx.save();
    ctx.lineCap = 'round';
    if (halo) {
      ctx.strokeStyle = halo.color;
      ctx.lineWidth = halo.width;
      ctx.beginPath();
      ctx.moveTo(px - dx, py - dy);
      ctx.lineTo(px + dx, py + dy);
      ctx.stroke();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(px - dx, py - dy);
    ctx.lineTo(px + dx, py + dy);
    ctx.stroke();
    ctx.restore();
  }

  // Draw permanent geology — scars left behind by auto-resolved events.
  // Short dark radial slashes; length scales modestly with damage so a
  // damage=10 scar reads heavier than a damage=3 one without becoming
  // cartoonishly large. No animation (scars are static, not events).
  function drawScars() {
    const { cx, cy, r } = view;
    ctx.save();
    ctx.strokeStyle = 'rgba(20, 12, 8, 0.85)';
    ctx.lineCap = 'round';
    for (const s of state.scars) {
      const px = cx + s.x * r;
      const py = cy + s.y * r;
      const damage = clamp(s.damage || SCAR_DAMAGE_MIN, SCAR_DAMAGE_MIN, SCAR_DAMAGE_MAX);
      const length = 8 + (damage / 10) * 6;     // ~10px (light) → 14px (heavy)
      const width = 1 + (damage / 10) * 1;      // 1px → 2px
      const ang = Math.atan2(s.y, s.x);
      const dx = Math.cos(ang) * length * 0.5;
      const dy = Math.sin(ang) * length * 0.5;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(px - dx, py - dy);
      ctx.lineTo(px + dx, py + dy);
      ctx.stroke();
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

    // Geology layer — scars first (permanent damage), then events on top
    // (live ripening faults). Both render inside the planet clip so visuals
    // near the rim don't bleed into space.
    drawScars();
    drawEvents();
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
