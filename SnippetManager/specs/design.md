# SnippetManager - Technical Design

## Architecture Overview

SnippetManager uses a shared data architecture where three iOS app components (main app, keyboard extension, share extension) access a common data store via App Groups.

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Main App      │     │ Share Extension  │     │Keyboard Extension│
│  (ContentView)  │     │(ShareViewController)   │(KeyboardViewController)
└────────┬────────┘     └────────┬─────────┘     └────────┬────────┘
         │                       │                         │
         │                       │                         │
         └───────────────────────┼─────────────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │   SnippetStorage        │
                    │   (Shared Class)        │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │ UserDefaults (App Group)│
                    │ JSON-encoded snippets   │
                    └─────────────────────────┘
```

**Design Principles:**
- SwiftUI-first for all UI components
- Shared storage via App Groups (no iCloud, no network)
- Simple JSON encoding/decoding for persistence
- Filter-on-read for expired snippets (no background cleanup)
- Stateless extensions (reload data on each activation)

---

## Data Models

### Snippet Structure

**Location:** `Shared/Snippet.swift`

```swift
struct Snippet: Codable, Identifiable {
    let id: UUID
    let text: String
    let timestamp: Date
    let isTimed: Bool              // NEW: Regular vs Timed
    let expirationDate: Date?      // NEW: Set if isTimed == true
}
```

**Requirements Implemented:**
- REQ-SM-001: Stores text, timestamp for display
- REQ-SM-018: UUID, text, creation timestamp, type, expiration

**Type Semantics:**
- `isTimed == false`: Regular snippet, `expirationDate == nil`, never expires
- `isTimed == true`: Timed snippet, `expirationDate == timestamp + 7 days`

**Backwards Compatibility:**
- Existing snippets without `isTimed` field default to regular snippets
- JSON decoder handles missing fields with default values

### SnippetStorage Class

**Location:** `Shared/SnippetStorage.swift`

```swift
class SnippetStorage {
    static let appGroupID = "group.com.yourcompany.snippetmanager"
    private static let snippetsKey = "saved_snippets"
    private let userDefaults: UserDefaults?

    func saveSnippet(_ snippet: Snippet)
    func loadSnippets() -> [Snippet]
    func deleteSnippet(_ snippet: Snippet)
}
```

**Requirements Implemented:**
- REQ-SM-016: Shared data via App Groups
- REQ-SM-017: Persistence across sessions

**Key Implementation Details:**
- Uses `UserDefaults(suiteName:)` with App Group ID
- JSON encoding via Swift's `Codable` protocol
- Insert new snippets at index 0 (newest first)
- Load operation filters expired timed snippets automatically
- No automatic cleanup of expired snippets from storage (deferred for performance)

---

## Component Design

### Main App (SnippetManager)

**Entry Point:** `SnippetManager/SnippetManagerApp.swift`
**Main View:** `SnippetManager/ContentView.swift`

#### ContentView Architecture

```swift
struct ContentView: View {
    @State private var snippets: [Snippet] = []
    private let storage = SnippetStorage()

    var body: some View {
        NavigationView {
            if snippets.isEmpty {
                EmptyStateView()    // REQ-SM-002
            } else {
                List {
                    ForEach(snippets) { snippet in
                        SnippetRow(snippet: snippet)  // REQ-SM-001, REQ-SM-004
                    }
                    .onDelete(perform: deleteSnippets)  // REQ-SM-003
                }
            }
        }
        .onAppear { loadSnippets() }
    }
}
```

**Requirements Implemented:**
- REQ-SM-001: View all snippets (filtered for expiration in `loadSnippets()`)
- REQ-SM-002: Empty state with instructions
- REQ-SM-003: Swipe-to-delete
- REQ-SM-004: Visual distinction (TODO: Add badge/icon for timed snippets)
- REQ-SM-005: Hide expired snippets (filter in `loadSnippets()`)

#### SnippetRow Display

**Current Implementation:**
- Shows first 50 chars of text
- Shows relative timestamp (REQ-SM-001)
- **TODO**: Show expiration indicator for timed snippets (REQ-SM-004)

**Planned Enhancement (REQ-SM-004):**
```swift
struct SnippetRow: View {
    let snippet: Snippet

    var body: some View {
        VStack(alignment: .leading) {
            HStack {
                Text(snippetPreview)
                if snippet.isTimed {
                    Spacer()
                    Image(systemName: "clock.badge")
                        .foregroundColor(.orange)
                }
            }
            HStack {
                Text(formattedDate)
                if let expirationText = expirationInfo {
                    Text("• " + expirationText)
                        .foregroundColor(.orange)
                }
            }
        }
    }
}
```

---

### Share Extension (SnippetShare)

**Entry Point:** `SnippetShare/ShareViewController.swift`
**UI:** `SnippetShare/ShareView.swift`

#### Flow

```
User selects text → Taps Share → Sees "Save Snippet"
  ↓
ShareViewController.extractSharedText()  // REQ-SM-006
  ↓
ShowShareView (displays text + type selector)  // REQ-SM-007, REQ-SM-008
  ↓
User selects Regular/Timed → Taps Save
  ↓
Create Snippet with appropriate fields → storage.saveSnippet()  // REQ-SM-009
  ↓
Show "Saved!" confirmation → Auto-dismiss after 1s
```

**Requirements Implemented:**
- REQ-SM-006: Accept plain text via share sheet
- REQ-SM-007: Review text before saving
- REQ-SM-008: Choose Regular/Timed (TODO: Add UI for selection)
- REQ-SM-009: Confirm save and dismiss
- REQ-SM-010: Error handling

**Current State:**
- ✅ Text extraction and display
- ✅ Save/Cancel buttons
- ✅ "Saved!" confirmation
- ❌ **TODO**: Add Regular/Timed selector (REQ-SM-008)

**Planned Implementation (REQ-SM-008):**

```swift
struct ShareView: View {
    let text: String
    @State private var snippetType: SnippetType = .regular

    var body: some View {
        VStack {
            Text("Save Snippet")

            Picker("Type", selection: $snippetType) {
                Text("Regular").tag(SnippetType.regular)
                Text("Timed (7 days)").tag(SnippetType.timed)
            }
            .pickerStyle(.segmented)

            ScrollView {
                Text(text)
            }

            if snippetType == .timed {
                Text("Expires in 7 days")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            HStack {
                Button("Cancel") { onCancel() }
                Button("Save") { onSave(type: snippetType) }
            }
        }
    }
}
```

---

### Keyboard Extension (SnippetKeyboard)

**Entry Point:** `SnippetKeyboard/KeyboardViewController.swift`
**UI:** `SnippetKeyboard/KeyboardView.swift`

#### Architecture

```swift
class KeyboardViewController: UIInputViewController {
    private var snippets: [Snippet] = []
    private let storage = SnippetStorage()

    override func viewWillAppear(_ animated: Bool) {
        loadSnippets()  // Reload every time keyboard appears
    }

    private func insertSnippet(_ snippet: Snippet) {
        textDocumentProxy.insertText(snippet.text)  // REQ-SM-014
    }
}
```

**Requirements Implemented:**
- REQ-SM-011: Keyboard registration
- REQ-SM-012: Horizontal scrollable view
- REQ-SM-013: Show expiration info (TODO: Add visual indicator)
- REQ-SM-014: Insert text without modification
- REQ-SM-015: Empty state handling

**Current State:**
- ✅ Horizontal scroll with 60-char preview
- ✅ Relative timestamps
- ✅ Tap to insert
- ✅ 100pt height constraint
- ❌ **TODO**: Visual indicator for timed snippets (REQ-SM-013)
- ❌ **TODO**: Show "3d left" for timed snippets (REQ-SM-013)

**Planned Enhancement (REQ-SM-013):**

```swift
struct SnippetButton: View {
    let snippet: Snippet

    var body: some View {
        VStack(alignment: .leading) {
            HStack {
                Text(snippetPreview)
                if snippet.isTimed {
                    Image(systemName: "clock")
                        .font(.caption)
                        .foregroundColor(.orange)
                }
            }

            HStack {
                Text(formattedDate)
                if let daysLeft = daysUntilExpiration {
                    Text("• \(daysLeft)d left")
                        .foregroundColor(.orange)
                }
            }
            .font(.caption2)
        }
    }
}
```

---

## Implementation Details per Requirement

### REQ-SM-001: View All Saved Snippets
**Files:** `ContentView.swift:47-49`
- `loadSnippets()` calls `storage.loadSnippets()`
- Filter logic in `SnippetStorage.loadSnippets()` removes expired timed snippets
- Display sorted by timestamp (newest first, handled by insertion order)

### REQ-SM-002: Understand Empty State
**Files:** `ContentView.swift:22-34`
- Shows when `snippets.isEmpty`
- Three-line message: Title + limitation + instructions
- **Status:** ✅ Complete (recently improved message clarity)

### REQ-SM-003: Delete Unwanted Snippets
**Files:** `ContentView.swift:36, 51-56`
- SwiftUI `.onDelete()` modifier provides swipe gesture
- `deleteSnippets()` removes from storage and reloads
- **Status:** ✅ Complete

### REQ-SM-004: Distinguish Snippet Types Visually
**Files:** `ContentView.swift:59-87` (SnippetRow)
- **Status:** ❌ Not yet implemented
- **Plan:** Add clock icon and "Expires in X days" text
- **Color:** Orange for timed snippets (matches iOS warning color)

### REQ-SM-005: Hide Expired Timed Snippets
**Files:** `SnippetStorage.swift:30-43`
- **Status:** ❌ Not yet implemented
- **Plan:** Add filtering in `loadSnippets()`:
  ```swift
  func loadSnippets() -> [Snippet] {
      let allSnippets = decodeSnippetsFromStorage()
      return allSnippets.filter { snippet in
          guard snippet.isTimed else { return true }
          guard let expiration = snippet.expirationDate else { return true }
          return Date() < expiration
      }
  }
  ```

### REQ-SM-006: Access Save Function from Any App
**Files:** `SnippetShare/Info.plist`, `ShareViewController.swift:28-62`
- **Status:** ✅ Complete
- Extension point: `com.apple.share-services`
- Activation rule: `NSExtensionActivationSupportsText = true`
- Extracts `public.plain-text` and `public.text` types only

### REQ-SM-007: Review Text Before Saving
**Files:** `ShareView.swift:15-47`
- **Status:** ✅ Complete
- Shows full text in ScrollView
- Save and Cancel buttons

### REQ-SM-008: Choose Snippet Type When Saving
**Files:** `ShareView.swift`
- **Status:** ❌ Not yet implemented
- **Plan:** Add segmented picker for Regular/Timed
- Default to Regular
- Show "Expires in 7 days" when Timed selected
- Pass type to save handler

### REQ-SM-009: Confirm Successful Save
**Files:** `ShareViewController.swift:91-121`, `ShareView.swift:51-67`
- **Status:** ✅ Complete (for regular snippets)
- **Plan:** Update to accept snippet type parameter
- Shows "Saved!" with green checkmark
- Auto-dismisses after 1 second

### REQ-SM-010: Handle Save Errors Gracefully
**Files:** `ShareViewController.swift:123-133`
- **Status:** ✅ Complete
- Shows UIAlertController with error message
- "OK" button dismisses and returns to original app

### REQ-SM-011: Enable Custom Keyboard
**Files:** `SnippetKeyboard/Info.plist`, `project.pbxproj`
- **Status:** ✅ Complete
- Extension point: `com.apple.keyboard-service`
- Display name: "SnippetKeyboard"
- RequestsOpenAccess: false (privacy)

### REQ-SM-012: Browse Snippets in Keyboard
**Files:** `KeyboardView.swift:14-34`
- **Status:** ✅ Complete
- ScrollView horizontal with 100pt height
- Shows 60-char preview and relative timestamp
- Empty state: "No snippets saved"

### REQ-SM-013: Show Snippet Type in Keyboard
**Files:** `KeyboardView.swift:37-74` (SnippetButton)
- **Status:** ❌ Not yet implemented
- **Plan:** Add clock icon and "3d left" text
- Compact format for keyboard space constraints

### REQ-SM-014: Insert Snippet Text
**Files:** `KeyboardViewController.swift:73-76`
- **Status:** ✅ Complete
- Uses `textDocumentProxy.insertText()`
- No modifications to snippet text
- Keyboard stays active (no dismiss call)

### REQ-SM-015: Handle Empty Keyboard State
**Files:** `KeyboardView.swift:16-17, 76-87`
- **Status:** ✅ Complete
- Shows "No snippets saved" message
- Same message for truly empty and all-expired cases

### REQ-SM-016: Share Data Across Components
**Files:** `SnippetStorage.swift:13,19`
- **Status:** ✅ Complete
- App Group ID: `group.com.yourcompany.snippetmanager`
- All three components use same `SnippetStorage` class
- UserDefaults suite ensures immediate sharing

### REQ-SM-017: Persist Snippets Across Sessions
**Files:** `SnippetStorage.swift:46-55`
- **Status:** ✅ Complete
- UserDefaults persists to disk automatically
- JSON encoding ensures data integrity
- No in-memory-only caches

### REQ-SM-018: Store Snippet Metadata
**Files:** `Snippet.swift:10-20`
- **Status:** 🔄 Partial
- ✅ UUID, text, timestamp implemented
- ❌ `isTimed` and `expirationDate` fields need to be added
- **Plan:**
  ```swift
  struct Snippet: Codable, Identifiable {
      let id: UUID
      let text: String
      let timestamp: Date
      let isTimed: Bool = false              // NEW
      let expirationDate: Date? = nil        // NEW

      init(id: UUID = UUID(), text: String, timestamp: Date = Date(),
           isTimed: Bool = false) {
          self.id = id
          self.text = text
          self.timestamp = timestamp
          self.isTimed = isTimed
          self.expirationDate = isTimed ? timestamp.addingTimeInterval(7 * 24 * 60 * 60) : nil
      }
  }
  ```

### REQ-SM-019: Fast App Launch
**Files:** All components
- **Status:** ✅ Likely compliant (requires runtime testing)
- Synchronous load from UserDefaults (typically <10ms)
- No network calls, no heavy processing
- Simple JSON decoding

### REQ-SM-020: Native iOS Visual Design
**Files:** All SwiftUI views
- **Status:** ✅ Complete
- Uses `List`, `NavigationView`, `ScrollView`, `VStack`, `HStack`
- System colors: `.systemGray5`, `.systemBackground`, `.systemGray6`
- Button styles: `.bordered`, `.borderedProminent`

### REQ-SM-021: Respect System Accessibility Settings
**Files:** `ContentView.swift`, `ShareView.swift`
- **Status:** ⚠️ Partial
- ✅ Main app uses default SwiftUI (respects Dynamic Type)
- ✅ Share extension uses default SwiftUI
- ❌ Keyboard extension uses fixed font sizes (`.system(size: 14)` and `.system(size: 10)`)
- **Known Limitation:** Keyboard space constraints prevent full Dynamic Type support

### REQ-SM-022: Support All iOS Devices
**Files:** `project.pbxproj`
- **Status:** ✅ Complete
- Deployment target: iOS 16.0
- Device family: "1,2" (iPhone and iPad)
- SwiftUI adaptive layouts handle rotation

### REQ-SM-023: No Network Access
**Files:** All source files
- **Status:** ✅ Complete
- No import Network, URLSession, or networking frameworks
- No network code anywhere in codebase
- All data stored in local UserDefaults

### REQ-SM-024: Minimal Keyboard Permissions
**Files:** `SnippetKeyboard/Info.plist:15-16`
- **Status:** ✅ Complete
- `RequestsOpenAccess = false`
- Keyboard functions without full access

---

## Error Handling Strategy

### Share Extension Errors

| Error Condition | Handling | User Experience |
|----------------|----------|----------------|
| Non-text content | Show alert with message | Clear error, can retry with text |
| Storage failure | Silent failure (rare) | Appears to save but doesn't persist |
| Extraction failure | Show alert | Clear error, returns to source app |

**REQ-SM-010 Implementation:**
- `ShareViewController.showError()` displays UIAlertController
- Message: "Unable to extract text from the shared item"
- User taps "OK" to dismiss and return

### Keyboard Extension Errors

| Error Condition | Handling | User Experience |
|----------------|----------|----------------|
| Storage unavailable | Show empty state | "No snippets saved" |
| Expired snippets only | Show empty state | Same as no snippets |
| Insert fails | Silent failure | Text doesn't appear, can retry |

**Graceful Degradation:**
- If App Group access fails, return empty array
- If JSON decode fails, log error and return empty array
- Never crash extensions (iOS will disable them)

### Main App Errors

| Error Condition | Handling | User Experience |
|----------------|----------|----------------|
| Storage unavailable | Show empty state | Can still use share extension |
| Delete fails | Silent (rare) | Snippet still visible after relaunch |
| Load fails | Empty state | Looks like first launch |

---

## Testing Strategy

### Unit Testing (Not Currently Implemented)

**SnippetStorage Tests:**
```swift
// Test saving regular snippet
// Test saving timed snippet
// Test loading filters expired snippets
// Test deletion
// Test JSON encoding/decoding
```

**Snippet Model Tests:**
```swift
// Test expiration date calculation
// Test Codable conformance
// Test backwards compatibility (missing fields)
```

### Manual Testing Checklist

**Main App:**
- [ ] Empty state shows correct message
- [ ] List displays snippets newest first
- [ ] Swipe-to-delete works
- [ ] Regular snippets show no expiration
- [ ] Timed snippets show clock icon and expiration
- [ ] Expired timed snippets don't appear

**Share Extension:**
- [ ] Appears in share sheet when sharing text
- [ ] Shows full text content
- [ ] Regular/Timed picker works
- [ ] "Expires in 7 days" appears for timed
- [ ] Save creates snippet with correct type
- [ ] "Saved!" confirmation appears
- [ ] Returns to source app within 1 second
- [ ] Error shown for non-text content

**Keyboard Extension:**
- [ ] Appears in Settings → Keyboards
- [ ] Globe key switches to SnippetKeyboard
- [ ] Snippets scroll horizontally
- [ ] Preview shows 60 chars
- [ ] Timed snippets show clock and "3d left"
- [ ] Tap inserts full text
- [ ] Keyboard stays active after insert
- [ ] Empty state shows for no snippets

**Cross-Component:**
- [ ] Snippet saved in share extension appears in main app immediately
- [ ] Snippet saved in share extension appears in keyboard immediately
- [ ] Snippet deleted in main app disappears from keyboard
- [ ] Snippets persist after app restart
- [ ] Snippets persist after device reboot

### Performance Testing

- Measure load time with 0, 10, 50, 100 snippets
- Verify share extension launches in < 1 second
- Verify keyboard appears within normal iOS switching time
- Test with very long snippet text (10KB+)

---

## Security Considerations

### Data Privacy

**REQ-SM-023: No Network Access**
- Zero network code in entire codebase
- No URLSession, Network framework, or Alamofire
- Data never leaves device

**REQ-SM-024: Minimal Permissions**
- Keyboard doesn't request "Allow Full Access"
- Keyboard can't access other apps' data
- Keyboard can't make network requests

### App Group Security

- App Group ID must be registered in Apple Developer Portal
- Only apps signed with same team ID can access shared container
- UserDefaults in App Group is sandboxed from other apps

### Input Validation

- Share extension accepts only text (no arbitrary data)
- No SQL injection risk (no database)
- No XSS risk (no web views)
- Text is displayed as-is (no HTML rendering)

---

## Performance Considerations

### Storage Performance

- UserDefaults reads are typically <10ms
- JSON decode time scales with snippet count and text length
- No noticeable impact for <100 snippets
- Large snippets (>100KB) may cause decode slowdown

**Optimization Strategy:**
- Store snippets as JSON array (single key in UserDefaults)
- Decode entire array on each load (simple, predictable)
- No incremental loading (not needed for expected usage)

### Memory Usage

- Snippets held in memory only while app is active
- SwiftUI updates efficiently with `@State`
- Extensions have lower memory limits (vary by iOS version)

**Memory Footprint Estimate:**
- 100 snippets × 1KB average = 100KB of text data
- Plus Swift struct overhead ≈ 150KB total
- Well within iOS extension limits (typically 50MB+)

### Expiration Filtering Performance

**Current Approach (Filter-on-Read):**
```swift
func loadSnippets() -> [Snippet] {
    let all = decodeFromUserDefaults()
    return all.filter { !isExpired($0) }  // O(n) filter
}
```

**Pros:**
- Simple implementation
- No background tasks needed
- No timer management

**Cons:**
- Expired snippets stay in storage
- Filter runs on every load

**Future Optimization (If Needed):**
- Periodic cleanup when saving (remove expired every 10 saves)
- Lazy deletion (only when count > 1000)
- Not needed for typical usage (<100 snippets)

---

## Future Enhancements (Out of Scope)

### Beyond Current Requirements

**Custom Expiration Durations:**
- Add picker: 1 day, 7 days, 30 days
- Requires UI changes in share extension
- Requires new field in Snippet model

**Snippet Editing:**
- Would need edit UI in main app
- Conflicts with share-only workflow
- Complexity: Medium

**Search/Filter:**
- Text search within snippets
- Filter by type (regular/timed)
- Complexity: Low (just filter array)

**Categories/Tags:**
- Would need tag UI
- Tag picker in share extension
- Tag-based filtering in main app
- Complexity: High

**iCloud Sync:**
- CloudKit integration
- Conflict resolution
- Much higher complexity
- Privacy implications

---

## Migration Strategy

### Adding Timed Snippets to Existing Code

**Phase 1: Update Data Model (REQ-SM-018)**
- Add `isTimed` and `expirationDate` to `Snippet` struct
- Make fields optional with defaults for backwards compatibility
- Existing snippets decode as regular snippets

**Phase 2: Update Storage (REQ-SM-005)**
- Add expiration filtering in `loadSnippets()`
- No changes to save/delete methods needed

**Phase 3: Update Share Extension (REQ-SM-008, REQ-SM-009)**
- Add segmented picker to `ShareView`
- Update `saveSnippet()` to accept type parameter
- Create `Snippet` with `isTimed` flag

**Phase 4: Update Main App UI (REQ-SM-004)**
- Add expiration info to `SnippetRow`
- Clock icon for timed snippets
- "Expires in X days" text

**Phase 5: Update Keyboard UI (REQ-SM-013)**
- Add expiration info to `SnippetButton`
- Clock icon (smaller for space)
- "3d left" format for compact display

**Deployment:**
- All phases can be implemented incrementally
- No breaking changes to existing data
- Backwards compatible (old snippets = regular snippets)

---

## Configuration

### App Group ID

**Current Value:** `group.com.yourcompany.snippetmanager`

**Setup Required:**
1. Apple Developer Portal: Create App Group identifier
2. Update `SnippetStorage.swift:13` with actual group ID
3. Update all three `.entitlements` files:
   - `SnippetManager/SnippetManager.entitlements`
   - `SnippetKeyboard/SnippetKeyboard.entitlements`
   - `SnippetShare/SnippetShare.entitlements`
4. In Xcode: Add App Groups capability to all three targets
5. Select the App Group for each target

### Bundle Identifiers

**Current Values (Placeholders):**
- Main app: `com.yourcompany.SnippetManager`
- Keyboard: `com.yourcompany.SnippetManager.SnippetKeyboard`
- Share: `com.yourcompany.SnippetManager.SnippetShare`

**Setup Required:**
1. Apple Developer Portal: Register App IDs
2. Update `project.pbxproj` with actual bundle IDs
3. Or use Xcode: Signing & Capabilities → Bundle Identifier

### Code Signing

**Current:** Not configured (requires developer team)

**Setup Required:**
1. Xcode → Project → Targets → Signing & Capabilities
2. Select team for all three targets
3. Xcode will generate provisioning profiles automatically

---

## Known Limitations

### Keyboard Extension Font Sizes (REQ-SM-021)

**Issue:** Fixed font sizes don't respect Dynamic Type
**Location:** `KeyboardView.swift:45, 50`
**Rationale:** Keyboard height is constrained to ~100pt by iOS
**Impact:** Users with vision impairments can't scale keyboard text
**Mitigation:** Main app and share extension fully support Dynamic Type

### No Background Cleanup

**Issue:** Expired snippets remain in storage
**Impact:** Storage grows over time (very slowly)
**Mitigation:** Filter-on-read ensures they're never displayed
**Future:** Add periodic cleanup (low priority)

### No Snippet Previews in Keyboard

**Issue:** Can't see full snippet without inserting
**Limitation:** Space constraints (60 char max)
**Mitigation:** Preview shows enough context for identification

### Share Extension Display Name

**Current:** "Save Snippet"
**Customization:** Set in `project.pbxproj` `INFOPLIST_KEY_CFBundleDisplayName`
**Note:** Cannot be changed by user at runtime

---

## File Locations Quick Reference

| Requirement | Primary Files |
|-------------|--------------|
| REQ-SM-001 | `ContentView.swift:47-49`, `SnippetStorage.swift:30-43` |
| REQ-SM-002 | `ContentView.swift:22-34` |
| REQ-SM-003 | `ContentView.swift:51-56`, `SnippetStorage.swift:58-62` |
| REQ-SM-004 | `ContentView.swift:59-87` (TODO) |
| REQ-SM-005 | `SnippetStorage.swift:30-43` (TODO) |
| REQ-SM-006 | `ShareViewController.swift:28-62`, `Info.plist` |
| REQ-SM-007 | `ShareView.swift:15-47` |
| REQ-SM-008 | `ShareView.swift` (TODO) |
| REQ-SM-009 | `ShareViewController.swift:91-121` |
| REQ-SM-010 | `ShareViewController.swift:123-133` |
| REQ-SM-011 | `SnippetKeyboard/Info.plist` |
| REQ-SM-012 | `KeyboardView.swift:14-34` |
| REQ-SM-013 | `KeyboardView.swift:37-74` (TODO) |
| REQ-SM-014 | `KeyboardViewController.swift:73-76` |
| REQ-SM-015 | `KeyboardView.swift:76-87` |
| REQ-SM-016 | `SnippetStorage.swift:13,19` |
| REQ-SM-017 | `SnippetStorage.swift:46-55` |
| REQ-SM-018 | `Snippet.swift:10-20` (TODO) |
| REQ-SM-019-024 | Various (see individual entries above) |
