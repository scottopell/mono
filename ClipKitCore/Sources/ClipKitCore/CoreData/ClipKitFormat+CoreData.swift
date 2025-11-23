//
//  ClipKitFormat+CoreData.swift
//  ClipKitCore
//
//  Core Data managed object for ClipKitFormat
//

import Foundation
import CoreData

@objc(ClipKitFormat)
public class ClipKitFormat: NSManagedObject {
    @NSManaged public var uti: String
    @NSManaged public var typeName: String?

    @NSManaged public var content: ClipKitContent?

    // MARK: - Fetch Request

    @nonobjc public class func fetchRequest() -> NSFetchRequest<ClipKitFormat> {
        return NSFetchRequest<ClipKitFormat>(entityName: "ClipKitFormat")
    }
}

extension ClipKitFormat: Identifiable {}
