# Hotspot — a geological idle MVP

A tiny MVP of the "Untitled Planet Game." One pressure system (volcanic), one
intervention (release), one probabilistic outcome, one cross-section of history,
one stability bar, two epochs.

The goal of this build is **not** a finished game — it's the cheapest possible
answer to: *does the core loop ("I choose when, not if") feel like anything?*

## Play it

No build step. Open `index.html` in a browser. That's it.

```
open PlanetGame/index.html      # macOS
xdg-open PlanetGame/index.html  # Linux
```

## The loop

- Pressure rises every second on its own.
- At pressure ≥ 20 you can **Release** (button or `Space`).
- The preview bar shows the range of possible outcomes *before* you commit.
  - **Low pressure**: narrow range, small reliable stability gain.
  - **High pressure**: wide range. Could land in the sweet spot (big gain),
    below it (modest gain), or above it (destabilizes — stability goes backward).
- Every release deposits a stratum in the cross-section. Thickness tracks the
  pressure you released at; color tracks the tier (calm / moderate / violent);
  a colored left-edge marks the band (green = sweet, grey = below, red = above).
- Fill stability to 100 → **Epoch II**. The sweet spot shifts upward, and
  every rich stratum you laid down (pressure ≥ 70 at release) now adds a flat
  bonus to every outcome. Patience compounds.
- Epoch II stable → the planet is at rest. Reflect, reload.

If pressure caps at 100 and you don't act, the planet releases itself in 5
seconds. Law 3: pressure always releases — with or without you.

## Design decisions locked in (MVP)

- **System**: volcanic hotspot (visceral build/release rhythm).
- **Time**: live 1s tick.
- **Visuals**: side-view cross-section; newest stratum on top.
- **Epochs**: two. Epoch II changes exactly one rule (sweet-spot shift + richness
  amplifies outcomes) so you feel "stability is earned" and "complexity compounds."
- **Cut for MVP**: fault/river systems, top-down map, influence currency,
  minerals/climate as separate dimensions, save/load, sound, Law VII.

## Tuning knobs

All at the top of the `<script>` block in `index.html`. Edit, refresh:

| Constant | Default | What it changes |
|---|---|---|
| `TICK_MS` | 1000 | Pace of the idle clock |
| `PRESSURE_PER_TICK` | 2 | How fast pressure builds |
| `RELEASE_MIN_PRESSURE` | 20 | How long before you can do anything |
| `POST_RELEASE_PRESSURE` | 5 | Residual pressure after release |
| `AUTO_RELEASE_COUNTDOWN` | 5 | How much warning before the planet self-releases |
| `EPOCH_RULES[n].sweetSpot` | `[35,75]` → `[65,105]` | Where the payout band sits |
| `EPOCH_RULES[n].richnessBonus` | `0` → `3` | How much history amplifies outcomes |

## What to watch for while playtesting

(Borrowed from `PathOfErosion/CLAUDE.md` — it applies here.)

1. **Does the "when, not if" choice feel real?** If every release feels the
   same, the distribution-width mechanic isn't paying off. Widen the variance,
   or shift the sweet spot further from the mean.
2. **Does Epoch II feel different?** If the rule change is invisible, make it
   bigger. If it's punishing, dial back the sweet-spot shift.
3. **Does the cross-section feel like *your* planet?** If all strata look the
   same by the end, increase the visual differentiation between tiers.
4. **Does the self-release feel like consequence or cheap shot?** If players
   feel robbed, lengthen the countdown or soften the destabilization penalty.

## Open questions (for after the first playtest)

- Should low-pressure releases really be "safe"? Maybe they should also have a
  small chance of doing nothing, so patience has teeth.
- Is two epochs enough to feel the compounding, or do we need three?
- Does the cross-section need labels/eras, or is it more evocative unlabelled?
- **Law VII** remains unwritten. Candidates:
  - "The planet remembers the observer." (meta-mechanic — unlock-based)
  - "Nothing is lost, but not everything is legible." (some strata hidden)
  - "Every era is watched from the next." (a future epoch comments on the past)

## Repo conventions used

- Single-file HTML/CSS/JS, following `bubble-sort-visualizer/`.
- No `specs/` directory yet. Per the repo's YAGNI rule, we add EARS specs once
  playtests show the game is worth formalizing. Until then, this README + the
  game's own design doc are the whole spec.
