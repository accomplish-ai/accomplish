#!/usr/bin/env bash
set -e

# Usage: ./scripts/generate-windows-manifest.sh <path-to-exe>
# Generates latest-windows.yml manifest file in the same directory as the exe

EXE_PATH="${1:-}"

if [[ -z "$EXE_PATH" ]]; then
  echo "Usage: $0 <path-to-exe>"
  echo "Example: $0 ./release/Openwork-0.3.5-win-x64.exe"
  exit 1
fi

if [[ ! -f "$EXE_PATH" ]]; then
  echo "Error: File not found: $EXE_PATH"
  exit 1
fi

# Extract version from filename (expects format: Openwork-X.X.X-win-x64.exe)
EXE_FILENAME=$(basename "$EXE_PATH")
VERSION=$(echo "$EXE_FILENAME" | sed -n 's/Openwork-\(.*\)-win-x64\.exe/\1/p')

if [[ -z "$VERSION" ]]; then
  echo "Error: Could not extract version from filename: $EXE_FILENAME"
  echo "Expected format: Openwork-X.X.X-win-x64.exe"
  exit 1
fi

# Calculate SHA512 and size (works on both Linux and macOS)
EXE_SIZE=$(stat -c%s "$EXE_PATH" 2>/dev/null || stat -f%z "$EXE_PATH")
EXE_SHA512=$(sha512sum "$EXE_PATH" 2>/dev/null | cut -d' ' -f1 || shasum -a 512 "$EXE_PATH" | cut -d' ' -f1)

# Build URL
BASE_URL="https://downloads.openwork.me/downloads/${VERSION}/windows"

# Output directory (same as exe)
OUTPUT_DIR=$(dirname "$EXE_PATH")
MANIFEST_PATH="${OUTPUT_DIR}/latest-windows.yml"

# Generate manifest
cat > "$MANIFEST_PATH" << EOF
version: ${VERSION}
files:
  - url: ${BASE_URL}/${EXE_FILENAME}
    sha512: ${EXE_SHA512}
    size: ${EXE_SIZE}
path: ${BASE_URL}/${EXE_FILENAME}
sha512: ${EXE_SHA512}
releaseDate: '$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")'
EOF

echo "Generated: $MANIFEST_PATH"
echo ""
cat "$MANIFEST_PATH"
