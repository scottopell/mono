//
//  ClipKitEnums.swift
//  ClipKitCore
//
//  Defines the core enumerations used throughout ClipKit
//

import Foundation

/// Defines whether an item is explicit snippet or automatic clipboard history
public enum ItemType: String, Codable, CaseIterable {
    /// Explicitly saved snippet (SnippetManager paradigm)
    case snippet

    /// Automatically captured clipboard history (sPaperClip paradigm)
    case clipboardHistory
}

/// Defines the lifetime behavior of an item
public enum LifetimeType: String, Codable, CaseIterable {
    /// Never expires (permanent storage)
    case permanent

    /// Expires after N days (configurable, default 7)
    case timed

    /// Expires when app quits or after current session
    case session
}

/// Defines how the item was saved
public enum SaveMethod: String, Codable, CaseIterable {
    /// Explicitly saved via share extension (iOS)
    case shareExtension

    /// Automatically captured from clipboard
    case automatic

    /// Saved directly from keyboard extension (iOS)
    case keyboard

    /// Manually created in main app
    case manual

    /// Imported from backup/export
    case imported
}

/// Defines which platform the item originated from
public enum Platform: String, Codable, CaseIterable {
    case iOS
    case macOS

    /// Item synced across devices (future use)
    case shared
}

/// Defines content type categories
public enum ContentCategory: String, Codable, CaseIterable {
    case plainText = "text/plain"
    case richText = "text/rtf"
    case html = "text/html"
    case image = "image/*"
    case pdf = "application/pdf"
    case url = "text/url"
    case code = "text/code"
    case other = "application/octet-stream"

    /// Infer category from UTI
    public static func from(uti: String) -> ContentCategory {
        switch uti {
        case "public.plain-text", "public.utf8-plain-text":
            return .plainText
        case "public.rtf", "com.apple.rtf":
            return .richText
        case "public.html", "public.xhtml":
            return .html
        case "public.url":
            return .url
        case let x where x.hasPrefix("public.image") || x.hasPrefix("public.jpeg") || x.hasPrefix("public.png"):
            return .image
        case "com.adobe.pdf":
            return .pdf
        case let x where x.contains("source-code"):
            return .code
        default:
            return .other
        }
    }
}
