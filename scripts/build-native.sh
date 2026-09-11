#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p native/bin .swift-cache
xcrun swiftc -parse-as-library -O -module-cache-path .swift-cache -target arm64-apple-macosx26.0 native/CoachBridge.swift -o native/bin/CoachBridge
codesign --force --sign - native/bin/CoachBridge
printf 'Mac-bryggan byggd: native/bin/CoachBridge\n'
