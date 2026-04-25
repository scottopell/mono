// Planet Game — events-not-ticks loop. PR 1 foundation.
// See spec.allium for the target domain shape and ROADMAP.md for the slice plan.
//
// Loop:
//   - StressedFault events spawn at 30-60s cadence, biased toward existing
//     scarring; capped at 5 active.
//   - Each event ripens through 5 visible stages over a 45-120s lifetime.
//   - Tap an event before it ruptures → permanent TerrainFeature + stability gain.
//     Ignore it → permanent Scar + stability loss.
//   - Stability is DERIVED from the map: epochAnchor + Σ feature.quality
//     − Σ scar.damage, clamped [0, 100]. epochAnchor adjusts on epoch
//     advance so stability snaps to STABILITY_AFTER_ADVANCE while geology
//     persists.
//
// Persistable timestamps use Date.now() so events / spawn cadence survive
// page reloads. Ephemeral UI timing (charge ring, drawLastResolution
// animation) keeps performance.now() — never persisted.
//
// Surviving infrastructure from the prior tick-based build:
//   - Time loop (driveLoop + MAX_CATCHUP_MS catchup, Law I)
//   - Terrain bake + epoch palette tinting (Law II / VI)
//   - Charged-tap UX (CHARGE_TIERS, drawChargeIndicator) — now applied to
//     event handle taps, multiplier scales feature quality
//   - localStorage persistence (SAVE_VERSION bumped to 3; older saves drop)
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

  // Phase 4: tap-to-handle tuning
  const EVENT_TAP_SNAP_RADIUS = 0.18;   // normalized planet radii — generous tap target
  const FEATURE_QUALITY_BASE = 8;       // max base quality at maturity 1.0, normal tier
  const STABILITY_AFTER_ADVANCE = 55;   // post-advance stability invariant (Law VI)

  // PR 2: BuildingPlume tuning — the strategic inversion. Plumes spawn on
  // already-scarred crust and, when handled, RESURFACE the surrounding
  // damage. Scars become fuel for the repair cycle: cluster scarring →
  // plume opportunity → tap → scar reduction. Plumes that auto-erupt
  // unhandled are bigger disasters than fault auto-resolves, raising the
  // stakes of letting them ripen out.
  const PLUME_SPAWN_THRESHOLD = 0.4;       // average scar density above which plumes start spawning
  const PLUME_LIFETIME_MIN_MS = 60 * 1000; // plumes ripen slower than faults — they're a slower "vent"
  const PLUME_LIFETIME_MAX_MS = 150 * 1000;
  const PLUME_FEATURE_QUALITY_MULT = 1.4;  // BasaltPatch quality is bigger than VolcanicRidge per maturity unit
  const PLUME_AUTO_DAMAGE_MIN = 6;         // plumes that auto-erupt do MORE damage than faults
  const PLUME_AUTO_DAMAGE_MAX = 14;
  const RESURFACE_RADIUS = 0.28;           // normalized planet radii — scars within this distance get healed
  const RESURFACE_STRENGTH = 0.65;         // 0..1 — fraction of damage scrubbed from a scar at center
  const SCAR_PRUNE_THRESHOLD = 1.0;        // scars below this damage after resurfacing get removed entirely

  // PR 2: queue-full background scars — when the player can't open new
  // event slots, ambient geological pressure manifests as direct damage
  // to the densest scarred region. This bounds idle-window damage and
  // prevents the queue cap from being weaponized as a "pause the world"
  // exploit.
  const BACKGROUND_SCAR_INTERVAL_MIN_MS = 45 * 1000;  // shortest gap between background scars
  const BACKGROUND_SCAR_INTERVAL_MAX_MS = 75 * 1000;
  const BACKGROUND_SCAR_DAMAGE_MIN = 1.5;             // smaller than fault auto-resolve damage (3-10)
  const BACKGROUND_SCAR_DAMAGE_MAX = 4;               // intentionally smaller — these are ambient, not headline events

  // PR 3: sacrifice mode — when Will is depleted (< RELEASE_COST), old
  // features (from previous epochs) become spendable. Tapping one shifts
  // the highest-maturity active event's spawnedAt forward, buying time at
  // the real cost of erasing the feature from the map.
  const SACRIFICE_NUDGE_PER_QUALITY_MS = 4 * 1000;   // each unit of feature.quality buys 4 seconds
  const SACRIFICE_NUDGE_MAX_FRAC = 0.5;              // cap nudge at 50% of event's lifetime
  const SACRIFICE_TAP_SNAP_RADIUS = 0.10;            // smaller than EVENT_TAP_SNAP_RADIUS (0.18) — features are smaller targets

  // PR 4: Orogeny — first major event. Multi-session timescale (8-20
  // minutes); resolves into a permanent mountain range (terrain mutation
  // in Phase C). Spawns at convergent zones — pairs of land masses
  // pressing across narrow ocean.
  const MAJOR_EVENT_LIFETIME_MIN_MS = 8 * 60 * 1000;   // 8 min
  const MAJOR_EVENT_LIFETIME_MAX_MS = 20 * 60 * 1000;  // 20 min
  const OROGENY_SPAWN_PROB = 0.20;                     // base probability when conditions hold
  const OROGENY_MIN_EPOCH = 2;                         // Hadean has no continents yet; wait until Archean
  const OROGENY_LAND_HEIGHT_MIN = 0.55;                // height threshold for "this is land" (matches heightToColor)
  const OROGENY_OCEAN_HEIGHT_MAX = 0.50;               // height threshold for "this is ocean/lowland"
  const OROGENY_AXIS_DIST_MIN = 0.20;                  // shortest axis between convergent points (normalized)
  const OROGENY_AXIS_DIST_MAX = 0.55;                  // longest axis
  const OROGENY_DETECT_ATTEMPTS = 30;                  // how many random pairs to try before giving up

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
  // v3: persisted timestamps (spawnedAt, lastSpawnAt) switched to Date.now().
  // performance.now() resets per page load, which made events stall after a
  // reload. Date.now() is monotonic across reloads.
  const SAVE_VERSION = 3;
  const SAVE_INTERVAL_MS = 1000;

  const state = {
    ageTicks: 0,
    influence: 0,
    events: [],          // {kind, x, y, spawnedAt, lifetime, status: 'active'}
    features: [],        // {kind, x, y, quality, bornInEpoch}
    scars: [],           // {x, y, damage, bornInEpoch, sourceEvent: null}
    epochAnchor: 50,
    epoch: 1,
    lastSpawnAt: 0,                  // ms timestamp of most recent spawn
    nextSpawnIntervalMs: 0,          // randomised interval until next spawn attempt
    lastBackgroundScarAt: 0,         // ms timestamp of most recent background scar
    nextBackgroundScarIntervalMs: 0, // randomised interval until next background scar attempt
    paused: false,
    log: [],
    planetSeed: (Math.random() * 0xffffffff) >>> 0,
    // Ephemeral UI: most recent event resolution, drives the floating
    // delta + ring feedback. Cleared once the animation expires. Not
    // persisted (re-derives from state silence on reload).
    lastResolution: null,             // {x, y, kind: 'handled'|'scarred', delta, bornAt}
  };

  function persistState() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: SAVE_VERSION,
        planetSeed: state.planetSeed,
        ageTicks: state.ageTicks,
        influence: state.influence,
        epoch: state.epoch,
        events: state.events,
        features: state.features,
        scars: state.scars,
        epochAnchor: state.epochAnchor,
        lastSpawnAt: state.lastSpawnAt,
        nextSpawnIntervalMs: state.nextSpawnIntervalMs,
        lastBackgroundScarAt: state.lastBackgroundScarAt,
        nextBackgroundScarIntervalMs: state.nextBackgroundScarIntervalMs,
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
    state.epoch       = clamp(saved.epoch | 0, 1, MAX_EPOCH);
    state.events      = Array.isArray(saved.events) ? saved.events : [];
    state.features    = Array.isArray(saved.features) ? saved.features : [];
    state.scars       = Array.isArray(saved.scars) ? saved.scars : [];
    state.epochAnchor = Number.isFinite(saved.epochAnchor) ? saved.epochAnchor : 50;
    state.lastSpawnAt = Number.isFinite(saved.lastSpawnAt) ? saved.lastSpawnAt : 0;
    state.nextSpawnIntervalMs = Number.isFinite(saved.nextSpawnIntervalMs) ? saved.nextSpawnIntervalMs : 0;
    state.lastBackgroundScarAt = Number.isFinite(saved.lastBackgroundScarAt) ? saved.lastBackgroundScarAt : 0;
    state.nextBackgroundScarIntervalMs = Number.isFinite(saved.nextBackgroundScarIntervalMs) ? saved.nextBackgroundScarIntervalMs : 0;
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
    eventCount: $('event-count'),
    scarCount: $('scar-count'),
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
  // by scarDensityAt(x, y) + floor; then pick weighted-randomly.
  //
  // The floor controls how much virgin crust gets a chance:
  //   - StressedFault: +0.1 — moderate bias; faults can still appear on
  //     fresh ground because cracking is what *creates* scarring.
  //   - BuildingPlume:  +0.05 — stronger bias toward existing scars;
  //     plumes form ON scarred crust (the volcanic vent rises through
  //     already-fractured rock), so virgin crust gets less of a shot.
  function pickSpawnPosition(kind) {
    if (state.scars.length === 0) return randomDiskPoint();
    const floor = kind === 'BuildingPlume' ? 0.05 : 0.1;
    const K = 8;
    const candidates = [];
    let total = 0;
    for (let i = 0; i < K; i++) {
      const p = randomDiskPoint();
      const w = scarDensityAt(p.x, p.y) + floor;
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

  // PR 4: KISS convergent-zone detection for Orogeny spawn. Pick a random
  // land point P1, then probe nearby for a second land point P2 whose
  // midpoint with P1 sits over ocean/lowland (the "narrow ocean between
  // continents" telegraph). Returns {x1, y1, x2, y2} or null if no
  // qualifying pair found in OROGENY_DETECT_ATTEMPTS tries.
  //
  // Deliberately simple. heightAt() requires fbm sampling, so attempts
  // are bounded; on a normal-noise planet with continents most attempts
  // succeed within a handful of tries. Return null is the rare "this
  // planet has no candidate convergent zones right now" signal — the
  // caller falls back to a different event kind.
  function findConvergentZone() {
    for (let attempt = 0; attempt < OROGENY_DETECT_ATTEMPTS; attempt++) {
      // Step 1: random point that is unambiguously land
      const p1 = randomDiskPoint();
      if (heightAt(p1.x, p1.y) < OROGENY_LAND_HEIGHT_MIN) continue;
      // Step 2: nearby second land point. Sample with a moderate offset.
      const ang = Math.random() * Math.PI * 2;
      const dist = OROGENY_AXIS_DIST_MIN
        + Math.random() * (OROGENY_AXIS_DIST_MAX - OROGENY_AXIS_DIST_MIN);
      const p2 = { x: p1.x + Math.cos(ang) * dist, y: p1.y + Math.sin(ang) * dist };
      if (p2.x * p2.x + p2.y * p2.y > 0.95) continue;  // p2 must be inside the disc
      if (heightAt(p2.x, p2.y) < OROGENY_LAND_HEIGHT_MIN) continue;
      // Step 3: midpoint must be lower than either land mass — that's the
      // "narrow ocean / lowland between them" telegraph.
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      if (heightAt(mid.x, mid.y) > OROGENY_OCEAN_HEIGHT_MAX) continue;
      return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    }
    return null;
  }

  // Choose which kind of event to spawn next. Three-way selection in
  // priority order:
  //   1. Orogeny — rarest. Gated on epoch (>= Archean) since the Hadean
  //      has no continents to converge yet. Independent of scarring;
  //      whether a convergent zone exists is checked at spawn time.
  //   2. BuildingPlume — fueled by accumulated scar density.
  //   3. StressedFault — fallback. Cracks form on virgin or scarred crust.
  //
  // The probabilities chain (each gate is a Math.random() draw) so practical
  // orogeny spawn rate stays low: ~20% of post-Archean spawn attempts.
  function pickEventKind() {
    // Orogeny — rare, only after Archean (epoch >= 2). Independent of
    // scarring; depends on whether convergent zones exist (checked at
    // spawn time, not here).
    if (state.epoch >= OROGENY_MIN_EPOCH && Math.random() < OROGENY_SPAWN_PROB) {
      return 'Orogeny';
    }
    // Plume — fueled by scarring (existing logic)
    let totalDamage = 0;
    for (const s of state.scars) totalDamage += s.damage;
    // Clamped to [0, 1] so the comparison with PLUME_SPAWN_THRESHOLD has
    // a stable interpretation even on heavily-scarred planets.
    const avgDensity = Math.min(1, totalDamage / 30);
    if (avgDensity > PLUME_SPAWN_THRESHOLD && Math.random() < 0.5) {
      return 'BuildingPlume';
    }
    return 'StressedFault';
  }

  // Spawn a new active event on the planet. Honours the queue cap; updates
  // the spawn-cadence bookkeeping so the next attempt waits a fresh
  // randomised interval. Kind is chosen by pickEventKind (scar-density
  // gated); lifetime range is per-kind — plumes ripen slower than faults
  // since they're a slower "vent" phenomenon.
  //
  // Orogeny is special: needs a convergent zone (pair of land masses
  // across narrow ocean). Find one first; if no convergent zone exists
  // on this planet right now, fall back to StressedFault so we don't
  // waste the spawn slot. The convergent axis is persisted on the event
  // (x1, y1, x2, y2) and the event's center position is the axis midpoint.
  function spawnEvent() {
    if (state.events.length >= MAX_ACTIVE_EVENTS) return;
    let kind = pickEventKind();
    let axis = null;
    if (kind === 'Orogeny') {
      axis = findConvergentZone();
      if (!axis) {
        // Convergent zone search came up empty — fall back to a fault so
        // we don't waste this spawn slot.
        kind = 'StressedFault';
      }
    }
    const pos = axis
      ? { x: (axis.x1 + axis.x2) / 2, y: (axis.y1 + axis.y2) / 2 }
      : pickSpawnPosition(kind);
    const lifetime = (kind === 'Orogeny')
      ? pickRandomInRange(MAJOR_EVENT_LIFETIME_MIN_MS, MAJOR_EVENT_LIFETIME_MAX_MS)
      : pickRandomInRange(
          kind === 'BuildingPlume' ? PLUME_LIFETIME_MIN_MS : MINOR_EVENT_LIFETIME_MIN_MS,
          kind === 'BuildingPlume' ? PLUME_LIFETIME_MAX_MS : MINOR_EVENT_LIFETIME_MAX_MS
        );
    const now = Date.now();
    const event = {
      kind,
      x: pos.x,
      y: pos.y,
      spawnedAt: now,            // Date.now() so reloads don't stall ripening
      lifetime,
      status: 'active',
    };
    if (axis) {
      event.x1 = axis.x1; event.y1 = axis.y1;
      event.x2 = axis.x2; event.y2 = axis.y2;
    }
    state.events.push(event);
    state.lastSpawnAt = now;
    state.nextSpawnIntervalMs = pickRandomInRange(SPAWN_INTERVAL_MIN_MS, SPAWN_INTERVAL_MAX_MS);
  }

  // Event ripeness in [0, 1]. 0 = just spawned, 1 = ready to auto-resolve.
  // Date.now() so the persisted spawnedAt stays meaningful across reloads.
  function eventMaturity(event) {
    return clamp((Date.now() - event.spawnedAt) / event.lifetime, 0, 1);
  }

  // Convert a fully-mature active event into a Scar. Status flips to
  // 'resolved_auto' so the next sweep filters it out of state.events.
  // Damage range is per-kind: an unhandled BuildingPlume erupts and does
  // significantly more damage than an unhandled StressedFault, raising
  // the stakes of letting plumes ripen out unattended. Orogenies that
  // erupt unchecked are catastrophic — the largest unhandled-event scar.
  // (Phase C will add terrain mutation here as well; for now: just scar.)
  function autoResolveEvent(event) {
    let dmgMin, dmgMax;
    if (event.kind === 'Orogeny') {
      dmgMin = 15; dmgMax = 25;
    } else if (event.kind === 'BuildingPlume') {
      dmgMin = PLUME_AUTO_DAMAGE_MIN; dmgMax = PLUME_AUTO_DAMAGE_MAX;
    } else {
      dmgMin = SCAR_DAMAGE_MIN; dmgMax = SCAR_DAMAGE_MAX;
    }
    const damage = pickRandomInRange(dmgMin, dmgMax);
    state.scars.push({
      x: event.x,
      y: event.y,
      damage,
      bornInEpoch: state.epoch,
      sourceEvent: event.kind,
    });
    event.status = 'resolved_auto';
    pushLog({
      ageTicks: state.ageTicks,
      scarred: true,
      damage,
      sourceEvent: event.kind,
    });
    state.lastResolution = {
      x: event.x, y: event.y,
      kind: 'scarred',
      delta: -damage,
      bornAt: performance.now(),
    };
  }

  // Find the closest active event within EVENT_TAP_SNAP_RADIUS of a tap.
  // Returns the event or null if no active event is close enough. This is
  // the snap-to-event tap routing (Phase 4) — taps near events resolve
  // them; taps in empty space are ignored.
  function findEventNearPoint(px, py) {
    let best = null, bestD2 = EVENT_TAP_SNAP_RADIUS * EVENT_TAP_SNAP_RADIUS;
    for (const event of state.events) {
      if (event.status !== 'active') continue;
      const dx = event.x - px, dy = event.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { best = event; bestD2 = d2; }
    }
    return best;
  }

  // PR 3: sacrifice mode helpers.
  //
  // A feature is sacrificable if it was born in a *previous* epoch — the
  // player can spend the autobiography of an older self to buy time now.
  // Current-epoch features stay protected so this turn's gains don't get
  // eaten by this turn's panic.
  function isSacrificable(feature) {
    return feature.bornInEpoch < state.epoch;
  }

  // Mirror of findEventNearPoint, but searches sacrificable features
  // within a tighter radius (features are smaller targets than events).
  function findSacrificableNear(px, py) {
    let best = null, bestD2 = SACRIFICE_TAP_SNAP_RADIUS * SACRIFICE_TAP_SNAP_RADIUS;
    for (const f of state.features) {
      if (!isSacrificable(f)) continue;
      const dx = f.x - px, dy = f.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { best = f; bestD2 = d2; }
    }
    return best;
  }

  // Pick the active event closest to rupturing — the one a panicking
  // player most wants nudged back. v1 simplification of the spec's
  // two-tap (feature + target) interaction: auto-target the worst
  // imminent thing.
  function mostMatureActiveEvent() {
    let best = null, bestM = -Infinity;
    for (const event of state.events) {
      if (event.status !== 'active') continue;
      const m = eventMaturity(event);
      if (m > bestM) { best = event; bestM = m; }
    }
    return best;
  }

  // Spend a feature to nudge the most-mature active event back. The
  // event's effective age is younger-ified by shifting its spawnedAt
  // forward in time (the same trick PR 4's planned "terrain rebake" will
  // use — we modify effective age, not position or kind). Returns true
  // on success, false if there's nothing to nudge (so the caller can
  // decline the sacrifice rather than silently consuming the feature).
  function sacrificeFeature(feature) {
    const target = mostMatureActiveEvent();
    if (!target) return false;
    const nudgeMs = Math.min(
      feature.quality * SACRIFICE_NUDGE_PER_QUALITY_MS,
      target.lifetime * SACRIFICE_NUDGE_MAX_FRAC,
    );
    target.spawnedAt = target.spawnedAt + nudgeMs;
    state.features = state.features.filter(f => f !== feature);
    pushLog({
      ageTicks: state.ageTicks,
      sacrifice: true,
      quality: feature.quality,
      nudgeSeconds: nudgeMs / 1000,
    });
    state.lastResolution = {
      x: feature.x, y: feature.y,
      kind: 'sacrifice',
      delta: -feature.quality,            // negative — we lost the quality contribution
      bornAt: performance.now(),
    };
    return true;
  }

  // Resolve an active event into a TerrainFeature using a charge tier.
  // Quality scales with maturity (handling later = bigger features) and
  // tier multiplier. Branches by event kind:
  //   - StressedFault → VolcanicRidge (radial ridge feature).
  //   - BuildingPlume → BasaltPatch (dome feature) AND resurfaces nearby
  //     scars: scars within RESURFACE_RADIUS lose a fraction of their
  //     damage proportional to nearness; any scar dropped below
  //     SCAR_PRUNE_THRESHOLD is removed entirely. This is the strategic
  //     loop closure — accumulating scars is *fuel* for plume-driven
  //     repair, not a one-way slide.
  //   - Orogeny → OrogenicRange (mountain range along the convergent
  //     axis). Slow-ripening, big reward — quality is scaled by 2.5x
  //     to reflect 8-20 minute investment. Phase C will additionally
  //     mutate the heightfield to raise mountains visually; Phase A just
  //     produces the feature record at the right scale.
  // The event is flagged 'resolved_handled' so the tick-loop sweep removes it.
  function handleEvent(event, tier) {
    if (event.status !== 'active') return false;
    if (state.influence < tier.will) return false;
    state.influence -= tier.will;
    const maturity = eventMaturity(event);
    const isPlume = event.kind === 'BuildingPlume';
    const isOrogeny = event.kind === 'Orogeny';
    let quality, featureKind;
    if (isOrogeny) {
      // Orogenies are slow-ripening; reward is large for the patient (2.5x).
      quality = maturity * tier.mult * FEATURE_QUALITY_BASE * 2.5;
      featureKind = 'OrogenicRange';
    } else if (isPlume) {
      quality = maturity * tier.mult * FEATURE_QUALITY_BASE * PLUME_FEATURE_QUALITY_MULT;
      featureKind = 'BasaltPatch';
    } else {
      quality = maturity * tier.mult * FEATURE_QUALITY_BASE;
      featureKind = 'VolcanicRidge';
    }
    state.features.push({
      kind: featureKind,
      x: event.x,
      y: event.y,
      quality,
      bornInEpoch: state.epoch,
    });
    event.status = 'resolved_handled';

    let scarsHealed = 0;
    let damageHealed = 0;
    if (isPlume) {
      // Resurface: reduce damage on every scar within RESURFACE_RADIUS,
      // weighted by nearness so the plume's center heals most. Then prune
      // any scar that has fallen below the visible threshold.
      const r2 = RESURFACE_RADIUS * RESURFACE_RADIUS;
      for (const s of state.scars) {
        const dx = s.x - event.x;
        const dy = s.y - event.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const dist = Math.sqrt(d2);
        const nearness = 1 - dist / RESURFACE_RADIUS;
        const reduction = s.damage * RESURFACE_STRENGTH * nearness;
        s.damage -= reduction;
        damageHealed += reduction;
        scarsHealed += 1;
      }
      const before = state.scars.length;
      state.scars = state.scars.filter(s => s.damage >= SCAR_PRUNE_THRESHOLD);
      const pruned = before - state.scars.length;
      pushLog({
        ageTicks: state.ageTicks,
        handled: true,
        plume: true,
        quality,
        tier: tier.label,
        scarsHealed,
        damageHealed,
        scarsPruned: pruned,
      });
    } else {
      pushLog({
        ageTicks: state.ageTicks,
        handled: true,
        quality,
        tier: tier.label,
      });
    }

    state.lastResolution = {
      x: event.x, y: event.y,
      kind: 'handled',
      delta: quality,
      bornAt: performance.now(),
    };
    flashStage();
    maybeAdvanceEpoch();
    return true;
  }

  // Drop an ambient "background" scar when the queue is full — bounds
  // idle-window damage and prevents the queue cap from being weaponized
  // as a "pause the world" exploit.
  //
  // Position strategy: pick uniformly at random from existing scars and
  // perturb by ±0.05. This concentrates damage in already-scarred zones
  // (the spec's HighestScarringRegion intent) without needing a full
  // density-peak search. Fallback to randomDiskPoint() in the unlikely
  // case the queue is full but no scars exist yet.
  function dropBackgroundScar() {
    let x, y;
    if (state.scars.length > 0) {
      const base = state.scars[Math.floor(Math.random() * state.scars.length)];
      x = base.x + pickRandomInRange(-0.05, 0.05);
      y = base.y + pickRandomInRange(-0.05, 0.05);
    } else {
      const p = randomDiskPoint();
      x = p.x;
      y = p.y;
    }
    // Project back onto the unit disk if the perturbation pushed off-planet.
    // Off-disk scars would still affect stability and spawn bias but get
    // clipped by drawPlanet's arc-clip — invisible damage is bad UX.
    const r2 = x * x + y * y;
    if (r2 > 1) {
      const inv = 0.99 / Math.sqrt(r2);  // 0.99 leaves a hair of margin off the rim
      x *= inv;
      y *= inv;
    }
    const damage = pickRandomInRange(BACKGROUND_SCAR_DAMAGE_MIN, BACKGROUND_SCAR_DAMAGE_MAX);
    state.scars.push({
      x, y,
      damage,
      bornInEpoch: state.epoch,
      sourceEvent: 'BackgroundPressure',
    });
    pushLog({
      ageTicks: state.ageTicks,
      backgroundScar: true,
      damage,
    });
    state.lastBackgroundScarAt = Date.now();
    state.nextBackgroundScarIntervalMs = pickRandomInRange(
      BACKGROUND_SCAR_INTERVAL_MIN_MS, BACKGROUND_SCAR_INTERVAL_MAX_MS
    );
    // Drive the float-delta feedback so the player SEES damage land even
    // when not interacting — makes the "queue is full and pressure is
    // building" state legible rather than silent.
    state.lastResolution = {
      x, y,
      kind: 'scarred',
      delta: -damage,
      bornAt: performance.now(),
    };
  }

  // Derived stability — computed from epochAnchor + sum(feature.quality)
  // - sum(scar.damage), clamped to [0, 100]. Replaces the old stored
  // state.stability field. epochAnchor absorbs the gap so post-advance
  // stability snaps to STABILITY_AFTER_ADVANCE without erasing geology.
  function computeStability() {
    let qualitySum = 0;
    for (const f of state.features) qualitySum += f.quality;
    let damageSum = 0;
    for (const s of state.scars) damageSum += s.damage;
    return clamp(state.epochAnchor + qualitySum - damageSum, 0, 100);
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

  // Heightfield query at runtime — same formula as bakeTerrain so that
  // "this point is land" agrees with what's drawn. Returns elevation in
  // roughly [0, 1].
  function heightAt(x, y) {
    const d2 = x * x + y * y;
    if (d2 > 1) return 0;
    const rimPull = 0.28 * d2 * d2;  // matches bakeTerrain
    return fbm(x * NOISE_SCALE, y * NOISE_SCALE, state.planetSeed) - rimPull;
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
    // and the queue has room. Date.now() so the comparison with the
    // persisted lastSpawnAt is meaningful across reloads.
    const wallNow = Date.now();
    if (state.lastSpawnAt === 0) {
      state.lastSpawnAt = wallNow;
      state.nextSpawnIntervalMs = pickRandomInRange(SPAWN_INTERVAL_MIN_MS, SPAWN_INTERVAL_MAX_MS);
    }
    if (wallNow - state.lastSpawnAt >= state.nextSpawnIntervalMs && state.events.length < MAX_ACTIVE_EVENTS) {
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

    // Queue-full background scars — when 5 events are live, ambient pressure
    // drops a small scar in the densest scarred region every ~45-75s. Bounds
    // idle damage; prevents the queue cap being weaponized as "pause the world."
    const queueFull = state.events.length >= MAX_ACTIVE_EVENTS;
    if (queueFull) {
      if (state.lastBackgroundScarAt === 0) {
        state.lastBackgroundScarAt = wallNow;
        state.nextBackgroundScarIntervalMs = pickRandomInRange(
          BACKGROUND_SCAR_INTERVAL_MIN_MS, BACKGROUND_SCAR_INTERVAL_MAX_MS
        );
      } else if (wallNow - state.lastBackgroundScarAt >= state.nextBackgroundScarIntervalMs) {
        dropBackgroundScar();
      }
    } else {
      // Reset the timer when queue clears so background scars don't fire
      // immediately on the next queue-full episode (would feel punitive).
      state.lastBackgroundScarAt = 0;
    }

    // Auto-advance check — an auto-resolved event normally lowers stability,
    // but a tap-handled feature can push it past STABILITY_GOAL. Also
    // covers any future case where derived stability crosses the threshold
    // mid-tick without a player tap.
    maybeAdvanceEpoch();
  }

  // Epoch advance — derived-stability model. Adjusts state.epochAnchor so
  // immediately after advance, computeStability() returns
  // STABILITY_AFTER_ADVANCE even though features and scars persist. This
  // is what makes "stability resets to 55 on epoch advance" hold under
  // the derived-stability model (geology stays; the floor moves).
  function maybeAdvanceEpoch() {
    if (computeStability() < STABILITY_GOAL) return;
    if (state.epoch >= MAX_EPOCH) return;
    state.epoch += 1;
    let qualitySum = 0;
    for (const f of state.features) qualitySum += f.quality;
    let damageSum = 0;
    for (const s of state.scars) damageSum += s.damage;
    state.epochAnchor = STABILITY_AFTER_ADVANCE - qualitySum + damageSum;
    bakeTerrain(); // Law VI: epoch tint shifts, same continents
    pushLog({
      ageTicks: state.ageTicks,
      epochEnter: state.epoch,
    });
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

  function renderLog() {
    els.log.innerHTML = state.log.map((e) => {
      if (e.epochEnter) {
        const name = epochInfo(e.epochEnter).name;
        return `<li><span class="age">${formatAge(e.ageTicks)}</span>— The <strong>${name}</strong> begins. Your memory carries forward.</li>`;
      }
      if (e.handled) {
        const tierTag = (e.tier && e.tier !== 'Normal')
          ? ` <span class="tier-tag tier-${e.tier.toLowerCase()}">${e.tier.toLowerCase()}</span>` : '';
        return `<li><span class="age">${formatAge(e.ageTicks)}</span>Released event${tierTag} → <span class="good">+${e.quality.toFixed(1)} terrain</span></li>`;
      }
      if (e.scarred) {
        return `<li><span class="age">${formatAge(e.ageTicks)}</span>Event ruptured → <span class="bad">+${e.damage.toFixed(1)} damage</span></li>`;
      }
      if (e.sacrifice) {
        return `<li><span class="age">${formatAge(e.ageTicks)}</span>Sacrificed feature → bought ${e.nudgeSeconds.toFixed(0)}s of breathing room</li>`;
      }
      if (e.backgroundScar) {
        return `<li><span class="age">${formatAge(e.ageTicks)}</span>Background pressure → <span class="bad">+${e.damage.toFixed(1)} damage</span></li>`;
      }
      return '';
    }).filter(Boolean).join('');
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

  // 5-stage classifier for BuildingPlume — distinct stage names from
  // faults so the player and the renderer never confuse them. The arc is
  // "swelling crust" → "smoking dome" → "fissured, hot" → "erupting".
  // Visually: domes (filled circles), not lines.
  function plumeStage(maturity) {
    if (maturity < 0.20) return 'bulge';
    if (maturity < 0.45) return 'dome';
    if (maturity < 0.70) return 'smoking';
    if (maturity < 0.90) return 'fissured';
    return 'erupting';
  }

  // Draw all live events. Branch on event.kind. Each event kind has its
  // own draw helper so visual class is unmistakable: faults = radial
  // lines (crack on the surface); plumes = domes (volume rising out of
  // the surface).
  function drawEvents() {
    for (const event of state.events) {
      if (event.status !== 'active') continue;
      if (event.kind === 'StressedFault') drawStressedFault(event);
      else if (event.kind === 'BuildingPlume') drawBuildingPlume(event);
      else if (event.kind === 'Orogeny') drawOrogeny(event);
    }
  }

  // Draw a single Orogeny. An Orogeny event represents two land masses
  // converging — over its 8-20 minute lifetime it grows a continuous
  // ridge along the convergent axis between (x1, y1) and (x2, y2).
  //
  // The visual is intentionally subtle and continuous (no discrete
  // stage flips like StressedFault / BuildingPlume have): the bulge
  // smoothly widens, color saturates, and late-stage features (cracks,
  // hot inner glow) fade in via alpha. This matches the design pivot's
  // "geological time" feel — you can almost see it growing if you stare,
  // like watching a glacier or a mountain.
  //
  // Layers, outer to inner:
  //   - halo:       wide low-alpha warm wash, "gravitational disturbance"
  //   - body:       solid filled capsule along the axis (the ridge)
  //   - crest:      thinner lighter line offset perpendicular (lit upper edge)
  //   - cracks:     fade in for m > 0.6, short perpendicular strokes
  //   - hot glow:   fades in for m > 0.9, hint of imminent eruption
  function drawOrogeny(event) {
    if (event.x1 == null) return;  // defensive: an Orogeny without an axis can't render
    const { cx, cy, r } = view;
    const m = eventMaturity(event);  // 0..1

    // Axis endpoints in pixel space.
    const ax = cx + event.x1 * r, ay = cy + event.y1 * r;
    const bx = cx + event.x2 * r, by = cy + event.y2 * r;
    const dx = bx - ax, dy = by - ay;
    const axisLen = Math.hypot(dx, dy);
    if (axisLen < 1) return;
    const ux = dx / axisLen, uy = dy / axisLen;        // unit along the axis
    const ppx = -uy, ppy = ux;                         // unit perpendicular

    // Subtle breath — slower than fault/plume because orogeny is
    // geological time, not heartbeat time.
    const breathPhase = event.x * 3 + event.y * 5;
    const breath = 0.92 + 0.08 * Math.sin(performance.now() / 1100 + breathPhase);

    // Width grows smoothly from "barely visible" at m=0 to a noticeable
    // mountain-range bulge at m=1.
    const widthPx = (8 + m * 20) * breath;             // 8 -> 28 px perpendicular extent

    ctx.save();

    // Outer halo — wider, low-alpha warm tone. Reads as "gravitational
    // disturbance" around the bulge.
    ctx.strokeStyle = `rgba(180, 130, 80, ${0.15 + m * 0.20})`;
    ctx.lineWidth = widthPx * 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();

    // Bulge body — solid filled capsule using a thick rounded line.
    // Color intensifies with maturity (warmer browns -> warmer reds).
    const bodyR = Math.round(110 + m * 80);    // 110 -> 190
    const bodyG = Math.round(75 + m * 25);     // 75 -> 100
    const bodyB = Math.round(45 + m * 10);     // 45 -> 55
    ctx.strokeStyle = `rgba(${bodyR}, ${bodyG}, ${bodyB}, ${0.55 + m * 0.30})`;
    ctx.lineWidth = widthPx;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();

    // Lit crest — a thinner, lighter line slightly offset perpendicular,
    // the "lit upper edge" of the rising terrain. Feels like 3D.
    const crestOffset = -widthPx * 0.20;
    ctx.strokeStyle = `rgba(245, 215, 175, ${0.35 + m * 0.45})`;
    ctx.lineWidth = widthPx * 0.35;
    ctx.beginPath();
    ctx.moveTo(ax + ppx * crestOffset, ay + ppy * crestOffset);
    ctx.lineTo(bx + ppx * crestOffset, by + ppy * crestOffset);
    ctx.stroke();

    // Late-stage cracks — fade in continuously after m > 0.6 (no abrupt
    // stage flip). 3 short perpendicular strokes across the bulge.
    if (m > 0.6) {
      const crackAlpha = (m - 0.6) / 0.4;        // 0 at m=0.6, 1 at m=1.0
      ctx.strokeStyle = `rgba(20, 8, 4, ${0.7 * crackAlpha})`;
      ctx.lineWidth = 1.5;
      const crackHalfW = widthPx * 0.6;
      for (let i = 1; i <= 3; i++) {
        const t = i / 4;       // distribute at 1/4, 2/4, 3/4 along the axis
        const ccx = ax + (bx - ax) * t;
        const ccy = ay + (by - ay) * t;
        ctx.beginPath();
        ctx.moveTo(ccx + ppx * crackHalfW, ccy + ppy * crackHalfW);
        ctx.lineTo(ccx - ppx * crackHalfW, ccy - ppy * crackHalfW);
        ctx.stroke();
      }
    }

    // At maturity > 0.9, hot inner glow leaks through (we're about to
    // erupt as a giant orogenic event). Smooth fade-in.
    if (m > 0.9) {
      const hotAlpha = (m - 0.9) / 0.1;
      ctx.strokeStyle = `rgba(255, 90, 50, ${0.5 * hotAlpha * breath})`;
      ctx.lineWidth = widthPx * 0.5;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }

    ctx.restore();
  }

  // Draw a single StressedFault. Position is the event's normalized planet
  // coordinate scaled into pixel space. Orientation is *radial* — the line
  // points outward from planet center, so it visually reads as a crack
  // running along the radius (a fissure pointing toward space).
  //
  // Each stage uses a TWO-TONE pattern (dark shadow stroke + colored fill
  // stroke on top). This guarantees readable contrast against any epoch
  // palette — molten Hadean, blue Cambrian, pale Stillness all coexist
  // without a single colour scheme washing the events out.
  //
  // Halos use the same two-stroke pattern (wider transparent stroke under
  // the crisp line) rather than ctx.shadowBlur — shadowBlur is much slower
  // per draw call and we may have up to 5 events on screen each frame.
  function drawStressedFault(event) {
    const { cx, cy, r } = view;
    const px = cx + event.x * r;
    const py = cy + event.y * r;
    const stage = faultStage(eventMaturity(event));
    // Radial-aligned line: the crack runs along the radius from planet
    // center, so atan2(y, x) is exactly the orientation we want.
    const ang = Math.atan2(event.y, event.x);

    // Subtle "breath" so events read as alive even at low maturity. Tiny
    // per-event phase offset (deterministic from position) so the planet's
    // events don't all pulse in lockstep — feels organic, not mechanical.
    // Applied to the early stages (hairline/fissure/glowingCrack) on the
    // colored fill stroke; pulsing/aboutToRupture already have stronger
    // motion of their own and are left alone so we don't compound it.
    const breathPhase = event.x * 7 + event.y * 5;
    const breath = 0.85 + 0.15 * Math.sin(performance.now() / 480 + breathPhase);

    // Tunable per stage. shadowWidth > strokeWidth gives a "drop shadow"
    // outline; halo (when set) sits below shadow for the warmer stages.
    let length, strokeWidth, shadowWidth, fillColor, halo = null;
    switch (stage) {
      case 'hairline':
        length = 22; strokeWidth = 1.0; shadowWidth = 2.4;
        fillColor = `rgba(240, 230, 215, ${0.75 * breath})`;
        break;
      case 'fissure':
        length = 32; strokeWidth = 1.6; shadowWidth = 3.4;
        fillColor = `rgba(245, 215, 180, ${0.85 * breath})`;
        break;
      case 'glowingCrack':
        length = 40; strokeWidth = 2.4; shadowWidth = 4.6;
        fillColor = `rgba(245, 165, 110, ${0.95 * breath})`;
        halo = { color: `rgba(220, 110, 60, ${0.45 * breath})`, width: 9 };
        break;
      case 'pulsing': {
        // ~220ms half-period; lerp between bright peak and dim trough.
        const t = (Math.sin(performance.now() / 220) + 1) * 0.5;
        const rC = Math.round(220 + (250 - 220) * t);
        const gC = Math.round(120 + (160 - 120) * t);
        const bC = Math.round(70 + (100 - 70) * t);
        const aC = 0.85 + 0.15 * t;
        length = 46; strokeWidth = 2.8; shadowWidth = 5.4;
        fillColor = `rgba(${rC}, ${gC}, ${bC}, ${aC})`;
        halo = { color: `rgba(${rC}, ${gC}, ${bC}, ${0.4 * aC})`, width: 12 };
        break;
      }
      case 'aboutToRupture':
        length = 52; strokeWidth = 3.4; shadowWidth = 6.2;
        fillColor = 'rgba(255, 110, 70, 1)';
        halo = { color: 'rgba(255, 90, 50, 0.6)', width: 16 };
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
    // Dark shadow underneath — wider than the fill so a thin halo of
    // darkness rims the line. Reads on every palette.
    ctx.strokeStyle = 'rgba(15, 8, 4, 0.85)';
    ctx.lineWidth = shadowWidth;
    ctx.beginPath();
    ctx.moveTo(px - dx, py - dy);
    ctx.lineTo(px + dx, py + dy);
    ctx.stroke();
    // Colored fill on top.
    ctx.strokeStyle = fillColor;
    ctx.lineWidth = strokeWidth;
    ctx.beginPath();
    ctx.moveTo(px - dx, py - dy);
    ctx.lineTo(px + dx, py + dy);
    ctx.stroke();
    ctx.restore();
  }

  // Draw a single BuildingPlume. Visually contrasted from StressedFault:
  // a fault is a radial LINE (a crack along the surface); a plume is a
  // filled DOME (a volume rising out of the surface). This visual class
  // difference is the player's instant-recognition cue for "which kind
  // is this?". Color theme: warm browns, oranges, reds — magma rising
  // through fractured crust.
  //
  // 5 stages mirror plumeStage(maturity):
  //   - bulge:     dim circular swelling, ~6px
  //   - dome:      clearer dome with darker rim, ~10px, top highlight
  //   - smoking:   dome + 2-3 rising wisps, ~13px
  //   - fissured:  cracks across the dome, hot core glow, ~16px
  //   - erupting:  hot orange-red, bright center, strong halo, ~18px,
  //                pulses sin-based like aboutToRupture for faults
  //
  // Same per-event 'breath' as drawStressedFault keeps low-maturity
  // plumes from reading as static.
  function drawBuildingPlume(event) {
    const { cx, cy, r } = view;
    const px = cx + event.x * r;
    const py = cy + event.y * r;
    const stage = plumeStage(eventMaturity(event));
    const breathPhase = event.x * 7 + event.y * 5;
    const breath = 0.85 + 0.15 * Math.sin(performance.now() / 480 + breathPhase);

    ctx.save();

    switch (stage) {
      case 'bulge': {
        // Faint swelling — a dim filled circle, just a hint that something's
        // cooking under the surface.
        const radius = 6 * breath;
        ctx.fillStyle = `rgba(80, 50, 30, ${0.45 * breath})`;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'dome': {
        // Clearer dome with a dark rim and a subtle top highlight to
        // suggest 3D — the swelling is now legible as volume.
        const radius = 10;
        // Outer rim shadow.
        ctx.fillStyle = 'rgba(40, 22, 12, 0.55)';
        ctx.beginPath();
        ctx.arc(px, py + 1, radius + 1, 0, Math.PI * 2);
        ctx.fill();
        // Body of the dome.
        ctx.fillStyle = `rgba(120, 70, 35, ${0.7 * breath})`;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
        // Lit highlight near the top — short arc.
        ctx.strokeStyle = 'rgba(220, 175, 130, 0.55)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(px, py - 1, radius * 0.65, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
        break;
      }
      case 'smoking': {
        // Dome plus 2-3 wisps of color rising upward — the vent is
        // exhaling.
        const radius = 13;
        // Base shadow.
        ctx.fillStyle = 'rgba(40, 22, 12, 0.6)';
        ctx.beginPath();
        ctx.arc(px, py + 1.5, radius + 1.5, 0, Math.PI * 2);
        ctx.fill();
        // Dome body.
        ctx.fillStyle = `rgba(140, 80, 40, ${0.8 * breath})`;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
        // Top highlight.
        ctx.strokeStyle = 'rgba(230, 185, 140, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py - 1, radius * 0.6, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
        // Three wisps drifting up. Slight time-driven sway so they feel
        // alive without being distracting.
        const sway = Math.sin(performance.now() / 600 + breathPhase) * 1.5;
        ctx.strokeStyle = 'rgba(180, 130, 90, 0.5)';
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        for (let i = -1; i <= 1; i++) {
          const wx = px + i * 4;
          const wy0 = py - radius;
          const wy1 = wy0 - 8;
          const wy2 = wy1 - 6;
          ctx.beginPath();
          ctx.moveTo(wx, wy0);
          ctx.quadraticCurveTo(wx + sway * (i === 0 ? 1 : i), wy1, wx + sway * 0.5, wy2);
          ctx.stroke();
        }
        break;
      }
      case 'fissured': {
        // Cracks visible across the dome surface; a hot core glow at
        // the center signals magma close to the top.
        const radius = 16;
        // Base shadow.
        ctx.fillStyle = 'rgba(40, 22, 12, 0.65)';
        ctx.beginPath();
        ctx.arc(px, py + 2, radius + 2, 0, Math.PI * 2);
        ctx.fill();
        // Dome body — slightly warmer hue now.
        ctx.fillStyle = 'rgba(155, 80, 40, 0.85)';
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
        // Hot core glow — radial gradient at the center.
        const glow = ctx.createRadialGradient(px, py, 0, px, py, radius * 0.6);
        glow.addColorStop(0, 'rgba(255, 180, 90, 0.85)');
        glow.addColorStop(1, 'rgba(255, 130, 50, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(px, py, radius * 0.6, 0, Math.PI * 2);
        ctx.fill();
        // Radial cracks — short dark strokes from center outward.
        ctx.strokeStyle = 'rgba(20, 10, 5, 0.85)';
        ctx.lineWidth = 1.2;
        ctx.lineCap = 'round';
        const crackSeed = breathPhase;
        for (let i = 0; i < 5; i++) {
          const a = crackSeed + i * (Math.PI * 2 / 5);
          const r0 = radius * 0.15;
          const r1 = radius * 0.95;
          ctx.beginPath();
          ctx.moveTo(px + Math.cos(a) * r0, py + Math.sin(a) * r0);
          ctx.lineTo(px + Math.cos(a) * r1, py + Math.sin(a) * r1);
          ctx.stroke();
        }
        break;
      }
      case 'erupting': {
        // Hot orange-red, bright pulsing center, strong outer halo —
        // the dome is about to crack open. Sin-based color lerp matches
        // the 'aboutToRupture' fault stage tempo so the urgency cue
        // feels consistent across kinds.
        const radius = 18;
        const t = (Math.sin(performance.now() / 220) + 1) * 0.5;
        // Outer halo — wide and warm.
        const halo = ctx.createRadialGradient(px, py, radius * 0.5, px, py, radius * 2.2);
        halo.addColorStop(0, `rgba(255, 140, 70, ${0.55 + 0.2 * t})`);
        halo.addColorStop(1, 'rgba(255, 80, 30, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(px, py, radius * 2.2, 0, Math.PI * 2);
        ctx.fill();
        // Dark base.
        ctx.fillStyle = 'rgba(40, 18, 10, 0.7)';
        ctx.beginPath();
        ctx.arc(px, py + 2, radius + 2, 0, Math.PI * 2);
        ctx.fill();
        // Glowing dome body.
        const rC = Math.round(220 + (255 - 220) * t);
        const gC = Math.round(100 + (140 - 100) * t);
        const bC = Math.round(50 + (70 - 50) * t);
        ctx.fillStyle = `rgba(${rC}, ${gC}, ${bC}, 0.95)`;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
        // Bright hot center.
        const core = ctx.createRadialGradient(px, py, 0, px, py, radius * 0.7);
        core.addColorStop(0, `rgba(255, 245, 200, ${0.9 + 0.1 * t})`);
        core.addColorStop(1, 'rgba(255, 160, 60, 0)');
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(px, py, radius * 0.7, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }

    ctx.restore();
  }

  // Draw permanent geology — scars left behind by auto-resolved events.
  // Visually distinct from active events:
  //   - Run TANGENT to the planet (perpendicular to the radius), where
  //     events run radially. Instant orientation cue: events point out,
  //     scars run sideways.
  //   - Lower contrast (alpha ~0.65) so they sit in the crust rather
  //     than popping off it.
  //   - A 1px lighter line above the dark stroke gives a sunken "canyon"
  //     read — settled-in geology, not a clickable target.
  //   - Tiny deterministic angle jitter (+/- 0.15 rad) per scar so the
  //     field doesn't look cookie-cutter. Hash is from position, not
  //     time, so a given scar's angle stays put across frames.
  // No animation (scars are static, not events).
  function drawScars() {
    const { cx, cy, r } = view;
    ctx.save();
    ctx.lineCap = 'round';
    // Visual bounds span ALL scar sources: background pressure (1.5-4),
    // fault auto-resolve (3-10), and plume auto-erupt (6-14). Using the
    // tightest source range for visuals would mis-size the others (ambient
    // scars look too heavy; plume ruptures look capped).
    const SCAR_VISUAL_MIN = 1.5;
    const SCAR_VISUAL_MAX = 14;
    for (const s of state.scars) {
      const px = cx + s.x * r;
      const py = cy + s.y * r;
      const damage = clamp(s.damage || SCAR_VISUAL_MIN, SCAR_VISUAL_MIN, SCAR_VISUAL_MAX);
      // Linear remap to [0, 1] for the size scaling.
      const t = (damage - SCAR_VISUAL_MIN) / (SCAR_VISUAL_MAX - SCAR_VISUAL_MIN);
      const length = 6 + t * 12;                 // 6px (ambient) → 18px (plume rupture)
      const width = 0.8 + t * 2.0;               // 0.8px → 2.8px
      // Perpendicular to the radius: rotate the radial angle by 90°. Add
      // a small deterministic jitter so scars don't look cloned.
      const radialAng = Math.atan2(s.y, s.x);
      const jitter = Math.sin(s.x * 91 + s.y * 53) * 0.15;
      const ang = radialAng + Math.PI / 2 + jitter;
      const dx = Math.cos(ang) * length * 0.5;
      const dy = Math.sin(ang) * length * 0.5;
      // Dark sunken stroke — softened from 0.85 → 0.65 so scars settle
      // into the crust instead of competing with active events.
      ctx.strokeStyle = 'rgba(28, 20, 14, 0.65)';
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(px - dx, py - dy);
      ctx.lineTo(px + dx, py + dy);
      ctx.stroke();
      // Thin lit highlight 1px above — reads as a sunken crack with a
      // sunlit upper rim, the canyon-style depth treatment.
      ctx.strokeStyle = 'rgba(230, 215, 195, 0.22)';
      ctx.lineWidth = Math.max(0.8, width - 0.4);
      ctx.beginPath();
      ctx.moveTo(px - dx, py - dy - 1);
      ctx.lineTo(px + dx, py + dy - 1);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Draw permanent geology — TerrainFeatures from handled events. Branches
  // on kind so the player can read their autobiography by shape:
  //   - VolcanicRidge (from StressedFault):  radial-line ridge, tan crest.
  //   - BasaltPatch    (from BuildingPlume): filled tan dome, dark base.
  // Same warm tan palette family so they belong to one geology, but the
  // line-vs-dome distinction matches the event-kind that produced them.
  // Static (no animation) — features are persistent geology.
  function drawFeatures() {
    const { cx, cy, r } = view;
    // PR 3: in sacrifice mode (Will depleted), old features get a
    // dotted pulsing halo so the player can SEE which pieces of their
    // autobiography are spendable right now.
    const inSacrificeMode = state.influence < RELEASE_COST;
    ctx.save();
    ctx.lineCap = 'round';
    for (const f of state.features) {
      const px = cx + f.x * r;
      const py = cy + f.y * r;

      if (inSacrificeMode && isSacrificable(f)) {
        const breath = 0.65 + 0.35 * Math.sin(performance.now() / 700);
        ctx.save();
        ctx.strokeStyle = `rgba(245, 130, 110, ${0.7 * breath})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 5]);
        ctx.beginPath();
        ctx.arc(px, py, SACRIFICE_TAP_SNAP_RADIUS * view.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      if (f.kind === 'BasaltPatch') {
        // Filled dome — a circle, NOT a line. Quality scales the radius
        // with a clamp so even tiny BasaltPatches are readable and huge
        // ones don't drown the planet.
        const radius = clamp(8 + f.quality * 0.9, 8, 30);

        // Outer warm halo — soft glow lifts the patch off the crust.
        const halo = ctx.createRadialGradient(px, py, radius * 0.5, px, py, radius * 1.7);
        halo.addColorStop(0, 'rgba(255, 200, 130, 0.32)');
        halo.addColorStop(1, 'rgba(255, 200, 130, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(px, py, radius * 1.7, 0, Math.PI * 2);
        ctx.fill();

        // Dark base shadow — slightly offset down so the patch sits on
        // the surface like a low cone.
        ctx.fillStyle = 'rgba(20, 14, 10, 0.75)';
        ctx.beginPath();
        ctx.arc(px, py + 1.5, radius + 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Body — warm tan, the cooled basalt surface.
        ctx.fillStyle = 'rgba(200, 150, 95, 0.95)';
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();

        // Lit highlight near the top — short bright arc gives the dome
        // its 3D read.
        ctx.strokeStyle = 'rgba(255, 240, 210, 0.8)';
        ctx.lineWidth = Math.max(1, radius * 0.12);
        ctx.beginPath();
        ctx.arc(px, py - 1, radius * 0.65, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
        continue;
      }

      // Default: VolcanicRidge — radial-line ridge.
      // Length scales with quality. Larger range than before so high-quality
      // (Deep tier on a near-rupture event = quality ~24) features read as
      // distinctly massive vs. a low-quality (Normal on a young event) one.
      const length = clamp(18 + f.quality * 2.4, 18, 80);
      const ang = Math.atan2(f.y, f.x);
      const dx = Math.cos(ang) * length * 0.5;
      const dy = Math.sin(ang) * length * 0.5;

      // Outer warm halo — wide and soft, lifts the ridge off the crust.
      ctx.strokeStyle = 'rgba(255, 200, 130, 0.30)';
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(px - dx, py - dy);
      ctx.lineTo(px + dx, py + dy);
      ctx.stroke();

      // Dark shadow stroke — outlines the ridge so it reads against the
      // bright Hadean / pale Stillness epochs alike.
      ctx.strokeStyle = 'rgba(20, 14, 10, 0.85)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(px - dx + 0.5, py - dy + 1);
      ctx.lineTo(px + dx + 0.5, py + dy + 1);
      ctx.stroke();

      // Bright ridge crest — the visible spine of the new mountain.
      ctx.strokeStyle = 'rgba(245, 230, 200, 0.95)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(px - dx, py - dy);
      ctx.lineTo(px + dx, py + dy);
      ctx.stroke();

      // Thin lit highlight — top edge catches the light.
      ctx.strokeStyle = 'rgba(255, 250, 230, 0.7)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(px - dx, py - dy - 1);
      ctx.lineTo(px + dx, py + dy - 1);
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

    // Geology layer — scars first (permanent damage), then features
    // (handled events as ridges), then live events on top (ripening
    // faults). All render inside the planet clip so visuals near the rim
    // don't bleed into space.
    drawScars();
    drawFeatures();
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
    drawLastResolution();
  }

  // Floating-delta + ring feedback at the most recent event resolution
  // (handled or scarred). Lives ~1.6s, drifts upward, fades. The single
  // most informative bit of feedback in the loop: did the planet just
  // gain or lose, and by how much.
  function drawLastResolution() {
    const lr = state.lastResolution;
    if (!lr) return;
    const { cx, cy, r } = view;
    const LIFETIME_MS = 1600;
    const age = performance.now() - lr.bornAt;
    const life = Math.max(0, 1 - age / LIFETIME_MS);
    if (life <= 0) { state.lastResolution = null; return; }

    const px = cx + lr.x * r;
    const py = cy + lr.y * r;
    const handled = lr.kind === 'handled';
    const sacrificed = lr.kind === 'sacrifice';

    ctx.save();

    // Expanding ring — warm tan for handled releases, warm pink-red for
    // sacrifices (visually distinct from both gain and rupture), dark
    // red for ruptures.
    const ringColor = handled
      ? `rgba(245, 220, 180, ${0.85 * life})`
      : sacrificed
        ? `rgba(245, 130, 110, ${0.85 * life})`
        : `rgba(220, 80, 60, ${0.8 * life})`;
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(px, py, 8 + (1 - life) * 24, 0, Math.PI * 2);
    ctx.stroke();

    // Floating delta number — drifts upward and fades. The most important
    // immediate read: did this event help or hurt, and by how much.
    const rise = (1 - life) * 36;
    const fontSize = Math.max(20, Math.round(r * 0.13));
    const sign = lr.delta >= 0 ? '+' : '';
    const txt = `${sign}${lr.delta.toFixed(1)}`;
    const textAlpha = Math.min(1, life * 1.6);
    const tx = px;
    const ty = py - 18 - rise;
    ctx.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    // Black outline via 4-direction offset — legible on every palette.
    ctx.fillStyle = `rgba(0, 0, 0, ${0.8 * textAlpha})`;
    for (const [ox, oy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [1, 1], [-1, -1]]) {
      ctx.fillText(txt, tx + ox, ty + oy);
    }
    ctx.fillStyle = handled
      ? `rgba(140, 230, 160, ${textAlpha})`
      : sacrificed
        ? `rgba(245, 175, 145, ${textAlpha})`
        : `rgba(245, 110, 95, ${textAlpha})`;
    ctx.fillText(txt, tx, ty);

    ctx.restore();
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
    const activeEvents = state.events.filter(e => e.status === 'active');
    const ripeEvent = activeEvents.find(e => eventMaturity(e) >= 0.85);
    const noEvents = activeEvents.length === 0;
    const inSacrificeMode = state.influence < RELEASE_COST;
    const hasSacrificable = state.features.some(isSacrificable);
    const hasActiveEvent = activeEvents.length > 0;

    els.hint.classList.toggle('ready', ready && !ripeEvent);
    // .urgent is suppressed in sacrifice mode — the sacrifice copy has
    // its own mood (heavy choice, not panic).
    els.hint.classList.toggle('urgent', !!ripeEvent && !inSacrificeMode);

    if (inSacrificeMode && hasSacrificable && hasActiveEvent) {
      els.hint.textContent = 'will depleted — tap an old feature to sacrifice it and nudge an event back';
    } else if (ripeEvent && ready) {
      els.hint.textContent = 'an event is cresting — tap before it ruptures';
    } else if (ripeEvent) {
      const pct = Math.floor((state.influence / RELEASE_COST) * 100);
      els.hint.textContent = `cresting — will ${pct}% (it will rupture without you)`;
    } else if (noEvents && ready) {
      els.hint.textContent = 'your crust is quiet — waiting for stress to build';
    } else if (ready) {
      els.hint.textContent = 'tap an event to release — hold for a heavier outcome';
    } else {
      const pct = Math.floor((state.influence / RELEASE_COST) * 100);
      els.hint.textContent = `gathering will… ${pct}%`;
    }
  }

  function renderHUD() {
    const stability = computeStability();
    els.stabilityVal.textContent = Math.round(stability);
    els.stabilityFill.style.width = `${stability}%`;

    els.influenceVal.textContent = Math.floor(state.influence);
    els.influenceFill.style.width = `${clamp(state.influence, 0, 100)}%`;

    els.age.textContent = formatAge(state.ageTicks);
    els.epoch.textContent = `${romanEpoch(state.epoch)} · ${epochInfo(state.epoch).name}`;
    els.eventCount.textContent = state.events.filter(e => e.status === 'active').length;
    els.scarCount.textContent = state.scars.length;

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
    // Sacrifice mode: when Will is below the Normal-tier cost, the player
    // can't afford a release — but they CAN spend a feature from a prior
    // epoch to nudge an event back. Routes BEFORE the !tier guard
    // because tierFromHold returns null in this regime (no affordable
    // tier), and we need that null to fall through to the sacrifice
    // path instead of bailing.
    //
    // No fallthrough to event-handling: in sacrifice mode the player has
    // no Will, so handleEvent would no-op anyway. Keeping the path
    // explicit avoids confusion.
    if (state.influence < RELEASE_COST) {
      const f = findSacrificableNear(px, py);
      if (f) return sacrificeFeature(f);
      return null;
    }
    if (!tier) return null;            // shouldn't happen — tierFromHold guards
    const event = findEventNearPoint(px, py);
    if (!event) return null;            // tap missed any event
    return handleEvent(event, tier);
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
