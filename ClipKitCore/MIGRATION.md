# Migration Guide

This guide helps you migrate existing apps to use ClipKitCore.

## Migrating from SnippetManager (iOS)

### Step 1: Add ClipKitCore Dependency

Update your `SnippetManager.xcodeproj` to include ClipKitCore:

1. In Xcode: File → Add Package Dependencies → Add Local
2. Select `ClipKitCore` package
3. Add to all three targets: Main App, Share Extension, Keyboard Extension

### Step 2: Configure App Group

```swift
// In main app, share extension, and keyboard extension
import ClipKitCore

// AppDelegate or App init
ClipKitStorageManager.shared.configureAppGroup("group.com.yourcompany.clipkit")
```

### Step 3: Migrate Existing Data

```swift
import ClipKitCore

struct OldSnippet: Codable {
    let id: UUID
    let text: String
    let timestamp: Date
    let isTimed: Bool
    let expirationDate: Date?
}

func migrateSnippetsToClipKit() {
    // Load old snippets from UserDefaults
    guard let appGroupID = "group.com.yourcompany.snippetmanager",
          let defaults = UserDefaults(suiteName: appGroupID),
          let data = defaults.data(forKey: "saved_snippets"),
          let oldSnippets = try? JSONDecoder().decode([OldSnippet].self, from: data) else {
        return
    }

    print("Migrating \(oldSnippets.count) snippets to ClipKit...")

    for oldSnippet in oldSnippets {
        let newItem = ClipKitItemModel.snippet(
            text: oldSnippet.text,
            isTimed: oldSnippet.isTimed,
            saveMethod: .imported,
            platform: .iOS
        )

        // Preserve original ID and timestamp
        var item = newItem
        item.id = oldSnippet.id
        item.createdAt = oldSnippet.timestamp
        item.expirationDate = oldSnippet.expirationDate

        ClipKitStorageManager.shared.saveItem(item) { success in
            if !success {
                print("Failed to migrate snippet: \(oldSnippet.id)")
            }
        }
    }

    // Archive old data (don't delete immediately)
    defaults.set(data, forKey: "saved_snippets_backup_\(Date().timeIntervalSince1970)")
    print("Migration complete. Old data backed up.")
}
```

### Step 4: Update SnippetStorage Class

Replace the old `SnippetStorage` class:

```swift
// Old
class SnippetStorage {
    static let appGroupID = "group.com.yourcompany.snippetmanager"

    func saveSnippet(_ snippet: Snippet) { ... }
    func loadSnippets() -> [Snippet] { ... }
    func deleteSnippet(_ snippet: Snippet) { ... }
}

// New
import ClipKitCore

class SnippetStorage {
    static let shared = SnippetStorage()

    private init() {
        ClipKitStorageManager.shared.configureAppGroup("group.com.yourcompany.clipkit")
    }

    func saveSnippet(text: String, isTimed: Bool) {
        let snippet = ClipKitItemModel.snippet(
            text: text,
            isTimed: isTimed,
            saveMethod: .shareExtension,
            platform: .iOS
        )
        ClipKitStorageManager.shared.saveItem(snippet)
    }

    func loadSnippets(completion: @escaping ([ClipKitItemModel]) -> Void) {
        ClipKitStorageManager.shared.loadItems(itemType: .snippet) { items in
            completion(items)
        }
    }

    func deleteSnippet(_ item: ClipKitItemModel) {
        ClipKitStorageManager.shared.deleteItem(item)
    }
}
```

### Step 5: Update UI Views

```swift
// Old ContentView
struct ContentView: View {
    @State private var snippets: [Snippet] = []

    var body: some View {
        List(snippets) { snippet in
            Text(snippet.text)
        }
        .onAppear {
            snippets = SnippetStorage().loadSnippets()
        }
    }
}

// New ContentView
struct ContentView: View {
    @State private var items: [ClipKitItemModel] = []

    var body: some View {
        List(items) { item in
            Text(item.textRepresentation ?? "")
        }
        .onAppear {
            ClipKitStorageManager.shared.loadItems(itemType: .snippet) { loadedItems in
                self.items = loadedItems
            }
        }
    }
}
```

## Migrating from sPaperClip (macOS)

### Step 1: Add ClipKitCore Dependency

In `Package.swift`:

```swift
dependencies: [
    .package(path: "../ClipKitCore")
],
targets: [
    .target(
        name: "spaperclip",
        dependencies: ["ClipKitCore"]
    )
]
```

### Step 2: Core Data Migration

The ClipKitCore data model is designed to be compatible. Create a mapping model:

**Option A: Lightweight Migration (Recommended)**

ClipKitCore entities map directly to sPaperClip entities:

- `CDClipboardHistoryItem` → `ClipKitItem` (set `itemType = "clipboardHistory"`)
- `CDClipboardContent` → `ClipKitContent`
- `CDClipboardFormat` → `ClipKitFormat`
- `CDSourceApplicationInfo` → `ClipKitSourceApp`

Enable automatic migration:

```swift
// In ClipKitCoreDataManager, this is already enabled:
description.shouldMigrateStoreAutomatically = true
description.shouldInferMappingModelAutomatically = true
```

**Option B: Custom Migration**

```swift
import CoreData
import ClipKitCore

func migrateFromPaperClip() {
    let oldStoreURL = // Your old sPaperClip store location
    let coordinator = NSPersistentStoreCoordinator(managedObjectModel: oldModel)

    // Load old store
    try? coordinator.addPersistentStore(ofType: NSSQLiteStoreType, at: oldStoreURL)

    let context = NSManagedObjectContext(concurrencyType: .privateQueueConcurrencyType)
    context.persistentStoreCoordinator = coordinator

    // Fetch old items
    let fetchRequest = NSFetchRequest<CDClipboardHistoryItem>(entityName: "CDClipboardHistoryItem")
    let oldItems = try? context.fetch(fetchRequest)

    // Migrate to ClipKitCore
    for oldItem in oldItems ?? [] {
        // Convert old item to ClipKitItemModel
        let contents = convertContents(oldItem.contents)
        let sourceApp = convertSourceApp(oldItem.sourceApplication)

        let newItem = ClipKitItemModel.clipboardHistory(
            contents: contents,
            sourceApp: sourceApp,
            platform: .macOS
        )

        ClipKitStorageManager.shared.saveItem(newItem)
    }
}
```

### Step 3: Update ClipboardPersistenceManager

```swift
// Old
class ClipboardPersistenceManager {
    func saveHistoryItem(_ item: ClipboardHistoryItem) {
        // Convert to Core Data entities
    }

    func loadHistoryItems(completion: @escaping ([ClipboardHistoryItem]) -> Void) {
        // Fetch from Core Data
    }
}

// New
import ClipKitCore

class ClipboardPersistenceManager {
    func saveHistoryItem(_ item: ClipboardHistoryItem) {
        // Convert to ClipKitItemModel
        let contents = item.contents.map { content in
            ClipKitContentModel(
                data: content.data,
                formats: content.formats.map { ClipKitFormatModel(uti: $0.uti) },
                textPreview: content.description
            )
        }

        let sourceApp = item.sourceApplication.map {
            ClipKitSourceAppModel(
                bundleIdentifier: $0.bundleIdentifier,
                applicationName: $0.applicationName
            )
        }

        let clipKitItem = ClipKitItemModel.clipboardHistory(
            contents: contents,
            sourceApp: sourceApp,
            platform: .macOS
        )

        ClipKitStorageManager.shared.saveItem(clipKitItem)
    }

    func loadHistoryItems(completion: @escaping ([ClipboardHistoryItem]) -> Void) {
        ClipKitStorageManager.shared.loadItems(itemType: .clipboardHistory) { items in
            // Convert ClipKitItemModel back to ClipboardHistoryItem if needed
            // Or update UI to use ClipKitItemModel directly
            completion(items.map { self.convert($0) })
        }
    }

    private func convert(_ item: ClipKitItemModel) -> ClipboardHistoryItem {
        // Convert if you need to keep old model
        // Or update your UI to use ClipKitItemModel directly
    }
}
```

### Step 4: Update ClipboardMonitor

```swift
// Old ClipboardMonitor
class ClipboardMonitor {
    func handleClipboardChange() {
        let item = ClipboardHistoryItem(...)
        ClipboardPersistenceManager.shared.saveHistoryItem(item)
    }
}

// Updated with ClipKitCore
class ClipboardMonitor {
    func handleClipboardChange() {
        // Create contents
        let contents = extractClipboardContents()

        // Get source app
        let sourceApp = getCurrentApplicationInfo()

        // Create ClipKit item
        let item = ClipKitItemModel.clipboardHistory(
            contents: contents,
            sourceApp: sourceApp,
            platform: .macOS
        )

        // Save
        ClipKitStorageManager.shared.saveItem(item)
    }
}
```

## Common Patterns

### Filtering Expired Items

```swift
// Old SnippetManager (filter on read)
func loadSnippets() -> [Snippet] {
    let all = decodeFromUserDefaults()
    return all.filter { !isExpired($0) }
}

// ClipKitCore (automatic filtering)
ClipKitStorageManager.shared.loadActiveItems { items in
    // Already filtered
}
```

### Timed Snippets

```swift
// Old
let snippet = Snippet(
    text: "Temporary",
    isTimed: true,
    expirationDate: Date().addingTimeInterval(7 * 24 * 60 * 60)
)

// New
let item = ClipKitItemModel.snippet(
    text: "Temporary",
    isTimed: true  // Automatically sets 7-day expiration
)
```

### Tags/Categories (New Feature)

```swift
// Save with tags
let item = ClipKitItemModel.snippet(
    text: "Code snippet",
    tags: ["swift", "code", "ios"]
)

// Filter by tags
ClipKitStorageManager.shared.loadItems(tags: ["swift"]) { items in
    // Only items with "swift" tag
}
```

## Testing Migration

1. **Backup Data**: Both migrations preserve old data
2. **Parallel Testing**: Run old and new code side-by-side
3. **Verify Counts**: Ensure all items migrated
4. **Check Metadata**: Verify timestamps, tags, expiration dates
5. **Test Extensions**: iOS keyboard and share extensions work

## Rollback Plan

### SnippetManager

Old data is backed up in UserDefaults with key `saved_snippets_backup_<timestamp>`.

To rollback:

```swift
let backupKey = "saved_snippets_backup_<timestamp>"
if let backupData = defaults.data(forKey: backupKey) {
    defaults.set(backupData, forKey: "saved_snippets")
}
```

### sPaperClip

Keep old Core Data store file as backup before migration.

## Performance Notes

- **First Load**: May be slower due to Core Data setup
- **Subsequent Loads**: Faster with Core Data indexing
- **Search**: Much faster with Core Data predicates
- **Memory**: More efficient with lazy loading

## Support

If you encounter issues during migration, check:

1. App Group ID configured correctly (iOS)
2. Core Data store location accessible
3. All entities have required fields
4. Date formats compatible
