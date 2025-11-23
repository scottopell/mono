# SnippetManager vs sPaperClip - Cross-Platform Analysis

## Executive Summary

**SnippetManager** (iOS) and **sPaperClip** (macOS) are complementary text management tools with similar privacy-first philosophies but different interaction paradigms. SnippetManager focuses on *explicit snippet curation* with keyboard insertion, while sPaperClip provides *automatic clipboard history* with global search.

**Recommendation:** Create a unified cross-platform "TextClip" app that combines the best of both, with platform-specific features:
- **Shared Core**: Common data model, sync logic, snippet management
- **iOS**: Explicit saving + keyboard extension + clipboard history
- **macOS**: Automatic clipboard tracking + global search + menu bar

---

## Platform & Technology Comparison

| Aspect | SnippetManager (iOS) | sPaperClip (macOS) |
|--------|---------------------|-------------------|
| **Platform** | iOS 16.0+ (iPhone, iPad) | macOS 15.0+ |
| **Language** | Swift | Swift |
| **UI Framework** | SwiftUI + UIKit (extensions) | Swift (likely SwiftUI/AppKit) |
| **Storage** | UserDefaults (App Groups) | Core Data |
| **Persistence** | JSON encoding | Core Data SQLite |
| **Privacy** | Local only, no network | Local storage (assumed) |
| **Status** | 79% complete (19/24 reqs) | Production ready |

---

## Feature Comparison

### Content Management

| Feature | SnippetManager | sPaperClip | Combined Recommendation |
|---------|---------------|-----------|------------------------|
| **Primary Paradigm** | Explicit save (curated) | Automatic clipboard tracking | **Both**: iOS explicit + automatic, macOS automatic |
| **Content Types** | Plain text only | Multiple data formats | **Keep both**: Start with text, expand later |
| **Snippet Types** | Regular (permanent) + Timed (7-day expiration) | History-based (all items) | **iOS**: Keep both types<br>**macOS**: Add timed option |
| **Organization** | Chronological (newest first) | Chronological with search | **Add**: Categories/tags to both |
| **Metadata** | UUID, text, timestamp, type, expiration | Source app, timestamp | **Unified**: UUID, text, timestamp, source, type, expiration |

### Access & Insertion

| Feature | SnippetManager | sPaperClip | Combined Recommendation |
|---------|---------------|-----------|------------------------|
| **Primary Access** | Custom keyboard extension | Global search (Cmd+Shift+Space) | **iOS**: Keyboard<br>**macOS**: Global search |
| **Secondary Access** | Main app (view/delete) | Menu bar stats | **Both**: Full-featured main apps |
| **Insertion** | Tap snippet in keyboard | Search → select → paste | **Both**: Keep platform conventions |
| **Saving** | Share extension from any app | Automatic on clipboard change | **iOS**: Both explicit + auto<br>**macOS**: Auto with manual pin |

### User Experience

| Feature | SnippetManager | sPaperClip | Combined Recommendation |
|---------|---------------|-----------|------------------------|
| **Empty State** | Clear instructions for share extension | (Unknown) | **Both**: Helpful onboarding |
| **Visual Design** | Native iOS components, dark mode | (Assumed native macOS) | **Both**: Platform-native design |
| **Accessibility** | Dynamic Type (main app + share), fixed fonts (keyboard) | (Unknown) | **Both**: Full accessibility support |
| **Performance Target** | < 0.5s app launch | (Unknown) | **Both**: Sub-second response |

---

## Architecture Comparison

### SnippetManager (iOS)

```
┌─────────────┐  ┌──────────────┐  ┌────────────────┐
│  Main App   │  │Share Extension│  │Keyboard Extension│
│ (View/Manage)│  │ (Save Text)   │  │ (Insert Text)  │
└──────┬──────┘  └──────┬───────┘  └────────┬───────┘
       │                │                   │
       └────────────────┼───────────────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │   SnippetStorage      │
            │   (Shared Class)      │
            └───────────┬───────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │UserDefaults (App Group)│
            │  JSON-encoded snippets │
            └───────────────────────┘
```

**Key Points:**
- 3 components sharing data via App Groups
- Simple JSON persistence
- Filter-on-read for expired snippets (no background cleanup)
- Stateless extensions (reload on activation)

### sPaperClip (macOS)

```
┌─────────────┐  ┌──────────────┐  ┌─────────────┐
│  Main App   │  │Global Search │  │  Menu Bar   │
│  (Viewer)   │  │(Cmd+Shift+Sp)│  │  (Stats)    │
└──────┬──────┘  └──────┬───────┘  └──────┬──────┘
       │                │                  │
       └────────────────┼──────────────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │   Core Data Model     │
            │   (Persistent Store)  │
            └───────────┬───────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │  SQLite Database      │
            │  (Local File)         │
            └───────────────────────┘
```

**Key Points:**
- Clipboard monitoring (likely NSPasteboard observation)
- Core Data for relational data + complex queries
- Global search UI (likely separate window/panel)
- Menu bar agent (background process)

---

## Philosophical Alignment

### Shared Values ✅

1. **Privacy-First**
   - SnippetManager: No network access, minimal keyboard permissions
   - sPaperClip: Local storage only
   - **Combined**: Continue zero-network approach, emphasize privacy

2. **Platform-Native**
   - SnippetManager: iOS share sheet, custom keyboard, system colors
   - sPaperClip: macOS global keyboard shortcuts, menu bar
   - **Combined**: Embrace each platform's conventions

3. **Simplicity**
   - SnippetManager: Minimal scope (24 requirements), YAGNI/KISS
   - sPaperClip: Focused feature set (history + search)
   - **Combined**: Keep core simple, add features intentionally

### Interaction Paradigm Differences

| Aspect | SnippetManager | sPaperClip | Synthesis |
|--------|---------------|-----------|-----------|
| **Curation** | Explicit (user chooses what to save) | Automatic (everything saved) | **iOS**: Both modes<br>**macOS**: Auto with manual "pin" |
| **Ephemeral vs Permanent** | Regular (permanent) + Timed (7-day) | All history (user deletes manually) | **Both**: Add timed expiration option |
| **Access Pattern** | Always available (keyboard) | On-demand (search) | **Keep platform patterns** |

---

## Data Model Unification

### Current Models

**SnippetManager:**
```swift
struct Snippet: Codable, Identifiable {
    let id: UUID
    let text: String
    let timestamp: Date
    let isTimed: Bool              // Regular vs Timed
    let expirationDate: Date?      // Set if isTimed == true
}
```

**sPaperClip:**
```swift
// (Inferred from description)
@Model
class ClipboardItem {
    var id: UUID
    var content: Data              // Supports multiple formats
    var timestamp: Date
    var sourceApplication: String  // Metadata: which app
    // Possibly: contentType, format
}
```

### Unified Model Proposal

```swift
// Shared Core Data model (works for both platforms)
@Model
class TextClipItem: Identifiable {
    // Identity
    var id: UUID
    var createdAt: Date
    var modifiedAt: Date

    // Content
    var text: String
    var contentType: String = "text/plain"  // Future: support rich text

    // Metadata
    var sourceApplication: String?  // macOS: auto-detected, iOS: manual note
    var tags: [String] = []         // Categories/labels

    // Type & Lifecycle
    var itemType: ItemType          // .snippet, .clipboardHistory
    var lifetimeType: LifetimeType  // .permanent, .timed, .session
    var expirationDate: Date?       // Set for timed items
    var isPinned: Bool = false      // User-marked favorites

    // Platform-specific
    var savedMethod: SaveMethod     // .explicit, .automatic, .keyboard
    var platform: Platform          // .iOS, .macOS, .shared
}

enum ItemType: String, Codable {
    case snippet           // Explicitly saved (SnippetManager paradigm)
    case clipboardHistory  // Auto-captured (sPaperClip paradigm)
}

enum LifetimeType: String, Codable {
    case permanent  // Never expires
    case timed      // Expires after N days (default 7)
    case session    // Expires when app quits
}

enum SaveMethod: String, Codable {
    case explicit       // iOS: Share extension
    case automatic      // Clipboard monitoring
    case keyboard       // Direct save from keyboard
    case manual         // Main app manual entry
}

enum Platform: String, Codable {
    case iOS
    case macOS
    case shared  // If synced across devices
}
```

---

## Cross-Platform Architecture Options

### Option 1: Monorepo with Shared Swift Package (Recommended)

```
mono/
├── TextClipShared/              # Swift Package
│   ├── Sources/
│   │   ├── Models/
│   │   │   ├── TextClipItem.swift
│   │   │   ├── Storage.swift
│   │   │   └── SyncEngine.swift (future)
│   │   ├── Business Logic/
│   │   │   ├── ExpirationManager.swift
│   │   │   ├── SearchEngine.swift
│   │   │   └── TagManager.swift
│   │   └── Utilities/
│   │       ├── DateFormatting.swift
│   │       └── TextProcessing.swift
│   ├── Tests/
│   └── Package.swift
│
├── TextClip-iOS/                # iOS App
│   ├── TextClip/                # Main app
│   ├── TextClipKeyboard/        # Keyboard extension
│   ├── TextClipShare/           # Share extension
│   ├── Shared/                  # iOS-specific shared code
│   └── TextClip.xcodeproj
│
└── TextClip-macOS/              # macOS App
    ├── TextClip/                # Main app
    ├── TextClipHelper/          # Menu bar agent
    ├── GlobalSearch/            # Search window
    └── TextClip.xcodeproj
```

**Pros:**
- Maximum code reuse (data model, business logic, utilities)
- Unified testing for core logic
- Easy to keep platforms in sync
- Single source of truth for data structures

**Cons:**
- More complex build setup
- Need to manage Swift Package dependencies

### Option 2: Separate Repos with Shared Protocol

**Pros:**
- Complete platform independence
- Simpler per-platform development
- Can evolve separately

**Cons:**
- Duplicate business logic
- Harder to maintain consistency
- No code reuse

### Option 3: Merge into Single Project (Not Recommended)

**Cons:**
- iOS and macOS have fundamentally different extension models
- Confusing project structure
- Hard to maintain platform-specific features

**Recommendation:** Use **Option 1** with a shared Swift Package.

---

## Feature Synthesis Recommendations

### Core Features (Both Platforms)

| Feature | iOS Implementation | macOS Implementation |
|---------|-------------------|---------------------|
| **Snippet Storage** | UserDefaults → migrate to Core Data | Core Data (already) |
| **Search** | In-app search bar | Global search (Cmd+Shift+Space) |
| **Expiration** | Regular + Timed (7-day) | Add timed option (manual or auto) |
| **Visual Design** | iOS native (SwiftUI) | macOS native (SwiftUI/AppKit) |
| **Privacy** | Local only | Local only |

### Platform-Specific Features

#### iOS Exclusive
- **Custom Keyboard Extension**: Insert snippets while typing
- **Share Extension**: Save from any app
- **Clipboard Monitoring** (new): Optional auto-save from clipboard
  - Toggle in settings (default: off for privacy)
  - Shows notification when clipboard captured
  - Appears in keyboard with "clipboard history" badge

#### macOS Exclusive
- **Global Search**: Cmd+Shift+Space for instant access
- **Menu Bar Agent**: Show recent clips, stats, quick actions
- **Automatic Clipboard Tracking**: Default mode
  - Every clipboard change auto-saved
  - Filter by source app
  - Smart deduplication

### New Cross-Platform Features

| Feature | Priority | Complexity | Value |
|---------|---------|-----------|-------|
| **Tags/Categories** | High | Medium | Organize large collections |
| **Search within snippets** | High | Low | Essential for clipboard history |
| **Pin favorites** | Medium | Low | Quick access to important items |
| **Export/Import** | Medium | Medium | Backup, migration |
| **Snippet templates** | Low | High | Variables, placeholders |
| **iCloud Sync** | Low | Very High | Cross-device access (privacy concerns) |

---

## Migration Path

### Phase 1: Unify Data Model (2-3 weeks)

**Goal:** Create shared Swift Package with common data model

1. **Create TextClipShared package**
   - Define `TextClipItem` model
   - Implement Core Data stack
   - Add expiration logic
   - Add search utilities

2. **Migrate sPaperClip to unified model**
   - Update Core Data schema
   - Add migration from old schema
   - Test data preservation

3. **Migrate SnippetManager to Core Data**
   - Replace UserDefaults with Core Data
   - Migrate existing snippets (JSON → Core Data)
   - Update all components to use new model

### Phase 2: Feature Parity (3-4 weeks)

**Goal:** Both platforms have core feature set

1. **iOS Additions**
   - Add search to main app
   - Add tags/categories
   - Optional clipboard monitoring (off by default)

2. **macOS Additions**
   - Add timed snippets feature
   - Add pin/favorite functionality
   - Improve main app UI

### Phase 3: Platform Integration (2-3 weeks)

**Goal:** Deep platform integration

1. **iOS**
   - Keyboard extension shows clipboard history
   - Share extension supports tags
   - Main app widget (iOS 16+)

2. **macOS**
   - Global search refinements
   - Menu bar improvements
   - Touch Bar support (if applicable)

### Phase 4: Advanced Features (Optional, 4-6 weeks)

1. **Cross-Platform**
   - Export/import functionality
   - Advanced search (regex, date filters)
   - Statistics and insights

2. **Sync (Optional, significant privacy considerations)**
   - iCloud CloudKit integration
   - End-to-end encryption
   - Conflict resolution
   - Per-item sync toggle

---

## Name & Branding

### Option 1: Keep Both Names
- **iOS**: "SnippetManager" (emphasizes curation)
- **macOS**: "sPaperClip" (emphasizes clipboard)
- **Shared Package**: "TextClipCore"

**Pros:** Each app keeps its identity
**Cons:** Harder to market as unified solution

### Option 2: Unified Name
- **Both Platforms**: "TextClip" or "ClipKit" or "PasteKit"
- **iOS Subtitle**: "Snippets & Keyboard"
- **macOS Subtitle**: "Clipboard Manager"

**Pros:** Clear cross-platform brand
**Cons:** Lose existing recognition

### Option 3: Brand Umbrella (Recommended)
- **Suite Name**: "ClipKit"
- **iOS**: "ClipKit for iPhone" (formerly SnippetManager)
- **macOS**: "ClipKit for Mac" (formerly sPaperClip)
- **Shared Package**: "ClipKitCore"

**Pros:** Professional, scalable, clear relationship
**Cons:** Requires rebranding effort

---

## Technical Challenges & Solutions

### Challenge 1: Storage Migration

**Problem:** SnippetManager uses UserDefaults, sPaperClip uses Core Data

**Solution:**
```swift
// Migration utility in TextClipShared
class StorageMigrator {
    static func migrateFromUserDefaults(appGroupID: String) throws {
        guard let oldData = UserDefaults(suiteName: appGroupID)?
            .data(forKey: "saved_snippets") else { return }

        let oldSnippets = try JSONDecoder().decode([OldSnippet].self, from: oldData)

        for snippet in oldSnippets {
            let newItem = TextClipItem(
                id: snippet.id,
                text: snippet.text,
                createdAt: snippet.timestamp,
                itemType: .snippet,
                lifetimeType: snippet.isTimed ? .timed : .permanent,
                expirationDate: snippet.expirationDate,
                savedMethod: .explicit,
                platform: .iOS
            )
            modelContext.insert(newItem)
        }

        try modelContext.save()
        // Archive old data, don't delete immediately
    }
}
```

### Challenge 2: Clipboard Monitoring on iOS

**Problem:** iOS doesn't have direct clipboard change notifications

**Solution:**
```swift
// iOS clipboard monitoring (privacy-conscious)
class ClipboardMonitor {
    private var lastChangeCount: Int = 0
    private var timer: Timer?

    func startMonitoring(enabled: Bool) {
        guard enabled else { return }

        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            let currentCount = UIPasteboard.general.changeCount
            if currentCount != self?.lastChangeCount {
                self?.lastChangeCount = currentCount
                self?.handleClipboardChange()
            }
        }
    }

    private func handleClipboardChange() {
        guard let text = UIPasteboard.general.string else { return }

        // Show user notification
        // Save with itemType = .clipboardHistory
        // Auto-set as timed (7 days) unless pinned
    }
}
```

### Challenge 3: Cross-Extension Data Access (iOS)

**Problem:** Core Data harder to share via App Groups than UserDefaults

**Solution:**
```swift
// Shared Core Data stack for iOS
class SharedPersistenceController {
    static let shared = SharedPersistenceController()

    let container: NSPersistentContainer

    init() {
        container = NSPersistentContainer(name: "TextClip")

        // Use App Group container
        let appGroupID = "group.com.yourcompany.textclip"
        if let url = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupID
        ) {
            let storeURL = url.appendingPathComponent("TextClip.sqlite")
            let description = NSPersistentStoreDescription(url: storeURL)
            container.persistentStoreDescriptions = [description]
        }

        container.loadPersistentStores { description, error in
            if let error = error {
                fatalError("Core Data store failed: \(error)")
            }
        }
    }
}
```

### Challenge 4: Global Search on macOS

**Problem:** Need always-available search window

**Solution:**
```swift
// macOS global search window
class GlobalSearchController: NSWindowController {
    static let shared = GlobalSearchController()

    convenience init() {
        let window = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 600, height: 400),
            styleMask: [.titled, .closable, .resizable, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        window.level = .floating
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]

        self.init(window: window)
    }

    func showSearch() {
        window?.center()
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
}

// Register global hotkey (Cmd+Shift+Space)
KeyboardShortcuts.onKeyUp(for: .globalSearch) {
    GlobalSearchController.shared.showSearch()
}
```

---

## Privacy & Security Considerations

### Unified Privacy Policy

**Core Principles:**
1. **Zero network access** (except opt-in sync in future)
2. **Local storage only**
3. **No telemetry or analytics**
4. **No third-party SDKs**
5. **Minimal permissions**

### Platform-Specific Privacy

**iOS:**
- Keyboard extension: `RequestsOpenAccess = false`
- Clipboard monitoring: **Opt-in only**, show clear notification
- Share extension: Only accepts text (no arbitrary data)
- Background refresh: Disabled (no background clipboard monitoring)

**macOS:**
- Accessibility permissions: Required only for global hotkey
- Clipboard access: Automatic, but show icon in menu bar when active
- Launch agent: User can disable in System Preferences
- Screen recording: **Never requested**

### Future Sync Privacy

**If iCloud sync added:**
- End-to-end encryption for all items
- Per-item sync toggle (mark items as "local only")
- No plaintext data in CloudKit
- User can delete all cloud data
- Sync is **opt-in**, default is local only

---

## Recommendation Summary

### Short-Term: Combine into "ClipKit" Suite

1. **Create shared Swift Package** (`ClipKitCore`)
   - Unified data model (`TextClipItem`)
   - Core Data persistence
   - Business logic (search, expiration, tags)

2. **Migrate both apps** to use shared package
   - SnippetManager → ClipKit for iOS
   - sPaperClip → ClipKit for Mac
   - Preserve all existing functionality

3. **Add feature parity**
   - iOS: Add search, tags
   - macOS: Add timed snippets, favorites

### Long-Term: Cross-Platform Excellence

1. **iOS Unique Features**
   - Best-in-class keyboard extension
   - Optional clipboard history (privacy-conscious)
   - Share extension with tags

2. **macOS Unique Features**
   - Powerful global search
   - Automatic clipboard tracking
   - Menu bar quick actions

3. **Shared Advanced Features**
   - Export/import
   - Advanced search
   - Statistics/insights
   - (Optional) iCloud sync with E2E encryption

### Success Metrics

**Technical:**
- < 0.5s search response time
- Core Data migration with 100% data preservation
- Zero network activity (verified in Network Link Conditioner)
- < 50MB memory footprint

**User Experience:**
- Same or better performance vs current apps
- No loss of existing features
- Seamless data migration
- Clear privacy communication

---

## Next Steps

1. **Decision Point**: Do you want to pursue cross-platform unification?

2. **If Yes, start with:**
   - Create `ClipKitCore` Swift Package in this monorepo
   - Define unified `TextClipItem` model
   - Migrate SnippetManager to Core Data (easier starting point)
   - Test iOS data migration thoroughly

3. **If No, optimize separately:**
   - Complete SnippetManager timed snippets (5 remaining requirements)
   - Enhance sPaperClip independently
   - Consider shared learnings but keep codebases separate

4. **Questions to Answer:**
   - Do you want a unified brand or keep separate identities?
   - Is iOS clipboard monitoring important to you?
   - Do you want cross-device sync eventually?
   - What's your priority: feature parity or platform-specific excellence?
