//
//  Snippet.swift
//  SnippetManager
//
//  Compatibility wrapper around ClipKitItemModel
//

import Foundation
import ClipKitCore

// REQ-SM-018: Store snippet metadata including type and expiration
/// Compatibility wrapper around ClipKitItemModel for UI layer
struct Snippet: Identifiable {
    // The underlying ClipKit model
    private let item: ClipKitItemModel

    // Public interface matching the old Snippet struct
    var id: UUID { item.id }
    var text: String { item.textRepresentation ?? "" }
    var timestamp: Date { item.createdAt }
    var isTimed: Bool { item.lifetimeType == .timed }
    var expirationDate: Date? { item.expirationDate }

    // Initialize from ClipKitItemModel
    init(item: ClipKitItemModel) {
        self.item = item
    }

    // Initialize with legacy API (for backwards compatibility)
    init(id: UUID = UUID(), text: String, timestamp: Date = Date(), isTimed: Bool = false) {
        var clipKitItem = ClipKitItemModel.snippet(
            text: text,
            isTimed: isTimed,
            saveMethod: .manual,
            platform: .iOS
        )
        // Override ID and timestamp to match legacy behavior
        clipKitItem.id = id
        clipKitItem.createdAt = timestamp
        self.item = clipKitItem
    }

    // Access underlying ClipKit item for storage operations
    var clipKitItem: ClipKitItemModel {
        item
    }
}

// Extension to convert arrays
extension Array where Element == ClipKitItemModel {
    func toSnippets() -> [Snippet] {
        map { Snippet(item: $0) }
    }
}

extension Array where Element == Snippet {
    func toClipKitItems() -> [ClipKitItemModel] {
        map { $0.clipKitItem }
    }
}
