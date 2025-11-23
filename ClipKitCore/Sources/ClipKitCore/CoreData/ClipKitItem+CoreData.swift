//
//  ClipKitItem+CoreData.swift
//  ClipKitCore
//
//  Core Data managed object for ClipKitItem
//

import Foundation
import CoreData

@objc(ClipKitItem)
public class ClipKitItem: NSManagedObject {
    @NSManaged public var id: UUID
    @NSManaged public var createdAt: Date
    @NSManaged public var modifiedAt: Date?

    @NSManaged public var itemType: String
    @NSManaged public var lifetimeType: String
    @NSManaged public var saveMethod: String
    @NSManaged public var platform: String?

    @NSManaged public var expirationDate: Date?
    @NSManaged public var isPinned: Bool
    @NSManaged public var isDeleted: Bool

    @NSManaged public var tags: [String]?
    @NSManaged public var notes: String?

    @NSManaged public var contents: NSSet?
    @NSManaged public var sourceApplication: ClipKitSourceApp?

    // MARK: - Fetch Request

    @nonobjc public class func fetchRequest() -> NSFetchRequest<ClipKitItem> {
        return NSFetchRequest<ClipKitItem>(entityName: "ClipKitItem")
    }

    // MARK: - Convenience Accessors

    public var contentsArray: [ClipKitContent] {
        let set = contents as? Set<ClipKitContent> ?? []
        return Array(set)
    }

    public var itemTypeEnum: ItemType? {
        ItemType(rawValue: itemType)
    }

    public var lifetimeTypeEnum: LifetimeType? {
        LifetimeType(rawValue: lifetimeType)
    }

    public var saveMethodEnum: SaveMethod? {
        SaveMethod(rawValue: saveMethod)
    }

    public var platformEnum: Platform? {
        guard let platform = platform else { return nil }
        return Platform(rawValue: platform)
    }

    // MARK: - Lifecycle Checks

    public var isExpired: Bool {
        guard let expiration = expirationDate else { return false }
        return Date() > expiration
    }

    public var isActive: Bool {
        if isDeleted { return false }
        if isPinned { return true }
        return !isExpired
    }

    // MARK: - Generated Accessors for Contents

    @objc(addContentsObject:)
    @NSManaged public func addToContents(_ value: ClipKitContent)

    @objc(removeContentsObject:)
    @NSManaged public func removeFromContents(_ value: ClipKitContent)

    @objc(addContents:)
    @NSManaged public func addToContents(_ values: NSSet)

    @objc(removeContents:)
    @NSManaged public func removeFromContents(_ values: NSSet)
}

extension ClipKitItem: Identifiable {}
