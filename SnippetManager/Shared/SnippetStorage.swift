//
//  SnippetStorage.swift
//  SnippetManager
//
//  Manages snippet storage using ClipKitCore
//

import Foundation
import ClipKitCore

class SnippetStorage {
    // IMPORTANT: Replace this with your actual App Group ID
    // Format: group.com.yourcompany.snippetmanager
    static let appGroupID = "group.com.yourcompany.snippetmanager"

    private static var isConfigured = false

    init() {
        Self.configureIfNeeded()
    }

    private static func configureIfNeeded() {
        guard !isConfigured else { return }
        ClipKitStorageManager.shared.configureAppGroup(appGroupID)
        isConfigured = true
    }

    // Save a new snippet
    func saveSnippet(_ snippet: Snippet) {
        ClipKitStorageManager.shared.saveItem(snippet.clipKitItem) { success in
            if !success {
                print("Failed to save snippet: \(snippet.id)")
            }
        }
    }

    // Load all snippets
    // REQ-SM-005: Filter out expired timed snippets (handled by ClipKitCore)
    func loadSnippets() -> [Snippet] {
        // Synchronous wrapper for backwards compatibility
        var result: [Snippet] = []
        let semaphore = DispatchSemaphore(value: 0)

        ClipKitStorageManager.shared.loadItems(itemType: .snippet) { items in
            result = items.toSnippets()
            semaphore.signal()
        }

        _ = semaphore.wait(timeout: .now() + 5.0)
        return result
    }

    // Load snippets asynchronously (recommended)
    func loadSnippets(completion: @escaping ([Snippet]) -> Void) {
        ClipKitStorageManager.shared.loadItems(itemType: .snippet) { items in
            completion(items.toSnippets())
        }
    }

    // Delete a snippet
    func deleteSnippet(_ snippet: Snippet) {
        ClipKitStorageManager.shared.deleteItem(snippet.clipKitItem) { success in
            if !success {
                print("Failed to delete snippet: \(snippet.id)")
            }
        }
    }
}
