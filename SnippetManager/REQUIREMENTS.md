# SnippetManager Requirements

## User Story

As an iOS user, I need to save and quickly reuse text snippets across all applications so that I can avoid retyping frequently-used content like addresses, email templates, code snippets, and temporary information like flight details or URLs.

## Overview

SnippetManager is a minimal iOS text snippet manager with custom keyboard and share extensions. It supports two types of snippets:

1. **Regular Snippets**: Permanent snippets for templates, prompts, and reusable text that never expire
2. **Timed Snippets**: Transient snippets that auto-expire after 7 days for session-based content like URLs, flight info, or temporary descriptions

---

## Requirements

### 1. Viewing and Managing Snippets (Main App)

### REQ-SM-001: View All Saved Snippets

WHEN user opens the main app
THE SYSTEM SHALL display all non-expired snippets in a scrollable list

THE SYSTEM SHALL sort snippets with newest first

THE SYSTEM SHALL display the first 50 characters of each snippet's text

THE SYSTEM SHALL display a relative timestamp for each snippet (e.g., "2 hrs ago", "3 days ago")

**Rationale:** Users need to browse their saved snippets to remember what they have available and verify that snippets were saved successfully. Showing newest first helps users quickly find recently added content. Character limit prevents UI clutter while giving enough context to identify snippets.

---

### REQ-SM-002: Understand Empty State

WHEN user has no saved snippets
THE SYSTEM SHALL display "No Snippets Yet" message

THE SYSTEM SHALL display "Snippets can only be added using the share extension"

THE SYSTEM SHALL display instructions "Select text in any app, tap Share, then choose 'Save Snippet'"

**Rationale:** First-time users need clear guidance on how to add their first snippet. Making it explicit that there is no manual add button prevents confusion and sets correct expectations about the share-only workflow.

---

### REQ-SM-003: Delete Unwanted Snippets

WHEN user swipes left on any snippet in the list
THE SYSTEM SHALL reveal a delete button

WHEN user taps the delete button
THE SYSTEM SHALL immediately remove the snippet from storage

THE SYSTEM SHALL immediately update the list view to reflect deletion

**Rationale:** Users need to remove outdated snippets to keep their collection organized and relevant. Swipe-to-delete follows iOS platform conventions for a familiar user experience.

---

### REQ-SM-004: Distinguish Snippet Types Visually

WHEN displaying a timed snippet in the list
THE SYSTEM SHALL show a visual indicator that the snippet is temporary

WHEN displaying a timed snippet
THE SYSTEM SHALL show expiration information (e.g., "Expires in 3 days")

WHEN displaying a regular snippet
THE SYSTEM SHALL NOT show any expiration indicator

**Rationale:** Users need to distinguish between permanent and temporary snippets at a glance. This prevents accidental deletion of permanent snippets and helps users understand that timed snippets will automatically disappear.

---

### REQ-SM-005: Hide Expired Timed Snippets

WHEN a timed snippet has passed its 7-day expiration
THE SYSTEM SHALL NOT display the expired snippet in the list

WHEN user opens the app
THE SYSTEM SHALL filter out all expired timed snippets before displaying the list

**Rationale:** Expired timed snippets create clutter and are no longer useful. Auto-hiding them keeps the snippet list focused on relevant content without requiring manual cleanup. The 7-day window approximates a "session" for most temporary use cases like trip planning, event coordination, or short-term projects.

---

### 2. Saving Snippets from Other Apps (Share Extension)

### REQ-SM-006: Access Save Function from Any App

WHEN user selects text in any iOS app and taps the Share button
THE SYSTEM SHALL display "Save Snippet" as an option in the share sheet

THE SYSTEM SHALL accept plain text content only

THE SYSTEM SHALL NOT accept images, files, or rich formatting

**Rationale:** Users need a convenient way to save snippets while working in other apps without switching to the main app. Share sheet integration follows iOS platform conventions and makes snippet saving a natural part of the user's workflow.

---

### REQ-SM-007: Review Text Before Saving

WHEN user taps "Save Snippet" in the share sheet
THE SYSTEM SHALL display the full text content they are about to save

THE SYSTEM SHALL display "Save" and "Cancel" buttons

WHEN user taps "Cancel"
THE SYSTEM SHALL return to the original app without saving anything

**Rationale:** Users need to verify the selected text is correct before saving, especially for long selections where the boundaries might not be obvious. Seeing the full text prevents saving unwanted content.

---

### REQ-SM-008: Choose Snippet Type When Saving

WHEN user is reviewing text in the share extension
THE SYSTEM SHALL display options to save as "Regular" or "Timed" snippet

THE SYSTEM SHALL default to "Regular" snippet type

WHEN user selects "Timed"
THE SYSTEM SHALL display "Expires in 7 days" information

**Rationale:** Users need to decide at save time whether content is permanent (templates, addresses) or temporary (flight info, event URLs). Defaulting to "Regular" protects important content from accidental expiration, but timed option must be easily accessible for transient content.

---

### REQ-SM-009: Confirm Successful Save

WHEN user taps "Save" button
THE SYSTEM SHALL save the snippet with the selected type and timestamp

THE SYSTEM SHALL display "Saved!" confirmation message

THE SYSTEM SHALL automatically dismiss and return to the original app within 1 second

**Rationale:** Users need immediate feedback that their action succeeded. Quick dismissal minimizes disruption to their workflow in the original app.

---

### REQ-SM-010: Handle Save Errors Gracefully

IF the selected content cannot be extracted as plain text
THE SYSTEM SHALL display error message "Unable to extract text from the shared item"

WHEN error occurs
THE SYSTEM SHALL provide "OK" button to dismiss

THE SYSTEM SHALL return to the original app without saving

**Rationale:** Users need clear feedback when save operations fail so they understand the app isn't broken and can try again with different content. Error message should be specific enough to guide users toward successful usage.

---

### 3. Inserting Snippets via Keyboard (Keyboard Extension)

### REQ-SM-011: Enable Custom Keyboard

THE SYSTEM SHALL appear as "SnippetKeyboard" in iOS Settings → General → Keyboard → Keyboards → Add New Keyboard

WHEN user taps the globe key on their system keyboard
THE SYSTEM SHALL allow switching to SnippetKeyboard

**Rationale:** Users need to install and activate the keyboard extension to access snippets while typing in any app. Globe key is the standard iOS mechanism for keyboard switching that users already understand.

---

### REQ-SM-012: Browse Snippets in Keyboard

WHEN user activates the SnippetKeyboard
THE SYSTEM SHALL display all non-expired snippets in a horizontal scrollable view

THE SYSTEM SHALL limit keyboard height to approximately 100 points

THE SYSTEM SHALL show up to 60 characters of preview text for each snippet

THE SYSTEM SHALL show relative timestamp for each snippet

**Rationale:** Users need to browse available snippets without leaving their current app. Horizontal scrolling works better than vertical for keyboard height constraints. Preview text helps users identify the right snippet without inserting each one to see its contents.

---

### REQ-SM-013: Show Snippet Type in Keyboard

WHEN displaying a timed snippet in the keyboard
THE SYSTEM SHALL show a visual indicator that the snippet is temporary

WHEN displaying a timed snippet
THE SYSTEM SHALL show remaining days before expiration (e.g., "3d left")

**Rationale:** Users need to know which snippets are temporary while using the keyboard to avoid relying on content that will soon disappear. Compact expiration display (e.g., "3d left") works within keyboard space constraints.

---

### REQ-SM-014: Insert Snippet Text

WHEN user taps any snippet in the keyboard
THE SYSTEM SHALL insert the complete snippet text at the cursor position

THE SYSTEM SHALL insert text without any modifications or formatting changes

THE SYSTEM SHALL keep the keyboard active after insertion

**Rationale:** Users need to insert their saved text exactly as they saved it. Keeping keyboard active allows users to insert multiple snippets or continue typing immediately.

---

### REQ-SM-015: Handle Empty Keyboard State

WHEN user has no saved snippets
THE SYSTEM SHALL display "No snippets saved" message in the keyboard

WHEN all saved snippets are expired
THE SYSTEM SHALL display "No snippets saved" message in the keyboard

**Rationale:** Users need clear feedback when the keyboard has no content available. This prevents confusion about whether the keyboard is broken or simply has no snippets to show.

---

### 4. Data Consistency and Persistence

### REQ-SM-016: Share Data Across Components

WHEN user saves a snippet via the share extension
THE SYSTEM SHALL make the snippet immediately accessible to the main app

WHEN user saves a snippet via the share extension
THE SYSTEM SHALL make the snippet immediately accessible to the keyboard extension

WHEN user deletes a snippet in the main app
THE SYSTEM SHALL remove the snippet from the keyboard extension

**Rationale:** Users expect data consistency across all app components. Seeing a snippet in one place but not another would be confusing and break the user's mental model of having a single unified snippet collection.

---

### REQ-SM-017: Persist Snippets Across Sessions

THE SYSTEM SHALL persist all saved snippets across app launches

THE SYSTEM SHALL persist all saved snippets across device restarts

WHEN user closes and reopens the app
THE SYSTEM SHALL display all previously saved snippets

**Rationale:** Users need confidence that their saved snippets won't disappear. Permanent storage is essential for the app's core value proposition. Loss of snippet data would severely damage user trust.

---

### REQ-SM-018: Store Snippet Metadata

THE SYSTEM SHALL store a unique UUID for each snippet

THE SYSTEM SHALL store the complete text content without length limits

THE SYSTEM SHALL store the creation timestamp

THE SYSTEM SHALL store the snippet type (regular or timed)

WHEN snippet is timed
THE SYSTEM SHALL store the expiration timestamp (creation date + 7 days)

**Rationale:** Unique IDs enable reliable deletion and updates. Timestamps enable sorting and expiration checking. Storing snippet type and expiration enables the timed snippet feature without requiring complex cleanup logic.

---

### 5. User Experience and Performance

### REQ-SM-019: Fast App Launch

WHEN user opens the main app
THE SYSTEM SHALL display snippets within 0.5 seconds

WHEN user activates the share extension
THE SYSTEM SHALL launch within 1 second

WHEN user switches to the keyboard extension
THE SYSTEM SHALL appear within normal iOS keyboard switching time

**Rationale:** Users expect instant responsiveness for simple operations like viewing a list or switching keyboards. Slow performance breaks the flow of their work and makes the app feel broken.

---

### REQ-SM-020: Native iOS Visual Design

THE SYSTEM SHALL use native iOS interface components throughout all app surfaces

THE SYSTEM SHALL use system colors that adapt to appearance mode

WHEN user has dark mode enabled
THE SYSTEM SHALL display dark-themed interfaces

WHEN user has light mode enabled
THE SYSTEM SHALL display light-themed interfaces

**Rationale:** Users expect iOS apps to look and feel like native iOS apps. Using system components ensures accessibility, familiarity, and automatic adaptation to user preferences like dark mode.

---

### REQ-SM-021: Respect System Accessibility Settings

WHEN displaying text in the main app
THE SYSTEM SHALL respect user's Dynamic Type font size preferences

WHEN displaying text in the share extension
THE SYSTEM SHALL respect user's Dynamic Type font size preferences

**Rationale:** Users with vision impairments or preferences for larger text need all app text to scale appropriately. Supporting Dynamic Type is an iOS accessibility best practice.

**Note:** Keyboard extension currently uses fixed font sizes due to space constraints. This is a known limitation documented in VALIDATION.md.

---

### REQ-SM-022: Support All iOS Devices

THE SYSTEM SHALL support iPhones running iOS 16.0 or later

THE SYSTEM SHALL support iPads running iOS 16.0 or later

WHEN user rotates their device
THE SYSTEM SHALL adapt the interface to portrait or landscape orientation

**Rationale:** Users on different devices and orientations need the app to work reliably. Supporting both iPhone and iPad maximizes the app's usefulness across users' device collections.

---

### 6. Privacy and Security

### REQ-SM-023: No Network Access

THE SYSTEM SHALL NOT transmit any snippet data over the internet

THE SYSTEM SHALL store all data locally on the device only

THE SYSTEM SHALL NOT require user account creation or sign-in

**Rationale:** Users need confidence that their private content (addresses, templates, temporary info) stays on their device. Many snippets contain sensitive or personal information. Zero network access provides strongest possible privacy guarantee.

---

### REQ-SM-024: Minimal Keyboard Permissions

THE SYSTEM SHALL NOT request "Allow Full Access" permission for the keyboard

THE SYSTEM SHALL function fully without network access from the keyboard

**Rationale:** "Allow Full Access" permission is a red flag for users concerned about privacy (keyboard loggers, data collection). Operating without this permission builds user trust and demonstrates respect for privacy.

---

## Out of Scope

The following capabilities are intentionally excluded from this minimal implementation:

### Intentionally Not Supported

- ❌ Search or filter snippets by keyword
- ❌ Organize snippets into categories, tags, or folders
- ❌ Edit existing snippets (must delete and re-save)
- ❌ Manually create snippets in the main app (share-only workflow)
- ❌ Reorder snippets or mark favorites
- ❌ Sync snippets via iCloud across devices
- ❌ Export or import snippet collections
- ❌ Variables, templates, or placeholders in snippets
- ❌ Rich text formatting, images, or attachments
- ❌ Usage statistics or snippet analytics
- ❌ Custom expiration durations (7 days is fixed for timed snippets)
- ❌ Convert between regular and timed snippet types after saving
- ❌ Snippet sharing between users
- ❌ Manual backup or restore functionality

### Design Rationale

This minimal scope prioritizes:

1. **Working code over features**: Every feature works reliably without edge cases
2. **Simplicity**: Easy to understand, use, and maintain
3. **Quick implementation**: Can be built and tested in a single development session
4. **Clear value**: Core use case (save and insert text) works perfectly
5. **Educational clarity**: Demonstrates iOS extension architecture without complexity

The 7-day expiration for timed snippets is a simplifying assumption that covers most "session-based" content use cases: trip planning (typically < 1 week), event coordination, temporary project URLs, and short-term information sharing. Users who need longer-term storage should use regular snippets.

---

## Requirement Dependencies

| Requirement | Depends On | Reason |
|-------------|------------|--------|
| REQ-SM-005 | REQ-SM-018 | Expiration checking requires stored timestamps |
| REQ-SM-013 | REQ-SM-018 | Displaying expiration requires stored type and timestamps |
| REQ-SM-016 | REQ-SM-017 | Data consistency requires persistent shared storage |

---

## Glossary

**Regular Snippet:** A snippet that never expires, suitable for reusable content like templates, addresses, and permanent text. Stored indefinitely until user manually deletes.

**Timed Snippet:** A snippet that automatically expires 7 days after creation. Suitable for transient content like event URLs, flight information, temporary descriptions, or session-specific text. Automatically hidden from all app surfaces after expiration.

**Expiration:** When a timed snippet passes its 7-day lifetime (creation timestamp + 7 days). Expired snippets are automatically filtered from display but not immediately deleted from storage (cleanup is deferred for performance).

**Session:** A period of time during which related activities occur, approximated as 7 days for the purpose of timed snippet expiration. Examples: a business trip, a multi-day event, a short-term project, or coordination period with team members.

**App Group:** iOS mechanism for sharing data between a main app and its extensions via shared UserDefaults storage.

**Share Extension:** iOS app extension that appears in the system share sheet to receive content from other apps.

**Keyboard Extension:** iOS app extension that provides a custom keyboard interface for text input across all apps.
