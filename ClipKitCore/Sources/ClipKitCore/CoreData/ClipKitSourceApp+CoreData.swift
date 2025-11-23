//
//  ClipKitSourceApp+CoreData.swift
//  ClipKitCore
//
//  Core Data managed object for ClipKitSourceApp
//

import Foundation
import CoreData

@objc(ClipKitSourceApp)
public class ClipKitSourceApp: NSManagedObject {
    @NSManaged public var bundleIdentifier: String?
    @NSManaged public var applicationName: String?
    @NSManaged public var applicationIconData: Data?

    @NSManaged public var items: NSSet?

    // MARK: - Fetch Request

    @nonobjc public class func fetchRequest() -> NSFetchRequest<ClipKitSourceApp> {
        return NSFetchRequest<ClipKitSourceApp>(entityName: "ClipKitSourceApp")
    }

    // MARK: - Convenience Accessors

    public var itemsArray: [ClipKitItem] {
        let set = items as? Set<ClipKitItem> ?? []
        return Array(set)
    }

    // MARK: - Generated Accessors for Items

    @objc(addItemsObject:)
    @NSManaged public func addToItems(_ value: ClipKitItem)

    @objc(removeItemsObject:)
    @NSManaged public func removeFromItems(_ value: ClipKitItem)

    @objc(addItems:)
    @NSManaged public func addToItems(_ values: NSSet)

    @objc(removeItems:)
    @NSManaged public func removeFromItems(_ values: NSSet)
}

extension ClipKitSourceApp: Identifiable {}
