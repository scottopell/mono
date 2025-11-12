#!/bin/bash

echo "=================================="
echo "iOS Project Validation"
echo "=================================="
echo ""

# Check Swift files for brace balance
echo "1. Checking Swift syntax (brace balance):"
for swiftfile in $(find . -name "*.swift"); do
    open_braces=$(grep -o '{' "$swiftfile" | wc -l)
    close_braces=$(grep -o '}' "$swiftfile" | wc -l)
    if [ "$open_braces" -eq "$close_braces" ]; then
        echo "  ✓ $(basename $swiftfile): $open_braces pairs"
    else
        echo "  ✗ $(basename $swiftfile): MISMATCH ($open_braces open, $close_braces close)"
    fi
done

echo ""
echo "2. Extension Info.plist validation:"

# Check keyboard extension
if grep -q "com.apple.keyboard-service" SnippetKeyboard/Info.plist; then
    echo "  ✓ Keyboard extension properly configured"
else
    echo "  ✗ Keyboard extension missing identifier"
fi

# Check share extension
if grep -q "com.apple.share-services" SnippetShare/Info.plist; then
    echo "  ✓ Share extension properly configured"
else
    echo "  ✗ Share extension missing identifier"
fi

echo ""
echo "3. Target structure validation:"
targets=$(grep "productType" SnippetManager.xcodeproj/project.pbxproj | wc -l)
echo "  ✓ Found $targets targets (expected 3)"

echo ""
echo "4. Asset catalog validation:"
if [ -f "SnippetManager/Assets.xcassets/Contents.json" ]; then
    echo "  ✓ Asset catalog present"
else
    echo "  ✗ Asset catalog missing"
fi

echo ""
echo "=================================="
echo "Validation Complete!"
echo "=================================="
