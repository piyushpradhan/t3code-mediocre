#!/usr/bin/env bash
# Fork-only: pull piyushpradhan/t3code-mediocre main, build an unsigned arm64 desktop app,
# and install it to /Applications. Upstream arrives via .github/workflows/sync-upstream.yml.
# ponytail: local rebuild instead of in-app auto-update; macOS Squirrel needs a Developer ID
# signature. Add a signed release workflow if that certificate ever exists.
set -euo pipefail

cd "$(dirname "$0")/.."
git pull --ff-only origin main
vp i
# No update feed in the build, so the app never pulls pingdotgg releases over this one.
env -u GITHUB_REPOSITORY -u T3CODE_DESKTOP_UPDATE_REPOSITORY vp run dist:desktop:dmg:arm64

dmg=$(ls -t release/*.dmg | head -1)
mnt=$(mktemp -d)
hdiutil attach -nobrowse -quiet -mountpoint "$mnt" "$dmg"
trap 'hdiutil detach -quiet "$mnt"' EXIT
app=$(ls -d "$mnt"/*.app | head -1)
osascript -e "quit app \"$(basename "$app" .app)\"" 2>/dev/null || true
rm -rf "/Applications/$(basename "$app")"
ditto "$app" "/Applications/$(basename "$app")"
xattr -dr com.apple.quarantine "/Applications/$(basename "$app")" 2>/dev/null || true
echo "Installed /Applications/$(basename "$app") from $dmg"
