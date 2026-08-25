#!/usr/bin/env bash
# macOS / Linux Launcher for Tab Rotator
cd "$(dirname "$0")"

echo "========================================================"
echo "  Chrome & Edge Auto Tab Rotator"
echo "========================================================"
echo ""

if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not found in your PATH."
    exit 1
fi

node server.js "$@"
