# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SnippetManager is an iOS app for managing and inserting text snippets across all applications. It consists of three components that share data via App Groups:

1. **Main App** (SnippetManager): View and manage saved snippets
2. **Custom Keyboard Extension** (SnippetKeyboard): Insert snippets from any app
3. **Share Extension** (SnippetShare): Save text from other apps via share sheet

**Key Technologies:**
- SwiftUI for all UI components
- App Groups for cross-component data sharing
- UserDefaults for persistence (JSON encoding via Codable)
- UIKit hosting for extensions (UIInputViewController, UIViewController)

## Build and Development Commands

### Building the Project

```bash
# Open in Xcode
open SnippetManager.xcodeproj

# Build from command line (main app scheme)
xcodebuild -project SnippetManager.xcodeproj -scheme SnippetManager -configuration Debug

# Build all targets
xcodebuild -project SnippetManager.xcodeproj -alltargets
```

### Running and Testing

**Device/Simulator:**
- Open project in Xcode, select SnippetManager scheme, and Run (Cmd+R)
- Extensions must be enabled manually in iOS Settings after installation

**Manual Testing:**
- Main app: Launch and verify snippet list display
- Share extension: Select text in Safari/Notes → Share → "Save Snippet"
- Keyboard: Settings → General → Keyboard → Keyboards → Add New Keyboard → SnippetKeyboard

**No automated tests currently exist.** All testing is manual per specs/executive.md.

## Architecture

### Data Flow

```
Share Extension → SnippetStorage → UserDefaults (App Group) ← Main App
                                                              ← Keyboard Extension
```

All three components use the same `SnippetStorage` class (Shared/SnippetStorage.swift) to access shared UserDefaults storage via App Groups.

### Component Breakdown

**Main App (SnippetManager/):**
- Entry: `SnippetManagerApp.swift` - SwiftUI App lifecycle
- View: `ContentView.swift` - List of snippets with swipe-to-delete
- Displays filtered snippets (expired timed snippets hidden automatically)
- Shows empty state with instructions when no snippets exist

**Share Extension (SnippetShare/):**
- Entry: `ShareViewController.swift` - UIKit extension point
- View: `ShareView.swift` - SwiftUI view for review and save
- Extracts plain text from share sheet items
- Provides Regular/Timed snippet type selection
- Shows "Saved!" confirmation and auto-dismisses

**Keyboard Extension (SnippetKeyboard/):**
- Entry: `KeyboardViewController.swift` - UIInputViewController
- View: `KeyboardView.swift` - Horizontal scrollable snippet list
- Reloads snippets on every keyboard appearance
- Uses `textDocumentProxy.insertText()` for snippet insertion
- ~100pt height constraint per iOS keyboard guidelines

**Shared Code (Shared/):**
- `Snippet.swift` - Data model with Codable conformance
  - Fields: id (UUID), text, timestamp, isTimed, expirationDate
  - Backwards-compatible decoder (existing snippets default to regular type)
- `SnippetStorage.swift` - Storage layer with expiration filtering
  - App Group ID: `group.com.scottopell.snippetmanager`
  - Filter-on-read approach (expired snippets stay in storage, filtered during load)

### Snippet Types

**Regular Snippets:**
- Never expire
- For permanent reusable content (templates, addresses)
- `isTimed = false`, `expirationDate = nil`

**Timed Snippets:**
- Expire 7 days after creation
- For transient content (URLs, flight info)
- `isTimed = true`, `expirationDate = timestamp + 7 days`
- Auto-hidden after expiration (filtered in `SnippetStorage.loadSnippets()`)

## Key Implementation Details

### App Groups Configuration

**Critical:** All three components must use the same App Group ID to share data.

- **Current App Group ID:** `group.com.scottopell.snippetmanager` (in SnippetStorage.swift:13)
- **Entitlements files:** All three `.entitlements` files must match this ID
- **Apple Developer Portal:** App Group must be registered and assigned to all three App IDs
- **Xcode:** App Groups capability must be enabled for all three targets

### Requirements Traceability

Code includes `// REQ-SM-XXX` comments linking to requirements in `specs/requirements.md`. Use ripgrep to find all references:

```bash
# Find all references to a specific requirement
rg "REQ-SM-001"

# Find all requirement comments in code
rg "// REQ-" --type swift
```

### Expiration Logic

Expired timed snippets are filtered during load (filter-on-read pattern):
- `SnippetStorage.loadSnippets()` filters out snippets where `expirationDate < Date()`
- Expired snippets remain in storage (not immediately deleted for performance)
- All views automatically show only non-expired snippets

### Visual Indicators for Timed Snippets

**Main App (ContentView.swift:72-84):**
- Orange clock icon (`clock.badge`)
- "Expires in X days" text

**Keyboard (KeyboardView.swift:50-62):**
- Orange clock icon (compact size)
- "Xd left" format for remaining days

## Common Development Patterns

### Adding New Features

1. Add requirement to `specs/requirements.md` (use next sequential REQ-SM-XXX ID)
2. Update `specs/design.md` with implementation details
3. Implement with `// REQ-SM-XXX` comments in code
4. Update `specs/executive.md` status table
5. Test manually per testing checklist

### Modifying Data Model

**IMPORTANT:** Maintain backwards compatibility for existing snippets:

```swift
// Example: Adding new optional field
struct Snippet: Codable, Identifiable {
    let newField: String?  // Optional for backwards compatibility

    init(from decoder: Decoder) throws {
        // Use decodeIfPresent for new fields
        newField = try container.decodeIfPresent(String.self, forKey: .newField)
    }
}
```

### Working with Extensions

**Keyboard Extension:**
- Height constraint: ~100pt (iOS guideline)
- No "Allow Full Access" required (RequestsOpenAccess = false in Info.plist)
- Reload data on `viewWillAppear` (stateless design)
- Use fixed fonts (Dynamic Type not feasible due to space constraints - documented limitation)

**Share Extension:**
- Accept only plain text (`public.plain-text`, `public.text`)
- Extract via `NSExtensionItem` → `NSItemProvider`
- Show UIAlertController for errors (extension context doesn't support SwiftUI alerts)
- Auto-dismiss after save with 1 second delay

## Important Constraints

### What NOT to Do

- **Never change requirement IDs** - They are immutable once assigned
- **Never add code snippets to executive.md** - Zero tolerance policy
- **Never create automated cleanup for expired snippets** - Use filter-on-read pattern
- **Never add network code** - All data must stay local (REQ-SM-023)
- **Never request "Allow Full Access" for keyboard** - Privacy requirement (REQ-SM-024)
- **Never modify snippet text during insertion** - Insert exactly as saved (REQ-SM-014)

### Known Limitations

1. **Keyboard Dynamic Type:** Fixed font sizes due to 100pt height constraint (REQ-SM-021 partial)
2. **No automated tests:** All testing is manual (documented in specs/executive.md)
3. **No background cleanup:** Expired snippets stay in storage, filtered on read
4. **No snippet editing:** Must delete and re-save to modify content
5. **7-day expiration fixed:** Cannot customize expiration duration for timed snippets

## Configuration Checklist

Before building on a new machine or for a new developer:

1. **App Group ID:**
   - Verify `SnippetStorage.swift:13` matches your Apple Developer Portal group ID
   - Verify all three `.entitlements` files have the same group ID

2. **Bundle Identifiers:**
   - Main app: `com.scottopell.SnippetManager` (or your prefix)
   - Keyboard: `com.scottopell.SnippetManager.SnippetKeyboard`
   - Share: `com.scottopell.SnippetManager.SnippetShare`

3. **Code Signing:**
   - Open project in Xcode
   - Select each target → Signing & Capabilities
   - Choose development team
   - Verify App Groups capability is enabled with correct group ID

4. **Apple Developer Portal:**
   - Create App IDs for all three components
   - Create App Group identifier
   - Enable App Groups capability on all three App IDs
   - Assign App Group to all three App IDs

## Specs System

This project uses a requirements-based planning system. See `../CLAUDE.md` (mono repo root) for full details.

**Key files:**
- `specs/requirements.md` - Timeless EARS-formatted requirements (no status fields)
- `specs/design.md` - Technical architecture and implementation details (living document)
- `specs/executive.md` - Authoritative status tracking (single source of truth)

**Important:** When implementing features, always link code to requirements with `// REQ-SM-XXX` comments.

## Project Status

**Current State:** Feature complete. All 24 requirements implemented including timed snippets feature.

**Remaining Work:** Manual device testing to verify all components work together.

See `specs/executive.md` for detailed status of each requirement.
