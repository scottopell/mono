//
//  ClipKitModels.swift
//  ClipKitCore
//
//  Non-CoreData model structs for convenience and type safety
//

import Foundation

#if canImport(AppKit)
import AppKit
public typealias PlatformImage = NSImage
#elseif canImport(UIKit)
import UIKit
public typealias PlatformImage = UIImage
#endif

// MARK: - Format

/// Represents a clipboard data format with its associated UTI
public struct ClipKitFormatModel: Identifiable, Hashable, Codable {
    public let id: UUID
    public let uti: String
    public let typeName: String?

    public init(id: UUID = UUID(), uti: String, typeName: String? = nil) {
        self.id = id
        self.uti = uti
        self.typeName = typeName ?? Self.humanReadableName(for: uti)
    }

    /// Provides a human-readable name for the format based on its UTI
    public static func humanReadableName(for uti: String) -> String {
        switch uti {
        case "public.plain-text", "public.utf8-plain-text":
            return "Plain Text"
        case "public.rtf", "com.apple.rtf":
            return "Rich Text"
        case "public.html":
            return "HTML"
        case "public.url":
            return "URL"
        case "com.adobe.pdf":
            return "PDF"
        case let x where x.hasPrefix("public.image"):
            return "Image"
        case let x where x.hasPrefix("public.jpeg"):
            return "JPEG Image"
        case let x where x.hasPrefix("public.png"):
            return "PNG Image"
        default:
            return uti.split(separator: ".").last.map(String.init) ?? "Unknown"
        }
    }
}

// MARK: - Content

/// Represents a single piece of data with its available formats
public struct ClipKitContentModel: Identifiable, Hashable, Codable {
    public let id: UUID
    public let data: Data
    public let formats: [ClipKitFormatModel]
    public let textPreview: String?
    public let contentType: String
    public let byteSize: Int64

    public init(
        id: UUID = UUID(),
        data: Data,
        formats: [ClipKitFormatModel],
        textPreview: String? = nil,
        contentType: String = "text/plain"
    ) {
        self.id = id
        self.data = data
        self.formats = formats
        self.textPreview = textPreview
        self.contentType = contentType
        self.byteSize = Int64(data.count)
    }

    /// Attempts to get a text representation of the content
    public func getTextRepresentation() -> String? {
        if let preview = textPreview {
            return preview
        }

        // Try to decode as UTF-8 string
        if let text = String(data: data, encoding: .utf8) {
            return text
        }

        return nil
    }

    /// Get content category
    public var category: ContentCategory {
        ContentCategory.from(uti: formats.first?.uti ?? "")
    }
}

// MARK: - Source Application

/// Holds information about the application that was the source of an item
public struct ClipKitSourceAppModel: Identifiable, Hashable, Codable {
    public let id: UUID
    public let bundleIdentifier: String?
    public let applicationName: String?

    public init(
        id: UUID = UUID(),
        bundleIdentifier: String? = nil,
        applicationName: String? = nil
    ) {
        self.id = id
        self.bundleIdentifier = bundleIdentifier
        self.applicationName = applicationName
    }

    #if canImport(AppKit)
    /// Retrieve the application icon (macOS only)
    public var applicationIcon: NSImage? {
        guard let bundleId = bundleIdentifier,
              let appBundle = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleId),
              let bundle = Bundle(url: appBundle) else {
            return nil
        }
        return NSWorkspace.shared.icon(forFile: bundle.bundlePath)
    }
    #endif

    // Custom Codable to exclude applicationIcon from encoding
    enum CodingKeys: String, CodingKey {
        case id, bundleIdentifier, applicationName
    }
}

// MARK: - Main Item

/// Represents a ClipKit item - either a clipboard history entry or an explicit snippet
public struct ClipKitItemModel: Identifiable, Hashable, Codable {
    // Identity
    public let id: UUID
    public let createdAt: Date
    public var modifiedAt: Date?

    // Classification
    public var itemType: ItemType
    public var lifetimeType: LifetimeType
    public var saveMethod: SaveMethod
    public var platform: Platform?

    // Lifecycle
    public var expirationDate: Date?
    public var isPinned: Bool
    public var isDeleted: Bool

    // Organization
    public var tags: [String]
    public var notes: String?

    // Content
    public var contents: [ClipKitContentModel]
    public var sourceApplication: ClipKitSourceAppModel?

    public init(
        id: UUID = UUID(),
        createdAt: Date = Date(),
        modifiedAt: Date? = nil,
        itemType: ItemType = .clipboardHistory,
        lifetimeType: LifetimeType = .permanent,
        saveMethod: SaveMethod = .automatic,
        platform: Platform? = nil,
        expirationDate: Date? = nil,
        isPinned: Bool = false,
        isDeleted: Bool = false,
        tags: [String] = [],
        notes: String? = nil,
        contents: [ClipKitContentModel],
        sourceApplication: ClipKitSourceAppModel? = nil
    ) {
        self.id = id
        self.createdAt = createdAt
        self.modifiedAt = modifiedAt
        self.itemType = itemType
        self.lifetimeType = lifetimeType
        self.saveMethod = saveMethod
        self.platform = platform
        self.expirationDate = expirationDate
        self.isPinned = isPinned
        self.isDeleted = isDeleted
        self.tags = tags
        self.notes = notes
        self.contents = contents
        self.sourceApplication = sourceApplication
    }

    // MARK: - Convenience Properties

    /// Whether this item is expired
    public var isExpired: Bool {
        guard let expiration = expirationDate else { return false }
        return Date() > expiration
    }

    /// Whether this item should be displayed (not deleted, not expired unless pinned)
    public var isActive: Bool {
        if isDeleted { return false }
        if isPinned { return true }
        return !isExpired
    }

    /// Primary text representation for display
    public var textRepresentation: String? {
        for content in contents {
            if let text = content.getTextRepresentation() {
                return text
            }
        }
        return nil
    }

    /// Create a snippet-style item (SnippetManager paradigm)
    public static func snippet(
        text: String,
        isTimed: Bool = false,
        tags: [String] = [],
        saveMethod: SaveMethod = .shareExtension,
        platform: Platform? = nil
    ) -> ClipKitItemModel {
        let content = ClipKitContentModel(
            data: text.data(using: .utf8) ?? Data(),
            formats: [ClipKitFormatModel(uti: "public.plain-text")],
            textPreview: text,
            contentType: "text/plain"
        )

        let lifetimeType: LifetimeType = isTimed ? .timed : .permanent
        let expirationDate: Date? = isTimed ? Calendar.current.date(byAdding: .day, value: 7, to: Date()) : nil

        return ClipKitItemModel(
            itemType: .snippet,
            lifetimeType: lifetimeType,
            saveMethod: saveMethod,
            platform: platform,
            expirationDate: expirationDate,
            tags: tags,
            contents: [content]
        )
    }

    /// Create a clipboard history item (sPaperClip paradigm)
    public static func clipboardHistory(
        contents: [ClipKitContentModel],
        sourceApp: ClipKitSourceAppModel? = nil,
        platform: Platform? = nil
    ) -> ClipKitItemModel {
        return ClipKitItemModel(
            itemType: .clipboardHistory,
            lifetimeType: .permanent,
            saveMethod: .automatic,
            platform: platform,
            contents: contents,
            sourceApplication: sourceApp
        )
    }
}
