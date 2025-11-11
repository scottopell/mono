# SnippetManager Requirements

## Overview
A minimal iOS text snippet manager enabling users to save and reuse text across applications via a custom keyboard and share extension.

## User Personas
- **Primary User**: iOS user who frequently reuses text snippets (addresses, email templates, code snippets, etc.)

---

## Functional Requirements (EARS Notation)

### 1. Snippet Management (Main App)

#### 1.1 Viewing Snippets
- **R1.1.1**: The main app shall display all saved snippets in a scrollable list.
- **R1.1.2**: The main app shall sort snippets with newest first.
- **R1.1.3**: For each snippet, the main app shall display the first 50 characters of text.
- **R1.1.4**: For each snippet, the main app shall display a relative timestamp (e.g., "2 hrs ago").
- **R1.1.5**: WHEN no snippets exist, the main app shall display "No Snippets Yet" with instructions.

#### 1.2 Deleting Snippets
- **R1.2.1**: WHEN a user swipes left on a snippet, the main app shall reveal a delete button.
- **R1.2.2**: WHEN a user taps the delete button, the main app shall immediately remove the snippet.
- **R1.2.3**: WHEN a snippet is deleted, the main app shall update the list view immediately.

#### 1.3 Adding Snippets
- **R1.3.1**: The main app shall NOT provide a manual "add snippet" button.
- **R1.3.2**: The main app shall display instructions directing users to the share extension.

### 2. Share Extension

#### 2.1 Activation
- **R2.1.1**: WHEN a user shares text from any iOS app, the share extension shall appear as "Save Snippet" in the share sheet.
- **R2.1.2**: The share extension shall accept plain text input only.
- **R2.1.3**: WHEN text is shared, the share extension shall display the full text content.

#### 2.2 Saving Snippets
- **R2.2.1**: The share extension shall provide "Save" and "Cancel" buttons.
- **R2.2.2**: WHEN a user taps "Save", the extension shall store the snippet with a UUID and timestamp.
- **R2.2.3**: WHEN a user taps "Save", the extension shall display "Saved!" confirmation.
- **R2.2.4**: WHEN the confirmation appears, the extension shall automatically dismiss after 1 second.
- **R2.2.5**: WHEN a user taps "Cancel", the extension shall dismiss without saving.

#### 2.3 Error Handling
- **R2.3.1**: IF text cannot be extracted from the shared item, THEN the extension shall display an error alert.
- **R2.3.2**: WHEN an error occurs, the extension shall provide an "OK" button to dismiss.

### 3. Keyboard Extension

#### 3.1 Activation
- **R3.1.1**: The keyboard extension shall be installable via iOS Settings → Keyboards.
- **R3.1.2**: WHEN activated, the keyboard shall appear as "SnippetKeyboard".
- **R3.1.3**: WHEN a user switches to the keyboard (via globe key), the keyboard extension shall display.

#### 3.2 Displaying Snippets
- **R3.2.1**: The keyboard extension shall display snippets in a horizontal scrollable list.
- **R3.2.2**: The keyboard extension shall limit height to approximately 100 points (2-3 rows).
- **R3.2.3**: For each snippet, the keyboard extension shall display up to 60 characters of text.
- **R3.2.4**: For each snippet, the keyboard extension shall display a relative timestamp.
- **R3.2.5**: WHEN no snippets exist, the keyboard extension shall display "No snippets saved".

#### 3.3 Inserting Snippets
- **R3.3.1**: WHEN a user taps a snippet, the keyboard extension shall insert the full text at the cursor position.
- **R3.3.2**: WHEN text is inserted, the keyboard extension shall remain visible.
- **R3.3.3**: The keyboard extension shall insert text without modification (preserve exact formatting).

### 4. Data Synchronization

#### 4.1 Shared Storage
- **R4.1.1**: The system shall store all snippets in shared UserDefaults via App Groups.
- **R4.1.2**: The system shall make snippets immediately available to all three app components.
- **R4.1.3**: WHEN a snippet is saved via the share extension, the main app shall reflect the change when opened.
- **R4.1.4**: WHEN a snippet is deleted in the main app, the keyboard extension shall reflect the change when activated.

#### 4.2 Data Model
- **R4.2.1**: Each snippet shall have a unique UUID identifier.
- **R4.2.2**: Each snippet shall store the complete text content (no length limit).
- **R4.2.3**: Each snippet shall store a creation timestamp.
- **R4.2.4**: The system shall encode snippets as JSON for storage.

---

## User Journeys

### Journey 1: First-Time Setup
1. User installs SnippetManager app from App Store
2. User opens main app (sees "No Snippets Yet" message)
3. User opens iOS Settings → General → Keyboard → Keyboards
4. User taps "Add New Keyboard"
5. User selects "SnippetKeyboard" from list
6. Setup complete

### Journey 2: Saving a Snippet
1. User is reading an email/article/note in any iOS app
2. User selects text to save
3. User taps Share button
4. User scrolls share sheet and taps "Save Snippet"
5. User reviews text in share extension
6. User taps "Save" button
7. User sees "Saved!" confirmation
8. Extension auto-dismisses after 1 second
9. Snippet now available in app and keyboard

### Journey 3: Using a Snippet
1. User is composing a message/email in any app
2. User taps text input field to bring up keyboard
3. User taps globe key to switch to SnippetKeyboard
4. User scrolls horizontally through saved snippets
5. User taps desired snippet
6. Text is inserted at cursor position
7. User continues typing or switches back to system keyboard

### Journey 4: Managing Snippets
1. User opens SnippetManager main app
2. User sees list of all saved snippets (newest first)
3. User browses snippets by reading first 50 characters
4. User swipes left on unwanted snippet
5. User taps "Delete" button
6. Snippet is immediately removed from list
7. Changes reflected in keyboard extension

---

## Non-Functional Requirements

### Performance
- **R5.1**: The main app shall load and display snippets within 0.5 seconds.
- **R5.2**: The keyboard extension shall appear within system keyboard switching time.
- **R5.3**: The share extension shall launch within 1 second of activation.

### Usability
- **R6.1**: The system shall use SwiftUI for all user interfaces.
- **R6.2**: The system shall follow iOS Human Interface Guidelines.
- **R6.3**: All text shall be readable with system font sizes.
- **R6.4**: The system shall support both light and dark mode.

### Compatibility
- **R7.1**: The system shall require iOS 16.0 or later.
- **R7.2**: The system shall support iPhone and iPad.
- **R7.3**: The system shall support portrait and landscape orientations.

### Security & Privacy
- **R8.1**: The keyboard extension shall NOT request "Allow Full Access" permission.
- **R8.2**: The system shall store all data locally on device only.
- **R8.3**: The system shall NOT transmit data over the network.
- **R8.4**: The system shall use App Groups for secure inter-app communication.

---

## Explicitly Out of Scope

The following features are intentionally excluded from this minimal implementation:

### Not Implemented
- ❌ Search functionality
- ❌ Categories, tags, or folders
- ❌ Editing existing snippets
- ❌ Manual snippet creation in main app
- ❌ Snippet reordering or favoriting
- ❌ Cloud sync (iCloud)
- ❌ Multiple device synchronization
- ❌ Export/import functionality
- ❌ Snippet templates or variables
- ❌ Rich text formatting
- ❌ Image or file attachments
- ❌ Snippet usage statistics
- ❌ Custom keyboard layouts
- ❌ Snippet previews in keyboard (beyond 60 chars)
- ❌ Snippet sharing between users
- ❌ Backup/restore functionality

### Design Rationale
This minimal scope prioritizes:
1. **Working code over features**: Every feature works reliably
2. **Simplicity**: Easy to understand and maintain
3. **Quick implementation**: Can be built in a single session
4. **Learning value**: Demonstrates core iOS extension concepts

---

## Acceptance Criteria

### Main App
- [ ] App launches without crashes
- [ ] Empty state displays helpful message
- [ ] List displays all saved snippets
- [ ] Snippets show correct preview (50 chars) and timestamp
- [ ] Swipe-to-delete works on all snippets
- [ ] List updates immediately after deletion

### Share Extension
- [ ] Appears in share sheet when sharing text
- [ ] Displays shared text correctly
- [ ] Save button persists snippet
- [ ] Cancel button dismisses without saving
- [ ] Confirmation appears and auto-dismisses
- [ ] Error handling works for invalid input

### Keyboard Extension
- [ ] Appears in iOS keyboard list after installation
- [ ] Shows all saved snippets in horizontal scroll
- [ ] Tap on snippet inserts full text
- [ ] Empty state message appears when no snippets
- [ ] Respects height constraints (~100pt)
- [ ] Snippets are readable and properly formatted

### Data Synchronization
- [ ] Snippets saved in share extension appear in main app
- [ ] Snippets deleted in main app disappear from keyboard
- [ ] No data loss between app launches
- [ ] App Groups configured correctly
- [ ] All three components access same data store

### System Integration
- [ ] App installs successfully
- [ ] Extensions bundle with main app
- [ ] Code signing works correctly
- [ ] App passes App Store validation (if submitted)
