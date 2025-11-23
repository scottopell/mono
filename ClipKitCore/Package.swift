// swift-tools-version: 5.9
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "ClipKitCore",
    platforms: [
        .iOS(.v16),
        .macOS(.v15)
    ],
    products: [
        .library(
            name: "ClipKitCore",
            targets: ["ClipKitCore"]),
    ],
    dependencies: [
        // No external dependencies - keep it simple and portable
    ],
    targets: [
        .target(
            name: "ClipKitCore",
            dependencies: [],
            resources: [
                .process("CoreData/ClipKitDataModel.xcdatamodeld")
            ]
        ),
        .testTarget(
            name: "ClipKitCoreTests",
            dependencies: ["ClipKitCore"]
        ),
    ]
)
