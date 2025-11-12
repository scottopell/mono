//
//  Snippet.swift
//  SnippetManager
//
//  Shared data model for snippets
//

import Foundation

// REQ-SM-018: Store snippet metadata including type and expiration
struct Snippet: Codable, Identifiable {
    let id: UUID
    let text: String
    let timestamp: Date
    let isTimed: Bool
    let expirationDate: Date?

    init(id: UUID = UUID(), text: String, timestamp: Date = Date(), isTimed: Bool = false) {
        self.id = id
        self.text = text
        self.timestamp = timestamp
        self.isTimed = isTimed
        // REQ-SM-018: Timed snippets expire 7 days after creation
        self.expirationDate = isTimed ? timestamp.addingTimeInterval(7 * 24 * 60 * 60) : nil
    }

    // Custom decoding to support backwards compatibility with existing snippets
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        text = try container.decode(String.self, forKey: .text)
        timestamp = try container.decode(Date.self, forKey: .timestamp)
        // Default to regular snippet if fields don't exist (backwards compatibility)
        isTimed = try container.decodeIfPresent(Bool.self, forKey: .isTimed) ?? false
        expirationDate = try container.decodeIfPresent(Date.self, forKey: .expirationDate)
    }

    private enum CodingKeys: String, CodingKey {
        case id, text, timestamp, isTimed, expirationDate
    }
}
