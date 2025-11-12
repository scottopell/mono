# SnippetManager

A minimal iOS app for managing and inserting text snippets with custom keyboard and share extensions.

## Features

- **Main App**: View and manage saved text snippets in a simple list
- **Custom Keyboard Extension**: Access snippets from any app via custom keyboard
- **Share Extension**: Save text from other apps via the share sheet

## Project Structure

```
SnippetManager/
├── SnippetManager/          # Main app
│   ├── SnippetManagerApp.swift
│   ├── ContentView.swift
│   ├── Assets.xcassets/
│   ├── Info.plist
│   └── SnippetManager.entitlements
├── SnippetKeyboard/         # Keyboard extension
│   ├── KeyboardViewController.swift
│   ├── KeyboardView.swift
│   ├── Info.plist
│   └── SnippetKeyboard.entitlements
├── SnippetShare/            # Share extension
│   ├── ShareViewController.swift
│   ├── ShareView.swift
│   ├── Info.plist
│   └── SnippetShare.entitlements
├── Shared/                  # Shared code
│   ├── Snippet.swift
│   └── SnippetStorage.swift
└── SnippetManager.xcodeproj/
```

## Setup Instructions

### 1. Configure Bundle Identifiers

Open `project.pbxproj` or the project in Xcode and update the following:

- **Main App**: `com.yourcompany.SnippetManager`
- **Keyboard Extension**: `com.yourcompany.SnippetManager.SnippetKeyboard`
- **Share Extension**: `com.yourcompany.SnippetManager.SnippetShare`

Replace `com.yourcompany` with your actual bundle identifier prefix.

### 2. Configure App Group

The app uses App Groups to share data between the main app and extensions.

#### Update the App Group ID in code:

In `Shared/SnippetStorage.swift`, update line 12:
```swift
static let appGroupID = "group.com.yourcompany.snippetmanager"
```

Replace `group.com.yourcompany.snippetmanager` with your App Group ID.

#### Update entitlements files:

Update all three `.entitlements` files with your App Group ID:
- `SnippetManager/SnippetManager.entitlements`
- `SnippetKeyboard/SnippetKeyboard.entitlements`
- `SnippetShare/SnippetShare.entitlements`

Change:
```xml
<string>group.com.yourcompany.snippetmanager</string>
```

To your App Group ID.

### 3. Configure in Apple Developer Portal

1. Go to [Apple Developer Portal](https://developer.apple.com)
2. Navigate to **Certificates, Identifiers & Profiles**
3. Create App IDs for:
   - Main app: `com.yourcompany.SnippetManager`
   - Keyboard extension: `com.yourcompany.SnippetManager.SnippetKeyboard`
   - Share extension: `com.yourcompany.SnippetManager.SnippetShare`
4. For each App ID, enable **App Groups** capability
5. Create an App Group: `group.com.yourcompany.snippetmanager`
6. Assign the App Group to all three App IDs

### 4. Configure Code Signing

In Xcode:
1. Select the project in the navigator
2. For each target (SnippetManager, SnippetKeyboard, SnippetShare):
   - Go to **Signing & Capabilities**
   - Select your **Team**
   - Ensure **App Groups** capability is added with your group ID

### 5. Build and Run

1. Select the **SnippetManager** scheme
2. Choose your target device or simulator
3. Build and run (Cmd + R)

## Usage

### Enabling the Keyboard Extension

1. Open **Settings** on your iOS device
2. Go to **General** > **Keyboard** > **Keyboards**
3. Tap **Add New Keyboard**
4. Select **SnippetKeyboard** from the list
5. (Optional) Tap on **SnippetKeyboard** and enable **Allow Full Access** if needed

### Using the Share Extension

1. In any app with text selection (Safari, Notes, etc.)
2. Select some text
3. Tap **Share** button
4. Select **Save Snippet** from the share sheet
5. Tap **Save** to add the snippet

### Using the Keyboard

1. Open any app with text input
2. Switch to the **SnippetKeyboard** (tap the globe icon on the keyboard)
3. Scroll through your saved snippets
4. Tap a snippet to insert it at the cursor

### Managing Snippets

1. Open the SnippetManager app
2. View all saved snippets (newest first)
3. Swipe left on any snippet to delete it

## Technical Details

### Data Model

Snippets are stored as simple structs with:
- `id`: UUID (unique identifier)
- `text`: String (snippet content)
- `timestamp`: Date (creation time)

### Storage

- Uses `UserDefaults` with App Group suite name
- Data is JSON encoded/decoded
- Shared between main app and both extensions

### Minimum Requirements

- iOS 16.0 or later
- Xcode 15.0 or later
- Swift 5.0

## Limitations

This is a minimal implementation. Missing features:
- No search functionality
- No categories or tags
- No snippet editing (must delete and re-add)
- No manual add button in main app (use share extension)
- No cloud sync
- No snippet preview in keyboard (shows first 60 chars)

## Troubleshooting

### Keyboard not showing snippets

1. Verify App Group ID matches in all three places:
   - `SnippetStorage.swift`
   - All three `.entitlements` files
2. Rebuild the app and keyboard extension
3. Remove and re-add the keyboard in iOS Settings

### Share extension not appearing

1. Check that the share extension's `Info.plist` is properly configured
2. Verify the extension is included in the app bundle
3. Try sharing from a different app (some apps limit share options)

### Data not syncing between app and extensions

1. Double-check App Group ID configuration
2. Ensure all targets have the App Groups capability enabled
3. Verify the App Group is properly configured in Apple Developer Portal

## License

This is a sample project for educational purposes.
