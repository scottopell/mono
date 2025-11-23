//
//  ClipKitMigration.swift
//  SnippetManager
//
//  Migrates existing UserDefaults snippets to ClipKitCore
//

import Foundation
import ClipKitCore

/// Handles migration from UserDefaults-based storage to ClipKitCore
class ClipKitMigration {

    private let appGroupID: String
    private static let backupSuffix = "_backup_legacy"
    private static let migrationCompletedKey = "clipkit_migration_completed"

    init(appGroupID: String) {
        self.appGroupID = appGroupID
    }

    /// Check if migration has already been completed
    func isMigrationCompleted() -> Bool {
        guard let defaults = UserDefaults(suiteName: appGroupID) else {
            return false
        }
        return defaults.bool(forKey: Self.migrationCompletedKey)
    }

    /// Perform migration from old UserDefaults format to ClipKitCore
    func migrate(completion: @escaping (Bool, Int) -> Void) {
        // Skip if already migrated
        if isMigrationCompleted() {
            print("Migration already completed, skipping")
            completion(true, 0)
            return
        }

        guard let defaults = UserDefaults(suiteName: appGroupID) else {
            print("Failed to access UserDefaults with app group: \(appGroupID)")
            completion(false, 0)
            return
        }

        // Load old snippets
        guard let data = defaults.data(forKey: "saved_snippets") else {
            print("No existing snippets found to migrate")
            markMigrationComplete()
            completion(true, 0)
            return
        }

        do {
            let oldSnippets = try JSONDecoder().decode([LegacySnippet].self, from: data)
            print("Found \(oldSnippets.count) snippets to migrate")

            // Backup old data
            defaults.set(data, forKey: "saved_snippets" + Self.backupSuffix)
            print("Backed up old snippets data")

            // Migrate each snippet
            var migratedCount = 0
            let dispatchGroup = DispatchGroup()

            for oldSnippet in oldSnippets {
                dispatchGroup.enter()

                // Create ClipKitItemModel from legacy snippet
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

                // Save to ClipKitCore
                ClipKitStorageManager.shared.saveItem(item) { success in
                    if success {
                        migratedCount += 1
                    } else {
                        print("Failed to migrate snippet: \(oldSnippet.id)")
                    }
                    dispatchGroup.leave()
                }
            }

            // Wait for all migrations to complete
            dispatchGroup.notify(queue: .main) {
                print("Migration complete: \(migratedCount) of \(oldSnippets.count) snippets migrated")
                self.markMigrationComplete()
                completion(true, migratedCount)
            }

        } catch {
            print("Failed to decode old snippets: \(error)")
            completion(false, 0)
        }
    }

    /// Restore from backup (in case of migration failure)
    func restoreFromBackup() -> Bool {
        guard let defaults = UserDefaults(suiteName: appGroupID),
              let backupData = defaults.data(forKey: "saved_snippets" + Self.backupSuffix) else {
            print("No backup data found")
            return false
        }

        defaults.set(backupData, forKey: "saved_snippets")
        defaults.removeObject(forKey: Self.migrationCompletedKey)
        print("Restored from backup")
        return true
    }

    private func markMigrationComplete() {
        guard let defaults = UserDefaults(suiteName: appGroupID) else { return }
        defaults.set(true, forKey: Self.migrationCompletedKey)
        defaults.synchronize()
    }
}

/// Legacy snippet structure for migration
private struct LegacySnippet: Codable {
    let id: UUID
    let text: String
    let timestamp: Date
    let isTimed: Bool
    let expirationDate: Date?

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        text = try container.decode(String.self, forKey: .text)
        timestamp = try container.decode(Date.self, forKey: .timestamp)
        isTimed = try container.decodeIfPresent(Bool.self, forKey: .isTimed) ?? false
        expirationDate = try container.decodeIfPresent(Date.self, forKey: .expirationDate)
    }

    private enum CodingKeys: String, CodingKey {
        case id, text, timestamp, isTimed, expirationDate
    }
}
