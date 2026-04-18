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
| I. Time always passes | ✅ | `setInterval(tick, TICK_MS)` in `game.js` runs regardless of focus. |
| II. All change is permanent | 🟡 | Faults persist across epochs in memory; no save-to-disk yet, so a reload wipes history. |
| III. Pressure always releases | ✅ | Auto-release fires at `pressure >= 99.99` with biased floor/ceiling. |
| IV. Probabilistic outcomes | ✅ | `performRelease` rolls in `[floor, ceiling]` — bounds scale with pressure AND local scarring. |
| V. Complexity is generative | ✅ | `faultDensityAtAngle()` drives width and mean of the release distribution; virgin crust = tighter/positive, scarred = wider/negative drift. Scarring visualized as a heatmap ring around the planet. |
| VI. Stability is earned | 🟡 | Stability gate triggers epoch advance and geology carries forward, but epochs are visually indistinguishable. |
| Spatial agency | ✅ | Player taps *where* on the planet to release. Each tap is a real decision — location, not just timing. |
| Core loop (pressure events) | 🟡 | One pressure system (tectonic). River meander / volcanic hotspot not implemented. |
| Visual layer choice | ❓ | Currently abstract top-down; open question still open. |
| Player identity | ❓ | Currently implicit god-figure (tap to intervene). Open. |
| Law VII | ❓ | Undefined. |

Legend: ✅ complete · 🟡 partial · ❌ not started · ❓ open design question
