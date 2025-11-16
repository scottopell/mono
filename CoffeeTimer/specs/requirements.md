# Coffee Timer

## User Story

As a coffee enthusiast, I need a pour over timer that keeps me on track with visual and tactile reminders so that I don't get distracted and ruin my brew by missing pour timing.

## Requirements

### REQ-CT-001: Configure Recipe Amount

WHEN the user opens the app
THE SYSTEM SHALL display options for single portion (25g coffee/350g water) or double portion (50g coffee/700g water) with double portion as the default

**Rationale:** Users brew different amounts at different times. Starting with the most common recipe (double portion) as default reduces friction for the typical use case while allowing flexibility when brewing smaller amounts.

**Dependencies:** None

---

### REQ-CT-002: Start Brew Process

WHEN the user selects a recipe and taps "Start Brew"
THE SYSTEM SHALL begin the bloom phase timer and display "Pour [amount]g to bloom grounds"

WHEN starting the bloom phase with single portion selected
THE SYSTEM SHALL display "Pour 50g to bloom grounds"

WHEN starting the bloom phase with double portion selected
THE SYSTEM SHALL display "Pour 100g to bloom grounds"

**Rationale:** Users need clear, immediate instruction on exactly how much water to pour. Bloom uses 2x the coffee weight in water (50g for single, 100g for double), and users want to start pouring immediately without mental math.

**Dependencies:** REQ-CT-001

---

### REQ-CT-003: Track Bloom Phase Timing

WHEN the bloom phase begins
THE SYSTEM SHALL count down from 60 seconds to 0 seconds

WHEN the bloom countdown reaches 0 seconds
THE SYSTEM SHALL display a "Start First Pour" button and wait for user confirmation

WHEN the user taps "Start First Pour" after bloom completes
THE SYSTEM SHALL advance to the first pour phase

**Rationale:** The bloom phase is time-based (always 1 minute), but users may not be immediately ready to pour when the timer hits zero. Requiring a button tap gives users control over when to start the next phase, preventing the app from rushing them before they're positioned with kettle in hand.

**Dependencies:** REQ-CT-002

---

### REQ-CT-004: Display First Pour Instruction

WHEN the first pour phase begins
THE SYSTEM SHALL display "Pour [amount]g - First Pour" where amount is half of remaining water

WHEN entering first pour phase with single portion
THE SYSTEM SHALL display "Pour 150g - First Pour"

WHEN entering first pour phase with double portion
THE SYSTEM SHALL display "Pour 300g - First Pour"

**Rationale:** Users focus on the center of the grounds caving in, not a timer. Clear pour amount guidance (half of remaining water after bloom) tells them exactly what to do when they see the visual cue from their coffee.

**Dependencies:** REQ-CT-003

---

### REQ-CT-005: Acknowledge Pour Completion

WHEN the user is in first pour phase or second pour phase
THE SYSTEM SHALL display a large "Pour Complete" button

WHEN the user taps "Pour Complete" during first pour phase
THE SYSTEM SHALL advance to second pour phase

WHEN the user taps "Pour Complete" during second pour phase
THE SYSTEM SHALL advance to completion phase

**Rationale:** Users pour at their own pace based on the grounds caving in, not rigid timing. A simple tap-to-acknowledge interaction keeps them in control and reflects the reality that pour timing varies based on grind, water temp, and pour technique.

**Dependencies:** REQ-CT-004

---

### REQ-CT-006: Display Second Pour Instruction

WHEN the second pour phase begins
THE SYSTEM SHALL display "Pour [amount]g - Final Pour" where amount is the remaining water

WHEN entering second pour phase with single portion
THE SYSTEM SHALL display "Pour 150g - Final Pour"

WHEN entering second pour phase with double portion
THE SYSTEM SHALL display "Pour 300g - Final Pour"

**Rationale:** Users need to know this is the last step and how much to pour. "Final Pour" provides closure and helps users mentally prepare to finish the brew, while the exact amount prevents over or under-extraction.

**Dependencies:** REQ-CT-005

---

### REQ-CT-007: Alert When User Hasn't Checked In

WHEN the user has been in first pour phase or second pour phase for more than 60 seconds without tapping "Pour Complete"
THE SYSTEM SHALL flash the screen with high-contrast colors

WHEN the user has been in first pour phase or second pour phase for more than 60 seconds without tapping "Pour Complete"
THE SYSTEM SHALL trigger haptic feedback that repeats every 5 seconds

**Rationale:** Users get distracted easily (checking messages, conversations, etc.). Flashing screen and repeating haptic feedback create impossible-to-ignore alerts that bring users back to their brew before it over-extracts. The 60-second threshold accounts for a generous pour time while catching forgotten brews.

**Dependencies:** REQ-CT-005

---

### REQ-CT-008: Display Large, Readable Instructions

WHEN the app is displaying any phase instruction or timer
THE SYSTEM SHALL use font size of at least 48px for phase instructions and at least 72px for countdown numbers

WHEN the app is displaying the "Pour Complete" button
THE SYSTEM SHALL make the button at least 200px tall

**Rationale:** Users have their phone laying flat next to the chemex, viewing at an angle while holding a kettle. Large text and buttons ensure they can read instructions and tap accurately without leaning down or picking up the phone, keeping the brewing process smooth and hands-free.

**Dependencies:** None

---

### REQ-CT-009: Show Current Timer State

WHEN the user is in bloom phase
THE SYSTEM SHALL display countdown timer showing seconds remaining

WHEN the user is in first pour or second pour phase
THE SYSTEM SHALL display elapsed time since phase began

**Rationale:** During bloom, users need to know how much longer they're waiting. During pour phases, elapsed time helps users understand if they're taking too long and provides context for the 60-second check-in alert. Different timer directions match the mental model for each phase.

**Dependencies:** REQ-CT-003

---

### REQ-CT-010: Complete Brew Session

WHEN the user taps "Pour Complete" during second pour phase
THE SYSTEM SHALL display "Brew Complete! Enjoy your coffee ☕"

WHEN the brew is complete
THE SYSTEM SHALL display a "Start New Brew" button

WHEN the user taps "Start New Brew"
THE SYSTEM SHALL return to recipe selection with previous recipe selection pre-selected

**Rationale:** Users want clear confirmation their brew is done and an easy way to start the next brew when making coffee for multiple people or back-to-back sessions. Pre-selecting the previous recipe reduces repeated tapping for users who consistently brew the same amount.

**Dependencies:** REQ-CT-006

---
