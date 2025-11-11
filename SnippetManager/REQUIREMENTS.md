# SnippetManager Requirements

## Overview
A minimal iOS text snippet manager enabling users to save and reuse text across applications via a custom keyboard and share extension.

## User Personas
- **Primary User**: iOS user who frequently reuses text snippets (addresses, email templates, code snippets, etc.)

---

## Functional Requirements (EARS Notation)

### 1. Viewing and Managing Snippets (Main App)

#### 1.1 Viewing Saved Snippets
- **R1.1.1**: WHEN a user opens the main app, they shall see all their saved snippets in a scrollable list.
- **R1.1.2**: Users shall see their most recently saved snippets at the top of the list.
- **R1.1.3**: Users shall see the first 50 characters of each snippet's text.
- **R1.1.4**: Users shall see how long ago each snippet was created (e.g., "2 hrs ago", "3 days ago").
- **R1.1.5**: WHEN a user has no saved snippets, they shall see a message "No Snippets Yet" with instructions to use the share extension.

#### 1.2 Deleting Unwanted Snippets
- **R1.2.1**: WHEN a user swipes left on any snippet, they shall see a delete button.
- **R1.2.2**: WHEN a user taps the delete button, the snippet shall be immediately removed from their list.
- **R1.2.3**: Users shall see the updated list immediately after deleting a snippet.

#### 1.3 Understanding App Limitations
- **R1.3.1**: Users shall understand that snippets can only be added via the share extension (not manually in the main app).

### 2. Saving Snippets from Other Apps (Share Extension)

#### 2.1 Accessing the Save Function
- **R2.1.1**: WHEN a user selects text in any iOS app and taps the Share button, they shall see "Save Snippet" as an option.
- **R2.1.2**: Users shall be able to save plain text only (not images, files, or rich formatting).

#### 2.2 Reviewing and Saving Text
- **R2.2.1**: WHEN a user taps "Save Snippet", they shall see the full text they are about to save.
- **R2.2.2**: Users shall see "Save" and "Cancel" buttons to confirm or abort the operation.
- **R2.2.3**: WHEN a user taps "Save", they shall see a "Saved!" confirmation message.
- **R2.2.4**: Users shall be returned to their original app within 1 second after seeing the confirmation.
- **R2.2.5**: WHEN a user taps "Cancel", they shall be returned to their original app without saving anything.

#### 2.3 Understanding Save Errors
- **R2.3.1**: IF the selected content cannot be saved as text, THEN users shall see an error message explaining the problem.
- **R2.3.2**: WHEN an error occurs, users shall be able to tap "OK" to dismiss and return to their original app.

### 3. Inserting Snippets via Keyboard (Keyboard Extension)

#### 3.1 Enabling the Keyboard
- **R3.1.1**: Users shall be able to add "SnippetKeyboard" through iOS Settings → General → Keyboard → Keyboards → Add New Keyboard.
- **R3.1.2**: WHEN a user taps the globe key on their keyboard, they shall be able to switch to SnippetKeyboard.

#### 3.2 Browsing Available Snippets
- **R3.2.1**: WHEN a user activates the SnippetKeyboard, they shall see their saved snippets in a horizontal scrollable view.
- **R3.2.2**: Users shall see up to 60 characters of preview text for each snippet.
- **R3.2.3**: Users shall see when each snippet was created (relative time).
- **R3.2.4**: Users shall be able to scroll horizontally to browse all their snippets.
- **R3.2.5**: WHEN a user has no saved snippets, they shall see "No snippets saved" message.

#### 3.3 Inserting Snippet Text
- **R3.3.1**: WHEN a user taps any snippet in the keyboard, the complete snippet text shall be inserted at their cursor position.
- **R3.3.2**: Users shall see the exact text they saved, without any modifications or formatting changes.
- **R3.3.3**: WHEN a user inserts a snippet, they shall be able to continue typing immediately (keyboard stays active).

### 4. Data Consistency Across App Components

#### 4.1 Seeing Changes Everywhere
- **R4.1.1**: WHEN a user saves a snippet via the share extension, they shall see it immediately in the main app (when opened).
- **R4.1.2**: WHEN a user saves a snippet via the share extension, they shall see it in the keyboard extension (when activated).
- **R4.1.3**: WHEN a user deletes a snippet in the main app, it shall no longer appear in the keyboard extension.
- **R4.1.4**: Users shall never lose saved snippets between app launches.

---

## User Journeys

### Journey 1: First-Time Setup
**Goal**: User installs and configures the app to start using snippets

1. User downloads and installs SnippetManager from App Store
2. User opens the app and sees "No Snippets Yet" with setup instructions
3. User opens iOS Settings app
4. User navigates to General → Keyboard → Keyboards
5. User taps "Add New Keyboard"
6. User selects "SnippetKeyboard" from the list
7. User returns to any app and can now access the snippet keyboard

**Success**: User can switch to SnippetKeyboard using globe key

### Journey 2: Saving a Snippet for Reuse
**Goal**: User saves frequently-used text for quick access later

1. User is reading an email containing their mailing address
2. User selects the address text (long press, drag handles)
3. User taps the Share button in the system menu
4. User scrolls the share sheet and taps "Save Snippet"
5. User sees their address displayed in the share extension
6. User reviews the text to confirm it's correct
7. User taps "Save" button
8. User sees "Saved!" confirmation
9. User is automatically returned to their email app
10. User opens SnippetManager app and sees the new snippet at the top of the list

**Success**: Address is saved and appears in both main app and keyboard

### Journey 3: Using a Snippet in Daily Work
**Goal**: User quickly inserts saved text without retyping

1. User opens Messages app to text a friend
2. User taps in the message field to bring up keyboard
3. User taps the globe key to cycle through keyboards
4. User sees SnippetKeyboard with their saved snippets
5. User scrolls horizontally to find their address snippet
6. User sees "123 Main St..." preview
7. User taps the address snippet
8. User sees complete address inserted into the message
9. User continues typing their message or switches back to system keyboard

**Success**: User inserts saved text without copy/paste or retyping

### Journey 4: Managing Saved Snippets
**Goal**: User removes outdated snippets to keep their collection organized

1. User opens SnippetManager main app
2. User sees 15 saved snippets, sorted newest first
3. User scrolls down and finds an outdated snippet (old phone number)
4. User swipes left on the outdated snippet
5. User sees red "Delete" button appear
6. User taps "Delete"
7. User sees snippet immediately disappear from the list
8. User later uses keyboard and notices snippet is no longer there

**Success**: Unwanted snippet is removed from all locations

---

## User Experience Requirements

### Responsiveness
- **R5.1**: WHEN a user opens the main app, they shall see their snippets within 0.5 seconds.
- **R5.2**: WHEN a user switches to the keyboard extension, it shall appear within normal keyboard switching time.
- **R5.3**: WHEN a user activates the share extension, it shall launch within 1 second.

### Visual Clarity
- **R6.1**: Users shall see modern, native iOS interface design in all app components.
- **R6.2**: Users shall be able to read all text comfortably at their preferred system font size.
- **R6.3**: WHEN a user has dark mode enabled, they shall see appropriate dark-themed interfaces.
- **R6.4**: WHEN a user has light mode enabled, they shall see appropriate light-themed interfaces.

### Device Compatibility
- **R7.1**: Users with iOS 16.0 or later shall be able to install and use the app.
- **R7.2**: Users with iPhones shall be able to use all features.
- **R7.3**: Users with iPads shall be able to use all features.
- **R7.4**: WHEN a user rotates their device, the interface shall adapt to portrait or landscape orientation.

### Privacy & Trust
- **R8.1**: Users shall NOT be required to grant "Allow Full Access" permission to the keyboard.
- **R8.2**: Users shall have confidence that all snippet data stays on their device only.
- **R8.3**: Users shall never have their snippets transmitted over the internet.
- **R8.4**: Users shall not need to create an account or sign in.

---

## Explicitly Out of Scope

The following user capabilities are intentionally excluded from this minimal implementation:

### Not Available to Users
- ❌ Users cannot search for snippets by keyword
- ❌ Users cannot organize snippets into categories or folders
- ❌ Users cannot edit existing snippets (must delete and re-save)
- ❌ Users cannot manually create snippets in the main app
- ❌ Users cannot reorder snippets or mark favorites
- ❌ Users cannot sync snippets via iCloud
- ❌ Users cannot access snippets on multiple devices
- ❌ Users cannot export or import snippet collections
- ❌ Users cannot use variables or templates in snippets
- ❌ Users cannot save formatting, images, or attachments
- ❌ Users cannot see usage statistics for snippets
- ❌ Users cannot customize the keyboard layout
- ❌ Users cannot see full snippet text in keyboard preview (only 60 chars)
- ❌ Users cannot share snippets with other users
- ❌ Users cannot backup or restore their snippets

### Design Rationale
This minimal scope ensures:
1. **Reliability**: Every feature works consistently
2. **Clarity**: Users understand all capabilities immediately
3. **Quick value**: Users can be productive in minutes
4. **Educational clarity**: Demonstrates core iOS extension patterns without complexity

---

## Acceptance Criteria (User-Facing)

### Main App Experience
- [ ] User can open app without crashes or errors
- [ ] User sees helpful message when they have no snippets yet
- [ ] User sees all their saved snippets in a list
- [ ] User can read the first 50 characters of each snippet
- [ ] User can see when each snippet was created
- [ ] User can swipe left on any snippet to reveal delete
- [ ] User sees snippet disappear immediately after deleting
- [ ] User sees newest snippets at the top

### Share Extension Experience
- [ ] User sees "Save Snippet" option when sharing text from any app
- [ ] User can review the text they're about to save
- [ ] User can save the snippet by tapping "Save"
- [ ] User can cancel without saving by tapping "Cancel"
- [ ] User sees "Saved!" confirmation after saving
- [ ] User is returned to their original app within 1 second
- [ ] User sees clear error message if something goes wrong

### Keyboard Extension Experience
- [ ] User can add SnippetKeyboard through iOS Settings
- [ ] User can switch to keyboard using globe key
- [ ] User sees all their snippets in a horizontal scrollable list
- [ ] User can read preview text for each snippet
- [ ] User can scroll to see all snippets
- [ ] User can tap any snippet to insert its text
- [ ] User sees exact text inserted at cursor position
- [ ] User sees "No snippets saved" when they have none
- [ ] User can continue typing after inserting a snippet

### Cross-Component Consistency
- [ ] User sees new snippets in main app after saving via share extension
- [ ] User sees new snippets in keyboard after saving via share extension
- [ ] User no longer sees deleted snippets in keyboard after deleting in main app
- [ ] User's snippets persist across app launches
- [ ] User never loses data

### Overall User Satisfaction
- [ ] User can complete first-time setup in under 2 minutes
- [ ] User can save their first snippet in under 10 seconds
- [ ] User can insert a snippet in under 5 seconds
- [ ] User understands how to use all features without external documentation
- [ ] User feels confident their data is private and secure
