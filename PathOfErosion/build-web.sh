#!/bin/bash
# Build script for WASM compilation and bundling

set -e

echo "🔨 Building Path of Erosion for web..."

# Check if wasm-pack is installed
if ! command -v wasm-pack &> /dev/null; then
    echo "⚠️  wasm-pack not found. Installing..."
    curl https://rustwasm.org/wasm-pack/installer/init.sh -sSf | sh
fi

echo "📦 Compiling Rust to WASM..."
wasm-pack build --target web --out-dir dist/pkg

echo "🎯 Building TypeScript..."
npx esbuild src/ui/main.ts --bundle --outfile=dist/ui.js --external:./pkg

echo "✅ Build complete!"
echo "📁 Output:"
echo "   - WASM: dist/pkg/"
echo "   - UI:   dist/ui.js"
echo ""
echo "🚀 Run index.html in a browser to play!"
