//
//  ClipKitStorageManager.swift
//  ClipKitCore
//
//  High-level storage operations for ClipKit items
//  Handles conversion between model structs and Core Data entities
//

import Foundation
import CoreData
import OSLog

public class ClipKitStorageManager {
    public static let shared = ClipKitStorageManager()

    private let coreDataManager = ClipKitCoreDataManager.shared
    private let logger = Logger(subsystem: "com.clipkit.core", category: "StorageManager")

    private init() {}

    // MARK: - Configuration

    /// Configure App Group ID for iOS (must be called before first use)
    public func configureAppGroup(_ appGroupID: String) {
        coreDataManager.appGroupID = appGroupID
    }

    // MARK: - Save Operations

    /// Save a ClipKitItemModel to Core Data
    public func saveItem(_ item: ClipKitItemModel, completion: ((Bool) -> Void)? = nil) {
        coreDataManager.performBackgroundTask { context in
            self.logger.info("Saving ClipKit item to Core Data")

            // Create item entity
            let itemEntity = ClipKitItem(context: context)
            itemEntity.id = item.id
            itemEntity.createdAt = item.createdAt
            itemEntity.modifiedAt = item.modifiedAt
            itemEntity.itemType = item.itemType.rawValue
            itemEntity.lifetimeType = item.lifetimeType.rawValue
            itemEntity.saveMethod = item.saveMethod.rawValue
            itemEntity.platform = item.platform?.rawValue
            itemEntity.expirationDate = item.expirationDate
            itemEntity.isPinned = item.isPinned
            itemEntity.isDeleted = item.isDeleted
            itemEntity.tags = item.tags
            itemEntity.notes = item.notes

            // Create or find source application
            if let sourceApp = item.sourceApplication {
                let sourceAppEntity = self.findOrCreateSourceApp(
                    bundleId: sourceApp.bundleIdentifier,
                    appName: sourceApp.applicationName,
                    in: context
                )
                itemEntity.sourceApplication = sourceAppEntity
            }

            // Create content entities
            for content in item.contents {
                let contentEntity = ClipKitContent(context: context)
                contentEntity.data = content.data
                contentEntity.textPreview = content.textPreview
                contentEntity.contentType = content.contentType
                contentEntity.byteSize = content.byteSize

                // Create format entities
                for format in content.formats {
                    let formatEntity = ClipKitFormat(context: context)
                    formatEntity.uti = format.uti
                    formatEntity.typeName = format.typeName
                    contentEntity.addToFormats(formatEntity)
                }

                itemEntity.addToContents(contentEntity)
            }

            do {
                try context.save()
                self.logger.info("Item saved successfully with \(item.contents.count) content items")
                DispatchQueue.main.async {
                    completion?(true)
                }
            } catch {
                self.logger.error("Failed to save item: \(error.localizedDescription)")
                DispatchQueue.main.async {
                    completion?(false)
                }
            }
        }
    }

    // MARK: - Load Operations

    /// Load all active items (not deleted, not expired unless pinned)
    public func loadActiveItems(completion: @escaping ([ClipKitItemModel]) -> Void) {
        loadItems(filterExpired: true, includeDeleted: false, completion: completion)
    }

    /// Load all items including expired and deleted
    public func loadAllItems(completion: @escaping ([ClipKitItemModel]) -> Void) {
        loadItems(filterExpired: false, includeDeleted: true, completion: completion)
    }

    /// Load items with custom filtering
    public func loadItems(
        filterExpired: Bool = true,
        includeDeleted: Bool = false,
        itemType: ItemType? = nil,
        tags: [String]? = nil,
        completion: @escaping ([ClipKitItemModel]) -> Void
    ) {
        coreDataManager.performBackgroundTask { context in
            let fetchRequest = ClipKitItem.fetchRequest()

            // Build predicate
            var predicates: [NSPredicate] = []

            if !includeDeleted {
                predicates.append(NSPredicate(format: "isDeleted == NO"))
            }

            if filterExpired {
                predicates.append(NSPredicate(
                    format: "isPinned == YES OR expirationDate == nil OR expirationDate >= %@",
                    Date() as NSDate
                ))
            }

            if let itemType = itemType {
                predicates.append(NSPredicate(format: "itemType == %@", itemType.rawValue))
            }

            if let tags = tags, !tags.isEmpty {
                // Items that have any of the specified tags
                let tagPredicates = tags.map { NSPredicate(format: "ANY tags == %@", $0) }
                predicates.append(NSCompoundPredicate(orPredicateWithSubpredicates: tagPredicates))
            }

            if !predicates.isEmpty {
                fetchRequest.predicate = NSCompoundPredicate(andPredicateWithSubpredicates: predicates)
            }

            fetchRequest.sortDescriptors = [NSSortDescriptor(key: "createdAt", ascending: false)]

            do {
                let entities = try context.fetch(fetchRequest)
                self.logger.info("Fetched \(entities.count) items from Core Data")

                let items = entities.compactMap { self.convertToModel(from: $0) }
                self.logger.info("Converted \(items.count) items to models")

                DispatchQueue.main.async {
                    completion(items)
                }
            } catch {
                self.logger.error("Failed to fetch items: \(error.localizedDescription)")
                DispatchQueue.main.async {
                    completion([])
                }
            }
        }
    }

    /// Search items by text content
    public func searchItems(query: String, completion: @escaping ([ClipKitItemModel]) -> Void) {
        coreDataManager.performBackgroundTask { context in
            let fetchRequest = ClipKitItem.fetchRequest()
            fetchRequest.predicate = NSPredicate(
                format: "isDeleted == NO AND contents.textPreview CONTAINS[cd] %@",
                query
            )
            fetchRequest.sortDescriptors = [NSSortDescriptor(key: "createdAt", ascending: false)]

            do {
                let entities = try context.fetch(fetchRequest)
                let items = entities.compactMap { self.convertToModel(from: $0) }

                DispatchQueue.main.async {
                    completion(items)
                }
            } catch {
                self.logger.error("Search failed: \(error.localizedDescription)")
                DispatchQueue.main.async {
                    completion([])
                }
            }
        }
    }

    // MARK: - Update Operations

    /// Update an existing item
    public func updateItem(_ item: ClipKitItemModel, completion: ((Bool) -> Void)? = nil) {
        coreDataManager.performBackgroundTask { context in
            let fetchRequest = ClipKitItem.fetchRequest()
            fetchRequest.predicate = NSPredicate(format: "id == %@", item.id as CVarArg)
            fetchRequest.fetchLimit = 1

            do {
                guard let entity = try context.fetch(fetchRequest).first else {
                    self.logger.error("Item not found for update: \(item.id)")
                    DispatchQueue.main.async { completion?(false) }
                    return
                }

                // Update properties
                entity.modifiedAt = Date()
                entity.isPinned = item.isPinned
                entity.isDeleted = item.isDeleted
                entity.tags = item.tags
                entity.notes = item.notes
                entity.expirationDate = item.expirationDate

                try context.save()
                self.logger.info("Item updated successfully")
                DispatchQueue.main.async { completion?(true) }
            } catch {
                self.logger.error("Failed to update item: \(error.localizedDescription)")
                DispatchQueue.main.async { completion?(false) }
            }
        }
    }

    /// Mark item as deleted (soft delete)
    public func deleteItem(_ item: ClipKitItemModel, completion: ((Bool) -> Void)? = nil) {
        var updatedItem = item
        updatedItem.isDeleted = true
        updatedItem.modifiedAt = Date()
        updateItem(updatedItem, completion: completion)
    }

    /// Permanently delete an item
    public func permanentlyDeleteItem(_ itemId: UUID, completion: ((Bool) -> Void)? = nil) {
        coreDataManager.performBackgroundTask { context in
            let fetchRequest = ClipKitItem.fetchRequest()
            fetchRequest.predicate = NSPredicate(format: "id == %@", itemId as CVarArg)
            fetchRequest.fetchLimit = 1

            do {
                guard let entity = try context.fetch(fetchRequest).first else {
                    self.logger.error("Item not found for deletion: \(itemId)")
                    DispatchQueue.main.async { completion?(false) }
                    return
                }

                context.delete(entity)
                try context.save()
                self.logger.info("Item permanently deleted")
                DispatchQueue.main.async { completion?(true) }
            } catch {
                self.logger.error("Failed to delete item: \(error.localizedDescription)")
                DispatchQueue.main.async { completion?(false) }
            }
        }
    }

    // MARK: - Conversion Methods

    private func convertToModel(from entity: ClipKitItem) -> ClipKitItemModel? {
        guard let itemType = entity.itemTypeEnum,
              let lifetimeType = entity.lifetimeTypeEnum,
              let saveMethod = entity.saveMethodEnum else {
            logger.error("Invalid enum values in entity")
            return nil
        }

        // Convert contents
        var contents: [ClipKitContentModel] = []
        for contentEntity in entity.contentsArray {
            if let content = convertToContentModel(from: contentEntity) {
                contents.append(content)
            }
        }

        // Convert source app
        var sourceApp: ClipKitSourceAppModel?
        if let sourceAppEntity = entity.sourceApplication {
            sourceApp = ClipKitSourceAppModel(
                bundleIdentifier: sourceAppEntity.bundleIdentifier,
                applicationName: sourceAppEntity.applicationName
            )
        }

        return ClipKitItemModel(
            id: entity.id,
            createdAt: entity.createdAt,
            modifiedAt: entity.modifiedAt,
            itemType: itemType,
            lifetimeType: lifetimeType,
            saveMethod: saveMethod,
            platform: entity.platformEnum,
            expirationDate: entity.expirationDate,
            isPinned: entity.isPinned,
            isDeleted: entity.isDeleted,
            tags: entity.tags ?? [],
            notes: entity.notes,
            contents: contents,
            sourceApplication: sourceApp
        )
    }

    private func convertToContentModel(from entity: ClipKitContent) -> ClipKitContentModel? {
        // Convert formats
        var formats: [ClipKitFormatModel] = []
        for formatEntity in entity.formatsArray {
            formats.append(ClipKitFormatModel(
                uti: formatEntity.uti,
                typeName: formatEntity.typeName
            ))
        }

        return ClipKitContentModel(
            data: entity.data,
            formats: formats,
            textPreview: entity.textPreview,
            contentType: entity.contentType
        )
    }

    private func findOrCreateSourceApp(
        bundleId: String?,
        appName: String?,
        in context: NSManagedObjectContext
    ) -> ClipKitSourceApp {
        // Try to find existing
        if let bundleId = bundleId {
            let fetchRequest = ClipKitSourceApp.fetchRequest()
            fetchRequest.predicate = NSPredicate(format: "bundleIdentifier == %@", bundleId)
            fetchRequest.fetchLimit = 1

            if let existing = try? context.fetch(fetchRequest).first {
                return existing
            }
        }

        // Create new
        let sourceApp = ClipKitSourceApp(context: context)
        sourceApp.bundleIdentifier = bundleId
        sourceApp.applicationName = appName
        return sourceApp
    }

    // MARK: - Maintenance Operations

    /// Clear all data
    public func clearAllData() {
        coreDataManager.clearAllData()
    }

    /// Limit total item count
    public func limitItemCount(to maxItems: Int) {
        coreDataManager.limitItemCount(to: maxItems)
    }

    /// Delete expired items
    public func deleteExpiredItems() {
        coreDataManager.deleteExpiredItems()
    }
}
