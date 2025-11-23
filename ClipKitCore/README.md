# ClipKitCore

**Unified clipboard and snippet management for iOS and macOS**

ClipKitCore is a Swift Package that provides the foundational data model and storage layer for ClipKit, combining the best of automatic clipboard history tracking (sPaperClip) and explicit snippet management (SnippetManager).

## Features

- ✅ **Unified Data Model**: Single data model supporting both paradigms
- ✅ **Core Data Persistence**: Reliable, efficient storage with automatic migrations
- ✅ **Cross-Platform**: Works on both iOS 16+ and macOS 15+
- ✅ **App Group Support**: iOS extensions can share data with main app
- ✅ **Timed Expiration**: Automatic cleanup of temporary items
- ✅ **Tags & Organization**: Categorize and filter items
- ✅ **Search**: Full-text search across all items
- ✅ **Privacy-First**: Local storage only, no network access

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              ClipKitCore Package                    │
├─────────────────────────────────────────────────────┤
│  Models/                                            │
│  ├── ClipKitEnums.swift     (ItemType, Lifetime)   │
│  └── ClipKitModels.swift    (ClipKitItemModel)     │
│                                                      │
│  CoreData/                                          │
│  ├── ClipKitDataModel.xcdatamodeld                 │
│  ├── ClipKitItem+CoreData.swift                    │
│  ├── ClipKitContent+CoreData.swift                 │
│  ├── ClipKitFormat+CoreData.swift                  │
│  └── ClipKitSourceApp+CoreData.swift               │
│                                                      │
│  Storage/                                           │
│  ├── ClipKitCoreDataManager.swift                  │
│  └── ClipKitStorageManager.swift                   │
│                                                      │
│  Utilities/                                         │
│  ├── DateFormatting.swift                          │
│  └── TextProcessing.swift                          │
└─────────────────────────────────────────────────────┘
```

## Data Model

### Core Entities

#### ClipKitItem (Main Entity)
The unified item that can be either a clipboard history entry or an explicit snippet.

**Properties:**
- `id: UUID` - Unique identifier
- `createdAt: Date` - Creation timestamp
- `itemType: ItemType` - `.snippet` or `.clipboardHistory`
- `lifetimeType: LifetimeType` - `.permanent`, `.timed`, or `.session`
- `saveMethod: SaveMethod` - How it was saved (automatic, shareExtension, keyboard, etc.)
- `expirationDate: Date?` - When timed items expire
- `isPinned: Bool` - Pinned items never expire
- `tags: [String]` - User-defined categories
- `contents: [ClipKitContent]` - Data in multiple formats
- `sourceApplication: ClipKitSourceApp?` - Which app created it

#### ClipKitContent
Stores the actual data with format information.

**Properties:**
- `data: Data` - The actual content bytes
- `textPreview: String?` - Cached text representation
- `formats: [ClipKitFormat]` - Available UTI formats
- `contentType: String` - MIME type
- `byteSize: Int64` - Data size

#### ClipKitFormat
UTI (Uniform Type Identifier) information.

**Properties:**
- `uti: String` - The UTI (e.g., "public.plain-text")
- `typeName: String?` - Human-readable name

#### ClipKitSourceApp
Information about the originating application (macOS primarily).

**Properties:**
- `bundleIdentifier: String?` - App bundle ID
- `applicationName: String?` - Display name
- `applicationIconData: Data?` - Cached app icon

## Installation

### Swift Package Manager

Add ClipKitCore to your project's `Package.swift`:

```swift
dependencies: [
    .package(path: "../ClipKitCore")
]
```

Or in Xcode: File → Add Package Dependencies → Add Local...

## Usage

### Basic Setup

#### iOS with App Groups

```swift
import ClipKitCore

// Configure App Group for extension support
ClipKitStorageManager.shared.configureAppGroup("group.com.yourcompany.clipkit")
```

#### macOS

```swift
import ClipKitCore

// No additional configuration needed
// Data stored in Application Support directory
```

### Saving Items

#### Save an Explicit Snippet (SnippetManager Style)

```swift
let snippet = ClipKitItemModel.snippet(
    text: "print('Hello, World!')",
    isTimed: false,
    tags: ["code", "python"],
    saveMethod: .shareExtension,
    platform: .iOS
)

ClipKitStorageManager.shared.saveItem(snippet) { success in
    print("Snippet saved: \(success)")
}
```

#### Save Clipboard History (sPaperClip Style)

```swift
let content = ClipKitContentModel(
    data: clipboardData,
    formats: [
        ClipKitFormatModel(uti: "public.plain-text"),
        ClipKitFormatModel(uti: "public.rtf")
    ],
    textPreview: "Clipboard text...",
    contentType: "text/plain"
)

let sourceApp = ClipKitSourceAppModel(
    bundleIdentifier: "com.apple.Safari",
    applicationName: "Safari"
)

let item = ClipKitItemModel.clipboardHistory(
    contents: [content],
    sourceApp: sourceApp,
    platform: .macOS
)

ClipKitStorageManager.shared.saveItem(item) { success in
    print("Clipboard item saved: \(success)")
}
```

### Loading Items

#### Load All Active Items

```swift
ClipKitStorageManager.shared.loadActiveItems { items in
    print("Loaded \(items.count) active items")
    for item in items {
        print("- \(item.textRepresentation ?? "No text")")
    }
}
```

#### Load with Filters

```swift
// Load only snippets
ClipKitStorageManager.shared.loadItems(
    filterExpired: true,
    includeDeleted: false,
    itemType: .snippet
) { snippets in
    print("Found \(snippets.count) snippets")
}

// Load items with specific tags
ClipKitStorageManager.shared.loadItems(
    filterExpired: true,
    tags: ["code", "swift"]
) { items in
    print("Found \(items.count) code snippets")
}
```

#### Search

```swift
ClipKitStorageManager.shared.searchItems(query: "hello") { results in
    print("Found \(results.count) items matching 'hello'")
}
```

### Updating and Deleting

#### Update Item

```swift
var updatedItem = item
updatedItem.isPinned = true
updatedItem.tags = ["important", "code"]

ClipKitStorageManager.shared.updateItem(updatedItem) { success in
    print("Updated: \(success)")
}
```

#### Soft Delete

```swift
ClipKitStorageManager.shared.deleteItem(item) { success in
    print("Deleted: \(success)")
}
```

#### Permanent Delete

```swift
ClipKitStorageManager.shared.permanentlyDeleteItem(item.id) { success in
    print("Permanently deleted: \(success)")
}
```

### Maintenance

#### Limit Total Items

```swift
// Keep only the 1000 most recent items
ClipKitStorageManager.shared.limitItemCount(to: 1000)
```

#### Clean Up Expired Items

```swift
ClipKitStorageManager.shared.deleteExpiredItems()
```

#### Clear All Data

```swift
ClipKitStorageManager.shared.clearAllData()
```

## Item Types and Lifecycles

### Item Types

```swift
enum ItemType {
    case snippet          // Explicitly saved (SnippetManager)
    case clipboardHistory // Auto-captured (sPaperClip)
}
```

### Lifetime Types

```swift
enum LifetimeType {
    case permanent  // Never expires
    case timed      // Expires after N days (default 7)
    case session    // Expires when app quits
}
```

### Save Methods

```swift
enum SaveMethod {
    case shareExtension  // iOS share sheet
    case automatic       // Clipboard monitoring
    case keyboard        // iOS keyboard extension
    case manual          // Created in main app
    case imported        // From backup
}
```

## Utilities

### Date Formatting

```swift
import ClipKitCore

let relative = DateFormatting.relativeString(from: item.createdAt)
// "2 hrs ago", "3 days ago"

let expiration = DateFormatting.expirationString(from: item.expirationDate!)
// "Expires in 5 days"

let compact = DateFormatting.compactDaysRemaining(until: item.expirationDate!)
// "5d left"
```

### Text Processing

```swift
let preview = TextProcessing.preview(of: longText, maxLength: 100)
// Truncates to 100 characters with "..."

let firstLine = TextProcessing.firstLine(of: multilineText)

let isCode = TextProcessing.isLikelyCode(text)
let isURL = TextProcessing.isURL(text)

let size = TextProcessing.formatByteSize(item.contents.first?.byteSize ?? 0)
// "1.2 MB"
```

## Platform Differences

### iOS
- **Storage Location**: App Group container (configurable)
- **Use Case**: Share extension, keyboard extension, main app
- **App Group Required**: Yes (for extension support)

### macOS
- **Storage Location**: Application Support directory
- **Use Case**: Main app, menu bar agent, global search
- **App Group Required**: No

## Migration from Existing Apps

### From SnippetManager (iOS)

```swift
// Old SnippetManager snippet
struct OldSnippet: Codable {
    let id: UUID
    let text: String
    let timestamp: Date
    let isTimed: Bool
    let expirationDate: Date?
}

// Convert to ClipKitItemModel
func migrate(_ oldSnippet: OldSnippet) -> ClipKitItemModel {
    return ClipKitItemModel.snippet(
        text: oldSnippet.text,
        isTimed: oldSnippet.isTimed,
        saveMethod: .imported,
        platform: .iOS
    )
}
```

### From sPaperClip (macOS)

The Core Data model is designed to be compatible with sPaperClip's structure. Migration should be straightforward with entity mapping.

## Best Practices

### Performance

1. **Batch Operations**: Use background contexts for large operations
2. **Limit History**: Call `limitItemCount(to:)` periodically
3. **Clean Expired**: Run `deleteExpiredItems()` on app launch
4. **Preview Cache**: Store `textPreview` for large content

### Memory

1. **External Binary Storage**: Enabled for large data (images, PDFs)
2. **Lazy Loading**: Content data loaded only when accessed
3. **Pagination**: Implement pagination for large item lists

### Privacy

1. **Local Only**: No network access in ClipKitCore
2. **App Groups**: Scoped to your app and extensions
3. **Sandbox**: All data within app sandbox

## Testing

```swift
import XCTest
@testable import ClipKitCore

class ClipKitCoreTests: XCTestCase {
    func testSaveSnippet() {
        let expectation = XCTestExpectation(description: "Save snippet")

        let snippet = ClipKitItemModel.snippet(
            text: "Test snippet",
            isTimed: false
        )

        ClipKitStorageManager.shared.saveItem(snippet) { success in
            XCTAssertTrue(success)
            expectation.fulfill()
        }

        wait(for: [expectation], timeout: 5.0)
    }
}
```

## Requirements

- iOS 16.0+ / macOS 15.0+
- Swift 5.9+
- Xcode 15.0+

## License

Part of the ClipKit project. See main project for license information.

## Contributing

This is a core shared package. Changes should maintain compatibility with both iOS and macOS platforms.

## Roadmap

- [ ] CloudKit sync support (optional, privacy-conscious)
- [ ] End-to-end encryption for sync
- [ ] Rich text format support improvements
- [ ] Image content preview generation
- [ ] Automated testing suite expansion
- [ ] Performance benchmarking tools
