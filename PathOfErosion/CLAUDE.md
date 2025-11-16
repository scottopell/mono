# Development Philosophy: Path of Erosion

## Core Principle: Prototype-Driven, Player-Tested, Iteration-Based

This is not a traditional software project. It's a **game design laboratory**. The goal is rapid learning through play, not perfect execution.

Our mantra: **Playable today > Perfect next month**

---

## Why Web First

- **Zero friction** - No build tools, no dependencies, no setup. Code it, refresh, play it.
- **Instant sharing** - Send a URL to playtesters. They're playing within seconds.
- **Fast feedback loops** - Change a number, refresh, immediately feel the impact.
- **Works everywhere** - Desktop, tablet, phone. All the same codebase.

Once the game is fun and stable, we port to iOS. At that point, we know exactly what we're building.

---

## The Iteration Philosophy

**Move fast and learn from play, not assumptions.**

This means:
- Build something barely playable immediately
- Play it yourself obsessively
- Show it to others and watch them (don't explain)
- Change based on what you learn, not what you planned
- Repeat until it's undeniably fun

The worst thing you can do is spend a week perfecting something that turns out to be unfun. Better to ship something rough that works, then refine it.

---

## Playing vs Building

**You should spend 80% of your time playing and 20% building.**

This sounds backwards, but it's the secret. Every 30 minutes of coding should be followed by 2 hours of play:
- Playing your own game (does it feel good?)
- Playing edge cases (what breaks?)
- Watching others play (what confuses them?)
- Adjusting based on feel (does that number feel right?)

The game teaches you what it needs.

---

## Decision-Making: Feel First, Data Second

When you're tempted to overthink:
- **Don't ask**: "Should hazards be 30% or 40%?"
- **Do ask**: "Does this *feel* like the right difficulty?"

Play with different values. Notice when the game stops being fun. That's your answer.

The first version won't be perfect. That's fine. You're looking for the direction to move, not the exact destination.

---

## The Three Design Questions

Keep asking yourself these:

### 1. Does the forced card create interesting choices?
If optional cards are never picked, the forced card isn't constraining enough. If the game feels random, the forced card isn't *meaningful* enough. You should feel the weight of being forced.

### 2. Does erosion teach or punish?
Erosion should feel like a natural consequence, not a cheap shot. If playtests say "I felt cheated," you need to soften it. If they say "Ouch, I should have planned better," you nailed it.

### 3. Does the path feel like *mine*?
By the end of a session, players should feel ownership over their creation. Even if they eroded tiles away, the path should feel like a story *they* told. If they feel like passengers in someone else's game, redesign.

---

## Playtesting is Your Compass

Don't wait until it's "ready" to test. Test as soon as you have something to play.

**Early Playtests:**
- Play it yourself repeatedly
- Note frustrations and delights

**Mid Playtests:**
- Show to 1-2 close friends
- Watch them play silently (your job is to observe, not guide)
- Ask: "What was confusing?" not "Did you like it?"

**Final Playtests:**
- Show to 3-5 people you don't know well
- They'll give unfiltered feedback
- Patterns in their confusion point to design problems

**The feedback loop:**
- Listen for what they *don't* say (confusion, hesitation = design flaw)
- Notice what they *do* naturally (they'll explore your game's actual affordances)
- Ignore opinion ("I didn't like the colors"), prioritize confusion ("I didn't understand what the red tiles did")

---

## The Death Spiral to Avoid

These patterns kill prototypes before they're born:

**Perfectionism Spiral:**
"I'll ship it once the UI is polished" → 2 weeks later, you still haven't shipped → you've lost momentum

*Prevention: Ship rough. Polish once you know it's fun.*

**Scope Creep Spiral:**
"Let me add terrain-shifting tiles and multiplayer and leaderboards" → feature list balloons → nothing ships

*Prevention: Your goal this week is ONE mechanic working flawlessly. Everything else is v2.*

**Over-Planning Spiral:**
"Let me design all 50 tile types" → you build the first 5, they don't work as expected → all your plans are wrong → demoralization

*Prevention: Design just enough to start. The game will teach you what you need next.*

**Invisible Playtesting:**
"I know what players will think" → you build features based on your assumptions → nobody wants them

*Prevention: Get it in front of people. Early and often. Your intuition is wrong.*

---

## Red Flags That Mean "Rethink Now"

If you hit any of these after 2+ days, stop and reassess:

**Erosion Feels Punishing**
- Playtests say "I felt robbed" not "I should've planned better"
- Too many failed placements in a row
- Hazards are killing the vibe

→ *Soften the system. Maybe hazards should be rarer, or erosion should only remove one tile instead of a chain.*

**Optional Card Choice Never Matters**
- Players always take the optional card OR always skip it
- No tension in the decision

→ *Your forced card isn't constraining enough, or optional card isn't compelling enough. Change the distribution.*

**Path Building Feels Random**
- No coherence to the paths people build
- Decisions feel arbitrary, not strategic
- Playtests: "I was just clicking"

→ *You're missing the puzzle. Add hazards/obstacles that force difficult placement choices.*

**Can't Finish Core Loop in One Day**
- You're over-engineering something
- Too many systems interacting

→ *Cut ruthlessly. Ship the bare minimum. Everything else is v2.*

---

## The Zen Design Principles (Stay True to These)

As you iterate, never lose sight of why this game exists:

1. **No Hard Failure** - The game should never tell you "you lost." Erosion is consequence, not death.

2. **Emergence Over Prescription** - Simple rules create complex beauty. Don't prescribe how the path should look; let placement rules guide it.

3. **Rhythm of Build and Release** - Growing the path should feel satisfying. Erosion should sting but teach. This rhythm is meditative.

4. **Player Agency Despite Constraints** - The forced card seems restrictive, but the optional card is the escape hatch. Players should feel like they're steering.

5. **Beautiful Impermanence** - Some paths will be eroded away. That's okay. The impermanence is part of the beauty.

If a feature violates these, cut it—no matter how cool it sounds.

---

## The Web-to-iOS Pipeline

Keep in mind: **You're prototyping on web, but building for iOS eventually.**

This means:
- Don't get too attached to web-specific tech
- Avoid dependencies that don't exist on iOS
- Your core game logic should be agnostic
- Touch interaction patterns you learn on web will directly translate

When it's time to port, you won't rewrite the game logic—just the rendering layer. The decisions you make now about what a "tile" is and how placement works will carry over directly.

---

## Keeping Notes

Maintain a development log. Write in it every session:

- What did you build today?
- What felt good or bad when you played?
- What did playtests reveal?
- What would you change if you started over?
- What's the next thing to test?

This isn't documentation—it's your external memory. When you're stuck, you'll read this and remember why you made a decision.

---

## Success Criteria (You're Done When...)

✅ You can play for 15+ minutes without getting bored
✅ Playtests show repeated patterns of "I want to try that again"
✅ The erosion system feels fair, not punishing
✅ Optional card choice creates real tension every time
✅ People's paths look interestingly different from each other
✅ You're more excited to polish this than to rebuild it

When all of these are true, you have a game worth building for iOS.

---

## One Guiding Principle Above All

**Let the game tell you what it needs. Your job is to listen.**

Don't fall in love with your initial design. Be willing to pivot radically if playtests reveal a better game hiding underneath.

The beauty of this approach is that you get to discover the game by playing it, together with your players. That's where the magic lives.

Now go play. 🌿
