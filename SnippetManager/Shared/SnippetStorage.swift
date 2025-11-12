//
//  SnippetStorage.swift
//  SnippetManager
//
//  Manages snippet storage using App Groups
//

import Foundation

class SnippetStorage {
    // IMPORTANT: Replace this with your actual App Group ID
    // Format: group.com.yourcompany.snippetmanager
    static let appGroupID = "group.com.yourcompany.snippetmanager"
    private static let snippetsKey = "saved_snippets"

    private let userDefaults: UserDefaults?

    init() {
        self.userDefaults = UserDefaults(suiteName: SnippetStorage.appGroupID)
    }

    // Save a new snippet
    func saveSnippet(_ snippet: Snippet) {
        var snippets = loadSnippets()
        snippets.insert(snippet, at: 0) // Add to beginning (newest first)
        saveSnippets(snippets)
    }

    // Load all snippets
    // REQ-SM-005: Filter out expired timed snippets
    func loadSnippets() -> [Snippet] {
        guard let userDefaults = userDefaults,
              let data = userDefaults.data(forKey: SnippetStorage.snippetsKey) else {
            return []
        }

        do {
            let snippets = try JSONDecoder().decode([Snippet].self, from: data)
            // Filter out expired timed snippets
            let now = Date()
            return snippets.filter { snippet in
                // Keep regular snippets (not timed)
                if !snippet.isTimed {
                    return true
                }
                // Keep timed snippets that haven't expired yet
                if let expirationDate = snippet.expirationDate {
                    return expirationDate > now
                }
                // If it's timed but has no expiration date (shouldn't happen), keep it
                return true
            }
        } catch {
            print("Error decoding snippets: \(error)")
            return []
        }
    }

    // Save snippets array
    private func saveSnippets(_ snippets: [Snippet]) {
        guard let userDefaults = userDefaults else { return }

        do {
            let data = try JSONEncoder().encode(snippets)
            userDefaults.set(data, forKey: SnippetStorage.snippetsKey)
        } catch {
            print("Error encoding snippets: \(error)")
        }
    }

    // Delete a snippet
    func deleteSnippet(_ snippet: Snippet) {
        var snippets = loadSnippets()
        snippets.removeAll { $0.id == snippet.id }
        saveSnippets(snippets)
    }
}
