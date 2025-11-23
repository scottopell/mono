//
//  ClipKitContent+CoreData.swift
//  ClipKitCore
//
//  Core Data managed object for ClipKitContent
//

import Foundation
import CoreData

@objc(ClipKitContent)
public class ClipKitContent: NSManagedObject {
    @NSManaged public var data: Data
    @NSManaged public var textPreview: String?
    @NSManaged public var contentType: String
    @NSManaged public var byteSize: Int64

    @NSManaged public var formats: NSSet?
    @NSManaged public var item: ClipKitItem?

    // MARK: - Fetch Request

    @nonobjc public class func fetchRequest() -> NSFetchRequest<ClipKitContent> {
        return NSFetchRequest<ClipKitContent>(entityName: "ClipKitContent")
    }

    // MARK: - Convenience Accessors

    public var formatsArray: [ClipKitFormat] {
        let set = formats as? Set<ClipKitFormat> ?? []
        return Array(set)
    }

    /// Attempts to get a text representation of the content
    public func getTextRepresentation() -> String? {
        if let preview = textPreview {
            return preview
        }

        // Try to decode as UTF-8 string
        if let text = String(data: data, encoding: .utf8) {
            return text
        }

        return nil
    }

    // MARK: - Generated Accessors for Formats

    @objc(addFormatsObject:)
    @NSManaged public func addToFormats(_ value: ClipKitFormat)

    @objc(removeFormatsObject:)
    @NSManaged public func removeFromFormats(_ value: ClipKitFormat)

    @objc(addFormats:)
    @NSManaged public func addToFormats(_ values: NSSet)

    @objc(removeFormats:)
    @NSManaged public func removeFromFormats(_ values: NSSet)
}

extension ClipKitContent: Identifiable {}
