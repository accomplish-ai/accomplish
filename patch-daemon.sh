#!/usr/bin/env bash
# patch-daemon.sh — Patches the installed Accomplish daemon to fix
# the null-in-enabled_providers bug until PR #971 is merged into a release.
#
# The bug: auto-model-routing has no PROVIDER_ID_TO_OPENCODE mapping,
# producing undefined → null in opencode.json → OpenCode CLI rejects config.
# Fix: add .filter(id => id !== void 0) after the mapping step.
#
# Usage: run this script after any Accomplish auto-update.
#   bash ~/programming/github/fun/accomplish/patch-daemon.sh

set -euo pipefail

APP="/Applications/Accomplish.app"
DAEMON="$APP/Contents/Resources/daemon/index.js"
BROKEN_LINE='.filter((id) => id !== "accomplish-ai").map((id) => PROVIDER_ID_TO_OPENCODE[id]);'
FIXED_LINE='.filter((id) => id !== "accomplish-ai").map((id) => PROVIDER_ID_TO_OPENCODE[id]).filter((id) => id !== void 0);'

echo "🔍 Checking for daemon bundle…"
if [[ ! -f "$DAEMON" ]]; then
  echo "❌ Not found: $DAEMON"
  echo "   Is Accomplish installed at $APP ?"
  exit 1
fi

echo "🔍 Checking if already patched…"
if grep -qF '.filter((id) => id !== void 0)' "$DAEMON"; then
  echo "✅ Already patched. Nothing to do."
  exit 0
fi

echo "🔍 Checking if the vulnerable pattern exists…"
if ! grep -qF "$BROKEN_LINE" "$DAEMON"; then
  echo "⚠️  Vulnerable pattern not found — the upstream fix may already be merged."
  echo "   If you just updated, you might not need this patch anymore."
  exit 0
fi

echo "🔧 Applying patch…"
sed -i '' "s|${BROKEN_LINE}|${FIXED_LINE}|g" "$DAEMON"

echo "🔍 Verifying patch…"
if grep -qF '.filter((id) => id !== void 0)' "$DAEMON"; then
  echo "✅ Patch applied successfully."
else
  echo "❌ Patch verification failed — the sed replacement may not have matched."
  exit 1
fi

# Kill any stale daemon so it picks up the patched code
echo "🔄 Restarting daemon…"
DAEMON_PID="$HOME/Library/Application Support/Accomplish/daemon.pid"
if [[ -f "$DAEMON_PID" ]]; then
  kill "$(cat "$DAEMON_PID")" 2>/dev/null || true
  rm -f "$DAEMON_PID"
  rm -f "$HOME/Library/Application Support/Accomplish/daemon.sock"
  echo "✅ Stale daemon killed."
else
  echo "ℹ️  No stale daemon found (app may not be running)."
fi

echo ""
echo "✨ Done! The fix will take effect the next time you launch Accomplish."
echo "   To verify, start a task and check the daemon log for the absence of:"
echo "   'Invalid input: expected string, received null enabled_providers'"
