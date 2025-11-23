//
//  ClipKitCoreDataManager.swift
//  ClipKitCore
//
//  Manages the Core Data stack for ClipKit
//  Works on both iOS and macOS
//

import Foundation
import CoreData
import OSLog

public class ClipKitCoreDataManager {
    public static let shared = ClipKitCoreDataManager()

    private let logger = Logger(subsystem: "com.clipkit.core", category: "CoreDataManager")

    // MARK: - Core Data Stack

    public lazy var persistentContainer: NSPersistentContainer = {
        let bundle = Bundle.module
        guard let modelURL = bundle.url(forResource: "ClipKitDataModel", withExtension: "momd"),
              let model = NSManagedObjectModel(contentsOf: modelURL) else {
            fatalError("Unable to load ClipKitDataModel")
        }

        let container = NSPersistentContainer(name: "ClipKitDataModel", managedObjectModel: model)

        // Configure store location
        if let storeURL = self.storeURL {
            let description = NSPersistentStoreDescription(url: storeURL)
            description.shouldMigrateStoreAutomatically = true
            description.shouldInferMappingModelAutomatically = true
            container.persistentStoreDescriptions = [description]
        }

        container.loadPersistentStores { description, error in
            if let error = error {
                self.logger.error("Core Data failed to load: \(error.localizedDescription)")
                fatalError("Core Data store failed to load: \(error)")
            }
            self.logger.info("Core Data store loaded successfully from: \(description.url?.path ?? "unknown")")
        }

        // Enable automatic merging
        container.viewContext.automaticallyMergesChangesFromParent = true
        container.viewContext.mergePolicy = NSMergeByPropertyObjectTrumpMergePolicy

        return container
    }()

    // MARK: - Platform-Specific Storage Location

    private var storeURL: URL? {
        #if os(iOS)
        // iOS: Use App Group for sharing between main app and extensions
        // This can be configured by the app
        if let appGroupID = self.appGroupID,
           let groupURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID) {
            return groupURL.appendingPathComponent("ClipKit.sqlite")
        }
        // Fallback to default location
        return FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first?
            .appendingPathComponent("ClipKit.sqlite")
        #elseif os(macOS)
        // macOS: Use Application Support
        return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
            .appendingPathComponent("ClipKit")
            .appendingPathComponent("ClipKit.sqlite")
        #else
        return nil
        #endif
    }

    // MARK: - Configuration

    /// App Group ID for iOS (optional, can be set by app)
    public var appGroupID: String?

    private init() {
        #if os(iOS)
        // iOS apps should set this before using the manager
        logger.info("ClipKit initialized for iOS - set appGroupID for extension support")
        #elseif os(macOS)
        logger.info("ClipKit initialized for macOS")
        #endif
    }

    // MARK: - Context Access

    public var viewContext: NSManagedObjectContext {
        persistentContainer.viewContext
    }

    public func newBackgroundContext() -> NSManagedObjectContext {
        persistentContainer.newBackgroundContext()
    }

    public func performBackgroundTask(_ block: @escaping (NSManagedObjectContext) -> Void) {
        persistentContainer.performBackgroundTask(block)
    }

    // MARK: - Save Operations

    public func saveContext(_ context: NSManagedObjectContext? = nil) {
        let context = context ?? viewContext

        guard context.hasChanges else { return }

        do {
            try context.save()
            logger.info("Context saved successfully")
        } catch {
            logger.error("Failed to save context: \(error.localizedDescription)")
        }
    }

    // MARK: - Batch Operations

    /// Delete all items (useful for testing or reset)
    public func clearAllData() {
        performBackgroundTask { context in
            let entities = ["ClipKitItem", "ClipKitContent", "ClipKitFormat", "ClipKitSourceApp"]

            for entityName in entities {
                let fetchRequest = NSFetchRequest<NSFetchRequestResult>(entityName: entityName)
                let deleteRequest = NSBatchDeleteRequest(fetchRequest: fetchRequest)

                do {
                    try context.execute(deleteRequest)
                    self.logger.info("Cleared all data from \(entityName)")
                } catch {
                    self.logger.error("Failed to clear \(entityName): \(error.localizedDescription)")
                }
            }

            self.saveContext(context)
        }
    }

    /// Limit total item count by deleting oldest non-pinned items
    public func limitItemCount(to maxItems: Int) {
        performBackgroundTask { context in
            let fetchRequest = ClipKitItem.fetchRequest()
            fetchRequest.predicate = NSPredicate(format: "isPinned == NO AND isDeleted == NO")
            fetchRequest.sortDescriptors = [NSSortDescriptor(key: "createdAt", ascending: true)]

            do {
                let items = try context.fetch(fetchRequest)
                let itemsToDelete = items.count - maxItems

                if itemsToDelete > 0 {
                    for i in 0..<itemsToDelete {
                        context.delete(items[i])
                    }
                    self.logger.info("Deleted \(itemsToDelete) items to maintain limit of \(maxItems)")
                    self.saveContext(context)
                }
            } catch {
                self.logger.error("Failed to limit history: \(error.localizedDescription)")
            }
        }
    }

    /// Delete expired items that are not pinned
    public func deleteExpiredItems() {
        performBackgroundTask { context in
            let fetchRequest = ClipKitItem.fetchRequest()
            fetchRequest.predicate = NSPredicate(
                format: "expirationDate < %@ AND isPinned == NO AND isDeleted == NO",
                Date() as NSDate
            )

            do {
                let expiredItems = try context.fetch(fetchRequest)
                for item in expiredItems {
                    context.delete(item)
                }
                self.logger.info("Deleted \(expiredItems.count) expired items")
                self.saveContext(context)
            } catch {
                self.logger.error("Failed to delete expired items: \(error.localizedDescription)")
            }
        }
    }
}
