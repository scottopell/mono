//
//  ClipKitCore.swift
//  ClipKitCore
//
//  Main entry point and public exports for ClipKitCore
//

import Foundation

/// ClipKitCore - Unified clipboard and snippet management
///
/// This package provides the core data model and storage layer for ClipKit,
/// supporting both automatic clipboard history (sPaperClip paradigm) and
/// explicit snippet management (SnippetManager paradigm).
///
/// ## Key Features
/// - Unified data model supporting both clipboard history and explicit snippets
/// - Core Data persistence with cross-platform support (iOS + macOS)
/// - iOS App Group support for sharing data between main app and extensions
/// - Timed expiration for temporary items
/// - Tags and organization
/// - Search and filtering
///
/// ## Basic Usage
///
/// ```swift
/// import ClipKitCore
///
/// // Configure for iOS with App Group
/// ClipKitStorageManager.shared.configureAppGroup("group.com.yourcompany.clipkit")
///
/// // Save a snippet (SnippetManager style)
/// let snippet = ClipKitItemModel.snippet(
///     text: "Hello, World!",
///     isTimed: false,
///     tags: ["greetings"],
///     saveMethod: .shareExtension,
///     platform: .iOS
/// )
/// ClipKitStorageManager.shared.saveItem(snippet) { success in
///     print("Saved: \(success)")
/// }
///
/// // Load active items
/// ClipKitStorageManager.shared.loadActiveItems { items in
///     print("Loaded \(items.count) items")
/// }
/// ```
public struct ClipKitCore {
    /// Current version of ClipKitCore
    public static let version = "1.0.0"

    /// Platform detection
    public static var currentPlatform: Platform {
        #if os(iOS)
        return .iOS
        #elseif os(macOS)
        return .macOS
        #else
        fatalError("Unsupported platform")
        #endif
    }
}

// Re-export public types
public typealias StorageManager = ClipKitStorageManager
