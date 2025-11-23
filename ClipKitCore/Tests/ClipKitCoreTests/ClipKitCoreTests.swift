//
//  ClipKitCoreTests.swift
//  ClipKitCoreTests
//
//  Basic tests for ClipKitCore functionality
//

import XCTest
@testable import ClipKitCore

final class ClipKitCoreTests: XCTestCase {

    override func setUp() {
        super.setUp()
        // Clear all data before each test
        ClipKitStorageManager.shared.clearAllData()
    }

    // MARK: - Model Creation Tests

    func testCreateSnippet() {
        let snippet = ClipKitItemModel.snippet(
            text: "Hello, World!",
            isTimed: false,
            tags: ["test"],
            saveMethod: .manual,
            platform: .iOS
        )

        XCTAssertEqual(snippet.itemType, .snippet)
        XCTAssertEqual(snippet.lifetimeType, .permanent)
        XCTAssertNil(snippet.expirationDate)
        XCTAssertEqual(snippet.tags, ["test"])
        XCTAssertEqual(snippet.textRepresentation, "Hello, World!")
    }

    func testCreateTimedSnippet() {
        let snippet = ClipKitItemModel.snippet(
            text: "Temporary note",
            isTimed: true,
            saveMethod: .manual,
            platform: .iOS
        )

        XCTAssertEqual(snippet.lifetimeType, .timed)
        XCTAssertNotNil(snippet.expirationDate)
        XCTAssertFalse(snippet.isExpired)
    }

    func testCreateClipboardHistory() {
        let content = ClipKitContentModel(
            data: "Test".data(using: .utf8)!,
            formats: [ClipKitFormatModel(uti: "public.plain-text")],
            textPreview: "Test"
        )

        let sourceApp = ClipKitSourceAppModel(
            bundleIdentifier: "com.test.app",
            applicationName: "TestApp"
        )

        let item = ClipKitItemModel.clipboardHistory(
            contents: [content],
            sourceApp: sourceApp,
            platform: .macOS
        )

        XCTAssertEqual(item.itemType, .clipboardHistory)
        XCTAssertEqual(item.saveMethod, .automatic)
        XCTAssertEqual(item.sourceApplication?.bundleIdentifier, "com.test.app")
    }

    // MARK: - Lifecycle Tests

    func testItemIsActive() {
        var snippet = ClipKitItemModel.snippet(text: "Test", isTimed: false)
        XCTAssertTrue(snippet.isActive)

        snippet.isDeleted = true
        XCTAssertFalse(snippet.isActive)
    }

    func testPinnedItemNeverExpires() {
        var snippet = ClipKitItemModel.snippet(text: "Test", isTimed: true)
        snippet.expirationDate = Date().addingTimeInterval(-100) // Expired
        snippet.isPinned = true

        XCTAssertTrue(snippet.isExpired)
        XCTAssertTrue(snippet.isActive) // But still active because pinned
    }

    // MARK: - Date Formatting Tests

    func testRelativeDateFormatting() {
        let twoHoursAgo = Date().addingTimeInterval(-2 * 60 * 60)
        let relative = DateFormatting.relativeString(from: twoHoursAgo)
        XCTAssertTrue(relative.contains("hrs ago") || relative.contains("hr ago"))
    }

    func testExpirationFormatting() {
        let future = Date().addingTimeInterval(3 * 24 * 60 * 60) // 3 days
        let expiration = DateFormatting.expirationString(from: future)
        XCTAssertTrue(expiration.contains("Expires in"))
    }

    func testCompactDaysRemaining() {
        let future = Date().addingTimeInterval(5 * 24 * 60 * 60) // 5 days
        let compact = DateFormatting.compactDaysRemaining(until: future)
        XCTAssertEqual(compact, "5d left")
    }

    // MARK: - Text Processing Tests

    func testTextPreview() {
        let longText = String(repeating: "a", count: 200)
        let preview = TextProcessing.preview(of: longText, maxLength: 50)
        XCTAssertEqual(preview.count, 53) // 50 + "..."
        XCTAssertTrue(preview.hasSuffix("..."))
    }

    func testFirstLine() {
        let multiline = "First line\nSecond line\nThird line"
        let first = TextProcessing.firstLine(of: multiline)
        XCTAssertEqual(first, "First line")
    }

    func testIsLikelyCode() {
        let code = "function test() { return true; }"
        XCTAssertTrue(TextProcessing.isLikelyCode(code))

        let notCode = "This is just regular text."
        XCTAssertFalse(TextProcessing.isLikelyCode(notCode))
    }

    func testIsURL() {
        XCTAssertTrue(TextProcessing.isURL("https://example.com"))
        XCTAssertFalse(TextProcessing.isURL("Not a URL"))
    }

    // MARK: - Storage Tests (Integration)

    func testSaveAndLoadSnippet() {
        let expectation = XCTestExpectation(description: "Save and load snippet")

        let snippet = ClipKitItemModel.snippet(
            text: "Integration test",
            isTimed: false
        )

        ClipKitStorageManager.shared.saveItem(snippet) { success in
            XCTAssertTrue(success)

            ClipKitStorageManager.shared.loadActiveItems { items in
                XCTAssertEqual(items.count, 1)
                XCTAssertEqual(items.first?.textRepresentation, "Integration test")
                expectation.fulfill()
            }
        }

        wait(for: [expectation], timeout: 5.0)
    }

    func testSearchItems() {
        let expectation = XCTestExpectation(description: "Search items")

        let snippet1 = ClipKitItemModel.snippet(text: "Hello World", isTimed: false)
        let snippet2 = ClipKitItemModel.snippet(text: "Goodbye Moon", isTimed: false)

        ClipKitStorageManager.shared.saveItem(snippet1) { _ in
            ClipKitStorageManager.shared.saveItem(snippet2) { _ in
                ClipKitStorageManager.shared.searchItems(query: "World") { results in
                    XCTAssertEqual(results.count, 1)
                    XCTAssertEqual(results.first?.textRepresentation, "Hello World")
                    expectation.fulfill()
                }
            }
        }

        wait(for: [expectation], timeout: 5.0)
    }

    func testFilterByItemType() {
        let expectation = XCTestExpectation(description: "Filter by type")

        let snippet = ClipKitItemModel.snippet(text: "Snippet", isTimed: false)
        let content = ClipKitContentModel(
            data: "History".data(using: .utf8)!,
            formats: [ClipKitFormatModel(uti: "public.plain-text")],
            textPreview: "History"
        )
        let history = ClipKitItemModel.clipboardHistory(contents: [content])

        ClipKitStorageManager.shared.saveItem(snippet) { _ in
            ClipKitStorageManager.shared.saveItem(history) { _ in
                ClipKitStorageManager.shared.loadItems(itemType: .snippet) { snippets in
                    XCTAssertEqual(snippets.count, 1)
                    XCTAssertEqual(snippets.first?.itemType, .snippet)
                    expectation.fulfill()
                }
            }
        }

        wait(for: [expectation], timeout: 5.0)
    }

    // MARK: - Platform Tests

    func testCurrentPlatform() {
        #if os(iOS)
        XCTAssertEqual(ClipKitCore.currentPlatform, .iOS)
        #elseif os(macOS)
        XCTAssertEqual(ClipKitCore.currentPlatform, .macOS)
        #endif
    }
}
