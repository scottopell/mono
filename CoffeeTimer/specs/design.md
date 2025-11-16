# Coffee Timer - Technical Design

## Architecture Overview

Single-page static web application with no backend dependencies. Pure HTML, CSS, and vanilla JavaScript implementing a state machine for brew phases.

**Technology Stack:**
- HTML5 for structure
- CSS3 for styling and animations (screen flashing)
- Vanilla JavaScript for state management and timer logic
- Web Vibration API for haptic feedback
- LocalStorage for remembering last recipe selection

**Deployment:** Simple static file hosting (can be run locally or hosted on GitHub Pages, Netlify, etc.)

## State Machine

The app operates as a finite state machine with the following states:

```
RECIPE_SELECTION
    ↓ (user selects recipe and taps "Start Brew")
BLOOM_PHASE (60s countdown, user-paced)
    ↓ (user taps "Start First Pour" after timer reaches 0)
FIRST_POUR_PHASE (user-paced, tap to advance)
    ↓ (user taps "Pour Complete")
SECOND_POUR_PHASE (user-paced, tap to advance)
    ↓ (user taps "Pour Complete")
BREW_COMPLETE
    ↓ (user taps "Start New Brew")
RECIPE_SELECTION
```

## Data Models

### RecipeConfig
```javascript
{
  type: 'single' | 'double',
  coffee: number,        // grams of coffee
  totalWater: number,    // total grams of water
  bloomWater: number,    // grams for bloom (2x coffee)
  pourWater: number      // grams per pour ((totalWater - bloomWater) / 2)
}
```

**Predefined Recipes:**
- Single: `{type: 'single', coffee: 25, totalWater: 350, bloomWater: 50, pourWater: 150}`
- Double: `{type: 'double', coffee: 50, totalWater: 700, bloomWater: 100, pourWater: 300}`

### AppState
```javascript
{
  currentPhase: 'RECIPE_SELECTION' | 'BLOOM_PHASE' | 'FIRST_POUR_PHASE' | 'SECOND_POUR_PHASE' | 'BREW_COMPLETE',
  recipe: RecipeConfig,
  phaseStartTime: number,    // timestamp when current phase began
  lastCheckInTime: number,   // timestamp of last user interaction
  alertActive: boolean       // whether check-in alert is currently firing
}
```

## Component Interactions

### Timer Logic

**Bloom Phase (REQ-CT-003, REQ-CT-009):**
- Start 60-second countdown on phase entry
- `setInterval()` updates display every 100ms for smooth countdown
- Show "Start First Pour" button when countdown reaches 0
- User manually advances to FIRST_POUR_PHASE by tapping button
- Display format: "0:45" (minutes:seconds)

**Pour Phases (REQ-CT-009):**
- Start elapsed timer on phase entry
- `setInterval()` updates display every 100ms
- Display format: "0:23" (minutes:seconds elapsed)
- User manually advances via "Pour Complete" button

### Check-In Alert System (REQ-CT-007)

**Trigger Condition:**
- Active in FIRST_POUR_PHASE and SECOND_POUR_PHASE only
- Check every 1 second if (currentTime - lastCheckInTime) > 60000ms

**Alert Behavior:**
- Screen Flash: Toggle CSS class that switches background between high-contrast colors
  - Implementation: Add/remove `.alert-flash` class that triggers CSS animation
  - Animation: `@keyframes flash` alternates background-color every 500ms
- Haptic Feedback: Call `navigator.vibrate([200, 100, 200])` every 5 seconds
  - Pattern: vibrate-pause-vibrate for noticeable tactile alert

**Alert Cancellation:**
- Clear alert when user taps "Pour Complete" (updates lastCheckInTime)
- Clear alert when leaving pour phase

### User Interaction Flow

1. **Recipe Selection (REQ-CT-001):**
   - Render two large buttons: "Single Portion (25g/350g)" and "Double Portion (50g/700g)"
   - Load last selection from localStorage, default to double
   - Highlight selected recipe with CSS class

2. **Start Brew (REQ-CT-002):**
   - Tap "Start Brew" button
   - Transition to BLOOM_PHASE
   - Display bloom water amount and start countdown

3. **Bloom Phase (REQ-CT-003):**
   - Display: "Pour [bloomWater]g to bloom grounds"
   - Display: Countdown timer
   - Display: "Start First Pour" button (hidden until timer reaches 0:00)
   - User taps button to advance to FIRST_POUR_PHASE when ready

4. **First Pour (REQ-CT-004, REQ-CT-005):**
   - Display: "Pour [pourWater]g - First Pour"
   - Display: Elapsed timer
   - Display: Large "Pour Complete" button
   - Start check-in alert monitor
   - On tap: Transition to SECOND_POUR_PHASE

5. **Second Pour (REQ-CT-006, REQ-CT-005):**
   - Display: "Pour [pourWater]g - Final Pour"
   - Display: Elapsed timer
   - Display: Large "Pour Complete" button
   - Start check-in alert monitor
   - On tap: Transition to BREW_COMPLETE

6. **Brew Complete (REQ-CT-010):**
   - Display: "Brew Complete! Enjoy your coffee ☕"
   - Display: "Start New Brew" button
   - On tap: Return to RECIPE_SELECTION with previous selection remembered

## Error Handling Strategy

**Vibration API Unavailable:**
- Graceful degradation: Check `if ('vibrate' in navigator)` before calling
- Fall back to screen flash only if vibration not supported (desktop browsers)

**Timer Drift:**
- Use `Date.now()` timestamps instead of counting setInterval calls
- Calculate elapsed/remaining time from timestamps to avoid drift
- Example: `remainingSeconds = 60 - Math.floor((Date.now() - phaseStartTime) / 1000)`

**Page Visibility:**
- Timers continue running even if page loses focus or screen locks (intentional)
- Haptic alerts may not fire if screen is locked (browser limitation, acceptable)

**State Corruption:**
- No localStorage persistence of current brew state (intentional - losing a brew is better than resuming in wrong state)
- Only persist recipe selection between sessions

## Testing Strategy

### Manual Testing Procedures

**REQ-CT-001: Recipe Configuration**
- [ ] Default selection is double portion
- [ ] Tapping single portion highlights it and shows 25g/350g
- [ ] Tapping double portion highlights it and shows 50g/700g
- [ ] Selection persists after page reload

**REQ-CT-002: Start Brew**
- [ ] Start brew with single portion shows "Pour 50g to bloom grounds"
- [ ] Start brew with double portion shows "Pour 100g to bloom grounds"
- [ ] Countdown begins immediately

**REQ-CT-003: Bloom Phase**
- [ ] Timer counts down from 60 seconds
- [ ] "Start First Pour" button appears when timer reaches 0 seconds
- [ ] Tapping "Start First Pour" advances to first pour phase
- [ ] Button is hidden during countdown

**REQ-CT-004: First Pour**
- [ ] Single portion shows "Pour 150g - First Pour"
- [ ] Double portion shows "Pour 300g - First Pour"
- [ ] Elapsed timer counts up

**REQ-CT-005: Pour Completion**
- [ ] Tapping "Pour Complete" in first pour advances to second pour
- [ ] Tapping "Pour Complete" in second pour advances to completion
- [ ] Button is large and easy to tap

**REQ-CT-006: Second Pour**
- [ ] Single portion shows "Pour 150g - Final Pour"
- [ ] Double portion shows "Pour 300g - Final Pour"
- [ ] Elapsed timer counts up

**REQ-CT-007: Check-In Alert**
- [ ] Alert activates after 60 seconds in first pour phase
- [ ] Alert activates after 60 seconds in second pour phase
- [ ] Screen flashes with high-contrast colors
- [ ] Haptic feedback fires every 5 seconds (test on mobile device)
- [ ] Alert stops when "Pour Complete" tapped
- [ ] No alert during bloom phase or recipe selection

**REQ-CT-008: Large Display**
- [ ] Phase instructions are at least 48px font size
- [ ] Timer numbers are at least 72px font size
- [ ] "Pour Complete" button is at least 200px tall
- [ ] Readable from 2-3 feet away at an angle

**REQ-CT-009: Timer Display**
- [ ] Bloom phase shows countdown (60, 59, 58...)
- [ ] Pour phases show elapsed time (0:00, 0:01, 0:02...)

**REQ-CT-010: Brew Completion**
- [ ] Displays "Brew Complete! Enjoy your coffee ☕"
- [ ] Shows "Start New Brew" button
- [ ] Tapping "Start New Brew" returns to recipe selection
- [ ] Previous recipe selection is pre-selected

## Security Considerations

**No security concerns:**
- No user data collection
- No external API calls
- No authentication or authorization
- No sensitive information processed

**Privacy:**
- Only localStorage usage is recipe preference (non-sensitive)
- Runs entirely client-side, no network requests

## Performance Considerations

**Timer Accuracy:**
- 100ms interval for smooth visual updates without excessive CPU usage
- Timestamp-based calculations prevent drift over long sessions

**Battery Life:**
- Continuous timers and intervals complete within 5-10 minutes (typical brew time)
- Screen flashing may increase battery usage during alerts (acceptable for critical notification)

**Memory:**
- Single page app with no dynamic DOM creation/destruction
- Minimal memory footprint (<1MB)
- No memory leaks (intervals cleared on state transitions)

**Responsive Design:**
- Mobile-first approach (primary use case is phone on counter)
- Viewport meta tag: `<meta name="viewport" content="width=device-width, initial-scale=1.0">`
- Touch-friendly button sizes (minimum 200px tall for primary actions)
- Prevent text selection and double-tap zoom for cleaner interaction
