#!/usr/bin/env bash
# Windows-only: node-canvas (editly's transitive dep via fabric) needs GTK/Cairo
# native libraries that have no prebuilt Windows binary. See the "Windows
# native-dependency setup" note in docs/superpowers/plans/2026-07-23-real-estate-video-generator-plan.md
# (Post-plan notes) for the one-time C:\GTK + vcpkg + pkg-config machine setup
# this script assumes is already done.
#
# Run this after any `npm install` or `npm rebuild canvas` on Windows --
# npm wipes node_modules/canvas/build, which drops the runtime DLLs canvas.node
# needs. Windows resolves a native module's DLL dependencies from its own
# directory before PATH, so copying them there is more reliable than relying
# on an ambient PATH entry (which fresh shells/subprocesses may not inherit).
set -e
VCPKG_BIN="/c/vcpkg/installed/x64-windows/bin"
RELEASE_DIR="node_modules/canvas/build/Release"

if [ ! -d "$RELEASE_DIR" ]; then
  echo "canvas not built yet -- run 'npm rebuild canvas' first" >&2
  exit 1
fi
if [ ! -d "$VCPKG_BIN" ]; then
  echo "vcpkg install not found at $VCPKG_BIN -- see plan's Post-plan notes for setup" >&2
  exit 1
fi

cp "$VCPKG_BIN"/*.dll "$RELEASE_DIR/"
echo "Copied $(ls "$VCPKG_BIN"/*.dll | wc -l) runtime DLLs into $RELEASE_DIR"
