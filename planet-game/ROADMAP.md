# Implementation Roadmap — Events, Not Ticks

Working spec: [`spec.allium`](./spec.allium). Direction lock: [`VISION.md`](./VISION.md) → "Design Pivot: Events, Not Ticks".

The pivot is structural, not additive. Most of the current code (Pressure/Volcanic gauges, tap-anywhere release, stored-stability deltas, scarring as direct outcome modifier) gets removed. We rebuild around discrete map events.

## What survives, what leaves

**Survives, mostly intact:**
- `state.planetSeed`, terrain bake, palette tinting per epoch
- 10-epoch arc with named epochs and palette table
- First-person copy throughout
- `harness.js` API surface (extended for the new verbs)
- Charged-tap UX (hold to charge, pie-chart ring) — *reframed* as charge per event tap, same interaction
- localStorage persistence (schema changes; bump SAVE_VERSION → 2)
- Visibility-aware sim loop, MAX_CATCHUP_MS pattern

**Survives, repurposed:**
- `state.faults[]` → split into `state.features[]` (handled-event terrain) and `state.scars[]` (ignored-event damage)
- `faultDensityAt(x,y)` → `scarDensityAt(x,y)` (only ignored-event damage now)
- `pointFromClient` + tap routing — gets a "snap-to-event" pass

**Leaves entirely:**
- `state.pressure`, `state.volcanic` (gauges go away)
- `PRESSURE_RATE`, `VOLCANIC_BASE_RATE`, `VOLCANIC_PER_FAULT`, etc.
- `releaseBounds()` — no more rolling outcomes from a band
- Auto-eruption at P=100 / V=100
- Hotspot computation (`refreshHotspots`, `computeHotspots`) — replaced by spawn-bias logic
- "Tap anywhere on the planet" — taps now must hit an event
- Direct `state.stability += delta` — stability becomes derived
- `releaseRing` lastTap visualisation in current form (replaced by event-resolution feedback)

## Slice plan — four PRs to playable

Each PR is independently playable and gets a real playtest before the next. Tuning happens in-PR; we don't stack five untested mechanics.

### PR 1 — Foundation: events, spawn, handle, auto-resolve

**Goal:** one event type (`StressedFault`) ripens visibly, can be handled or ignored, produces visible terrain or scars accordingly. Stability becomes derived. *This is the smallest cut that proves the loop.*

Scope:
- Rip out Pressure, Volcanic gauges; remove HUD rows; remove auto-eruption tick paths
- New `state.events[]` array; minimal `Event` shape `{kind, x, y, spawnedAt, lifetime, status}`
- Spawn cadence loop: every 30-60s while queue not full, spawn a `StressedFault` at a position biased by existing `scarDensityAt` (not random)
- Event maturity = `(now - spawnedAt) / lifetime`, clamped 0..1
- Visual stages: render the fault with 4-5 discrete looks based on maturity bucket (hairline, fissure, glowing crack, pulsing, about-to-rupture)
- Tap-to-handle: clicking near an event (within snap radius) routes to handle path. Apply existing charge tier multiplier
- Auto-resolve: when maturity hits 1.0, event becomes a `Scar` and is removed from `state.events`
- Stability becomes derived: `epochAnchor + sumOfFeatureQuality - sumOfScarDamage` recomputed per frame
- HUD: replace Pressure/Volcanic gauges with `Events live: N/5`. Stability and Will gauges stay.
- Charge ring works on event taps; "need 10 will" cue stays
- Persistence: bump `SAVE_VERSION = 2`. Include events array, features, scars, epochAnchor

Done when: you can sit and watch a fault grow over 90s, tap it at any stage and see a ridge appear, ignore the next one and see a scar appear, and stability moves accordingly. ~1-2 focused days.

### PR 2 — BuildingPlume + queue cap + background scars

**Goal:** second event type with the volcanic-resurfacing reward. Queue-full no longer pauses the world.

Scope:
- Add `BuildingPlume` event variant. Spawns only where local scar density exceeds threshold (so plumes appear *because* of player damage history)
- Plume handling: same charge tier, but also resurfaces nearby scars (existing logic mostly survives, ported)
- Queue cap enforcement (already 5 from PR 1, but explicitly verify spawn-pause logic)
- Background scar accumulation: when queue is full, drop a small scar every ~50s in the densest scar region
- Visual: plume's 4-5 stages (bulge → dome → smoking → fissured → erupting)

Done when: deliberate scarring leads to plume opportunities, plumes resurface scars, walking away with a full queue costs you visible damage. ~1 day.

### PR 3 — Sacrifice mode (Phase-2 weak verb)

**Goal:** Will-depleted players have agency through cost.

Scope:
- Tag `state.features[]` entries with `bornInEpoch` (already implicit; lift to explicit field)
- When `state.will < 10`, enter sacrifice mode: features with `age >= 1 epoch` get a dotted halo overlay
- New gesture: tap a halo'd feature → enters sacrifice mode armed with that feature → tap a target event → sacrifice fires
- Sacrifice effect: shifts target event's `spawnedAt` forward by `featureQuality * 5s`, capped at half its lifetime
- Sacrificed feature is removed from the map and from terrain re-bakes
- Hint copy: "your will is spent — sacrifice an old feature for emergency intervention"

Done when: Will-depleted spectator phase becomes a tense choice instead of helplessness. ~1 day.

### PR 4 — First major event (Orogeny)

**Goal:** validate the multi-session timescale and the "log in, see slow change" feel.

Scope:
- `Orogeny` event variant. Lifetime 8-15 minutes. Spawns when two land masses are close (geometric heuristic on terrain bake)
- Visual: a slow visible bulge between the two land masses. 4 milestone stages over ~12 minutes (subtle dome → range emerging → ridges visible → ridge complete)
- Handling: same charge tier interaction, but stakes are larger (`quality * 2.0`)
- Auto-resolve produces a scar that *rebakes the terrain* (orogenic damage actually deforms the disc)
- Persistence: ensure event survives reload, maturity continues to advance via `MAX_CATCHUP_MS` catchup math
- Post-resolution terrain re-bake — the ridge becomes part of the planet's silhouette

Done when: you can leave the tab for 5 minutes, return, see your orogeny advanced visibly, and choose to act. ~1-2 days.

## Beyond PR 4

Order is flexible based on PR-1-through-4 playtest feedback. Likely candidates:

- Remaining major events: `Supervolcano`, `Rifting`, `GlacialAdvance` — each adds a new terrain mutation
- Compound-interest fix for stability (open question `StabilityCompoundingTrap`): epoch-decaying quality vs. rising goal vs. anchor formula
- Charge tier opportunity cost (open question `ChargeTierOpportunityCost`)
- Ending beat for Stillness — currently a deferred trigger emission only
- Climate coupling per epoch (mountains block glaciers, ridges become reefs, etc.)
- Hover-to-inspect terrain features ("raised in epoch 3 by volcanic vent")

## Risks and watch-outs

- **The terrain rebake on every major-event resolution** could become expensive at high feature counts. Profile in PR 4.
- **Stability-derived recompute** runs every frame. Cache per-feature contributions; only re-sum when features/scars change.
- **PR 1's spawn cadence is a tuning trap.** Ship it tunable via constants, defer the cadence-by-epoch table to a follow-up after we see how 30-60s feels.
- **Save migration.** v1 saves contain Pressure/Volcanic state. PR 1 must drop them gracefully (treat as null and start fresh) without wiping the planet seed.
- **Charged-tap ergonomics on tiny event targets.** Snap radius needs real testing; we may need to widen the tap-to-event threshold to 50-60px effective.

## Definition of "playable"

After PR 1: I can watch a fault build, decide whether to tap, and feel the consequence on the map and on stability. The loop is legible.

After PR 2: I can choose to scar deliberately to set up a plume opportunity. I can see the cost of stepping away.

After PR 3: I have agency in the spectator phase. The autobiography mechanic gains weight (because spending it has a cost).

After PR 4: Long-arc events make sessions matter to each other. The planet is something I'm watching grow.
