# Untitled Planet Game — Design Snapshot

## Core Premise

A geological idle game where the player guides a planet through epochs of time.
The planet accumulates history permanently — nothing resets.
You are nudging a system toward stability, then watching the next era break it open again.

---

## The Laws of the Game

1. **Time always passes.**
   The simulation runs whether you're watching or not.
2. **All change is permanent.**
   Every intervention leaves a geological record.
3. **Pressure always releases.**
   Systems that build will discharge — with or without you.
   You choose *when*, never *if*.
4. **Outcomes are probabilistic, not arbitrary.**
   History loads the dice.
   Patience shifts the distribution.
5. **Complexity is generative.**
   Richer early geology produces richer later events.
   Early patience compounds.
6. **Stability is earned, not maintained.**
   You guide toward a natural resting state for the current era.
   Then the next era arrives.

---

## Core Loop

- **Idle:** Time flows, processes tick, stability bar moves slowly.
- **Pressure events:** Visible systems build toward thresholds — fault stress, river meander, volcanic hotspot.
- **Intervention:** Spend accumulated influence to trigger a release — roll now, or wait.
- **The roll:** Low pressure = tight outcome band.
  High pressure = wide variance, higher ceiling, worse floor.
- **Epoch exit:** Hit the stability threshold → graduate to the next era, carrying all history forward.

---

## What Accumulates

- Topographic complexity (mountains, canyons, river networks)
- Mineral distribution (shaped by volcanic activity)
- Climatic memory (moraines, alluvial plains, flood records)

These silently determine what's possible in later epochs.

---

## Open Questions

- Visual layer: top-down map, cross-section, or abstract?
- Player identity: god-figure intervening, or *being* the planet?
- Law VII: what governs the player's relationship to the simulation?

---

## MVP Status — where the code stands against the vision

| Law / System | Status | Notes |
|---|---|---|
| I. Time always passes | ✅ | `driveLoop()` in `game.js` uses `performance.now()` deltas plus a `visibilitychange` catchup, so sim-time advances even when the tab is backgrounded and browsers throttle `setInterval`. Offline catchup is capped at 10 minutes. |
| II. All change is permanent | ✅ | Faults persist across epochs in memory, a fixed `state.planetSeed` keeps the same world across epochs, and full state is serialized to `localStorage` on a 1s cadence plus `pagehide`/`beforeunload`/`visibilitychange`. Reloads restore the same planet + history. |
| III. Pressure always releases | ✅ | Auto-release fires at `pressure >= 99.99` with biased floor/ceiling. |
| IV. Probabilistic outcomes | ✅ | `performRelease` rolls in `[floor, ceiling]` — bounds scale with pressure AND local scarring. |
| V. Complexity is generative | ✅ | `faultDensityAt(x,y)` drives width and mean of the release distribution; virgin crust = tighter/positive, scarred = wider/negative drift. Density is measured at the 2D tap point. Positive releases render as bright ridges, negative as shadowed canyons, so history is legible as geology. Scarring heatmap ring remains for rim-visible activity. |
| VI. Stability is earned | ✅ | Stability gate triggers epoch advance and geology carries forward. Each of 10 named epochs (Hadean → Stillness) applies a distinct palette tint at bake time, so the same seeded continents shift mood across the arc: molten red → iron dark → teal oxygenation → aqua bloom → lush green → amber warmth → temperate → smoggy → twilight violet → pale crystalline rest. |
| Spatial agency | ✅ | Player taps *where* on the planet to release. Each tap is a real decision — location, not just timing. |
| Core loop (pressure events) | 🟡 | One pressure system (tectonic). River meander / volcanic hotspot not implemented. |
| Visual layer choice | ✅ | Top-down procedural terrain: seeded fractal-noise continents/oceans on an offscreen canvas, baked once and blitted per frame, with directional shading + limb darkening. Cross-section / orbital views remain possible future modes but are no longer blocking. |
| Player identity | ✅ | You are the planet. Copy pass reframes every touchpoint in the first person — tagline, gauges (Stability is *your* composure, Will is *your* capacity to act), tap hints ("focus the pressure", "gathering will…"), log entries ("your memory carries forward"). Taps are self-directed releases, not interventions from without. |
| Law VII | ❓ | Undefined. |

Legend: ✅ complete · 🟡 partial · ❌ not started · ❓ open design question
