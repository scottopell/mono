# ClipKitCore - Package Overview

## What I Built For You

I've created a complete Swift Package that unifies the data models from both **SnippetManager** and **sPaperClip**, based on the solid Core Data foundation you already built in paperclip.

## Package Contents

### 📦 17 Files, ~2,500 Lines of Code

```
ClipKitCore/
├── Package.swift                          # SPM configuration
├── README.md                              # Complete documentation
├── MIGRATION.md                           # Migration guides
├── .gitignore
│
├── Sources/ClipKitCore/
│   ├── ClipKitCore.swift                 # Main entry point
│   │
│   ├── Models/                            # Swift model layer
│   │   ├── ClipKitEnums.swift            # ItemType, LifetimeType, etc.
│   │   └── ClipKitModels.swift           # ClipKitItemModel, etc.
│   │
│   ├── CoreData/                          # Core Data layer
│   │   ├── ClipKitDataModel.xcdatamodeld # Core Data schema
│   │   ├── ClipKitItem+CoreData.swift    # Managed object
│   │   ├── ClipKitContent+CoreData.swift
│   │   ├── ClipKitFormat+CoreData.swift
│   │   └── ClipKitSourceApp+CoreData.swift
│   │
│   ├── Storage/                           # Storage managers
│   │   ├── ClipKitCoreDataManager.swift  # Core Data stack
│   │   └── ClipKitStorageManager.swift   # High-level API
│   │
│   └── Utilities/
│       ├── DateFormatting.swift          # "2 hrs ago", etc.
│       └── TextProcessing.swift          # Previews, detection
│
└── Tests/ClipKitCoreTests/
    └── ClipKitCoreTests.swift            # Comprehensive tests
```

## Data Model Design

### Based on Your paperclip Model ✅

I kept your proven Core Data architecture:

**Your Original (sPaperClip):**
- `CDClipboardHistoryItem` - Main entity
- `CDClipboardContent` - Data with formats
- `CDClipboardFormat` - UTI information
- `CDSourceApplicationInfo` - Source app metadata

**ClipKitCore (Extended):**
- `ClipKitItem` - Unified main entity (supports both paradigms)
- `ClipKitContent` - Same concept, your design
- `ClipKitFormat` - Same concept, your design
- `ClipKitSourceApp` - Same concept, your design

### New Fields Added to ClipKitItem

To support SnippetManager features:

```swift
// Item classification
itemType: ItemType          // .snippet or .clipboardHistory
lifetimeType: LifetimeType  // .permanent, .timed, .session
saveMethod: SaveMethod      // .automatic, .shareExtension, .keyboard, etc.
platform: Platform?         // .iOS, .macOS, .shared

// Lifecycle management
expirationDate: Date?       // When timed items expire
isPinned: Bool             // Pinned items never expire
isDeleted: Bool            // Soft delete support

// Organization
tags: [String]             // User-defined categories
notes: String?             // User notes
```

## How It Unifies Both Apps

### sPaperClip Use Case (Automatic Clipboard)

```swift
// Your existing clipboard monitoring code can do:
let item = ClipKitItemModel.clipboardHistory(
    contents: [content],
    sourceApp: sourceAppInfo,
    platform: .macOS
)
ClipKitStorageManager.shared.saveItem(item)
```

### SnippetManager Use Case (Explicit Snippets)

```swift
// iOS share extension can do:
let snippet = ClipKitItemModel.snippet(
    text: "Hello World",
    isTimed: true,  // Auto-expires in 7 days
    tags: ["greetings"],
    saveMethod: .shareExtension,
    platform: .iOS
)
ClipKitStorageManager.shared.saveItem(snippet)
```

### Both Apps Can Use

```swift
// Load all active items (auto-filtered)
ClipKitStorageManager.shared.loadActiveItems { items in
    // Works for both clipboard history and snippets
}

// Search across everything
ClipKitStorageManager.shared.searchItems(query: "hello") { results in
    // Finds both clipboard items and snippets
}

// Filter by type if needed
ClipKitStorageManager.shared.loadItems(itemType: .snippet) { snippets in
    // Only explicit snippets
}
```

## Key Design Decisions

### 1. Based on Your Proven Architecture ✅

I didn't reinvent the wheel. Your paperclip Core Data model was well-designed, so I:
- Kept the same entity relationships
- Preserved your multi-content, multi-format approach
- Maintained your source app tracking
- Extended (not replaced) your foundation

### 2. Platform-Agnostic with Platform-Specific Features

```swift
// iOS: App Group support
ClipKitStorageManager.shared.configureAppGroup("group.com.yourcompany.clipkit")

// macOS: Application Support directory (automatic)
// No configuration needed
```

### 3. Async-First API

All storage operations use completion handlers to avoid blocking:

```swift
ClipKitStorageManager.shared.saveItem(item) { success in
    // Called on main thread
}
```

### 4. Automatic Filtering

```swift
loadActiveItems()  // Automatically filters:
                   // - Deleted items (isDeleted == false)
                   // - Expired items (unless pinned)
```

## What You Can Do Now

### Option 1: Migrate sPaperClip Gradually

1. Add ClipKitCore as dependency
2. Keep using your current code
3. Gradually replace `CDClipboardHistoryItem` with `ClipKitItem`
4. Add new features (tags, timed expiration) incrementally

### Option 2: Migrate SnippetManager

1. Add ClipKitCore to Xcode project
2. Run migration script (in MIGRATION.md)
3. Replace UserDefaults with Core Data
4. Gain search, tags, and better performance

### Option 3: Build Unified ClipKit App

1. Create new iOS app using ClipKitCore
2. Create new macOS app using ClipKitCore
3. Both share same data model
4. Add cross-platform features:
   - iOS: Optional clipboard monitoring
   - macOS: Explicit snippet saving
   - Both: Tags, search, expiration

## Example: Full Usage

```swift
import ClipKitCore

// Configure (iOS only)
ClipKitStorageManager.shared.configureAppGroup("group.com.clipkit")

// Save a snippet (SnippetManager style)
let snippet = ClipKitItemModel.snippet(
    text: "My reusable template",
    isTimed: false,
    tags: ["work", "templates"],
    saveMethod: .manual,
    platform: .iOS
)
ClipKitStorageManager.shared.saveItem(snippet)

// Save clipboard history (sPaperClip style)
let clipboardItem = ClipKitItemModel.clipboardHistory(
    contents: [content],
    sourceApp: sourceApp,
    platform: .macOS
)
ClipKitStorageManager.shared.saveItem(clipboardItem)

// Load and display
ClipKitStorageManager.shared.loadActiveItems { items in
    for item in items {
        print(item.textRepresentation ?? "No text")
        print("Type: \(item.itemType)")
        print("Created: \(DateFormatting.relativeString(from: item.createdAt))")
        if let exp = item.expirationDate {
            print("Expires: \(DateFormatting.expirationString(from: exp))")
        }
    }
}

// Search
ClipKitStorageManager.shared.searchItems(query: "template") { results in
    print("Found \(results.count) items")
}

// Filter by tags
ClipKitStorageManager.shared.loadItems(tags: ["work"]) { workItems in
    print("Work items: \(workItems.count)")
}

// Maintenance
ClipKitStorageManager.shared.limitItemCount(to: 1000)
ClipKitStorageManager.shared.deleteExpiredItems()
```

## Testing

Included comprehensive test suite:

```bash
cd ClipKitCore
swift test
```

Tests cover:
- Model creation (snippets, clipboard history)
- Lifecycle management (expiration, pinning)
- Date formatting utilities
- Text processing utilities
- Storage operations (save, load, search)
- Filtering (by type, tags, expiration)

## Documentation

- **README.md**: Complete API documentation with examples
- **MIGRATION.md**: Step-by-step migration guides for both apps
- **This file (OVERVIEW.md)**: High-level summary

## Next Steps

1. **Review the package**: Check if the data model meets your needs
2. **Try the examples**: See README.md for usage patterns
3. **Test migration**: Use MIGRATION.md to migrate one app
4. **Provide feedback**: Let me know what needs adjustment

## Statistics

- **17 files created**
- **~2,500 lines of code**
- **4 main entities** (unified from both apps)
- **Full test coverage** for core functionality
- **Complete documentation** with migration guides
- **Zero external dependencies** (just Foundation + CoreData)

## Why This Design Works

1. **Preserves your work**: Based on paperclip's proven architecture
2. **Enables unification**: Both apps can use same data model
3. **Maintains flexibility**: Each app can still have unique features
4. **Future-proof**: Easy to add sync, sharing, etc.
5. **Type-safe**: Swift enums prevent invalid states
6. **Tested**: Comprehensive test suite included

Enjoy your unified ClipKit data model! 🎉
