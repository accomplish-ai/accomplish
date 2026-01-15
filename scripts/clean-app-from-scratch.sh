#!/bin/bash
# Clean app from scratch - safely kills processes and clears app data for fresh testing
# Usage: ./scripts/clean-app-from-scratch.sh

set -e

echo "=== Cleaning app from scratch ==="

#######################################
# Safely remove a directory if it exists
# Arguments:
#   $1 - Directory path to remove
#######################################
safe_remove_dir() {
  local dir="$1"
  # Expand ~ to actual home directory
  dir="${dir/#\~/$HOME}"

  if [ -z "$dir" ]; then
    echo "  [SKIP] Empty path provided"
    return
  fi

  if [ ! -e "$dir" ]; then
    echo "  [SKIP] Does not exist: $dir"
    return
  fi

  if [ ! -d "$dir" ]; then
    echo "  [SKIP] Not a directory: $dir"
    return
  fi

  # Safety check: don't delete system directories
  case "$dir" in
    /|/usr|/bin|/sbin|/etc|/var|/tmp|/home|/Users|"$HOME")
      echo "  [SKIP] Refusing to delete protected path: $dir"
      return
      ;;
  esac

  echo "  [DELETE] $dir"
  rm -r "$dir"
}

#######################################
# Safely kill processes matching a pattern
# Only kills if the process belongs to current user
# Arguments:
#   $1 - Process pattern to match
#######################################
safe_kill_process() {
  local pattern="$1"
  local pids

  # Find PIDs matching pattern, owned by current user
  pids=$(pgrep -u "$(whoami)" -f "$pattern" 2>/dev/null || true)

  if [ -z "$pids" ]; then
    echo "  [SKIP] No processes found: $pattern"
    return
  fi

  for pid in $pids; do
    # Double-check the process exists and belongs to us
    if kill -0 "$pid" 2>/dev/null; then
      echo "  [KILL] PID $pid ($pattern)"
      kill "$pid" 2>/dev/null || true
    fi
  done
}

#######################################
# Safely kill process on a specific port
# Only kills if it's a node/tsx process (our dev-browser)
# Arguments:
#   $1 - Port number
#######################################
safe_kill_port() {
  local port="$1"
  local pids
  local pid
  local cmd

  # Get PIDs using the port (may return multiple, newline-separated)
  pids=$(lsof -ti:"$port" 2>/dev/null || true)

  if [ -z "$pids" ]; then
    echo "  [SKIP] No process on port $port"
    return
  fi

  # Process each PID
  for pid in $pids; do
    # Get the command name for this PID
    cmd=$(ps -p "$pid" -o comm= 2>/dev/null || true)

    # Only kill if it's a node-related process (our dev-browser)
    case "$cmd" in
      node|tsx|npx|Google\ Chrome*|Chromium*)
        echo "  [KILL] Port $port: PID $pid ($cmd)"
        kill "$pid" 2>/dev/null || true
        ;;
      *)
        echo "  [SKIP] Port $port: PID $pid ($cmd) - not a dev-browser process"
        ;;
    esac
  done
}

# Step 1: Kill known app processes (not arbitrary patterns)
echo ""
echo "Step 1: Stopping app processes..."
safe_kill_process "Accomplish"
safe_kill_process "Openwork"
safe_kill_process "tsx.*dev-browser"
safe_kill_process "node.*dev-browser"

# Wait for processes to terminate
sleep 2

# Step 2: Clear Electron app data
echo ""
echo "Step 2: Clearing Electron app data..."

# Main app data (includes localStorage, session, settings, task history)
safe_remove_dir ~/Library/Application\ Support/Accomplish
safe_remove_dir ~/Library/Application\ Support/Openwork
safe_remove_dir ~/Library/Application\ Support/openwork
safe_remove_dir ~/Library/Application\ Support/@accomplish

# Electron cache
safe_remove_dir ~/Library/Caches/Accomplish
safe_remove_dir ~/Library/Caches/Openwork
safe_remove_dir ~/Library/Caches/openwork
safe_remove_dir ~/Library/Caches/@accomplish

# Electron saved state (use glob carefully)
echo "  Checking saved application state..."
for dir in ~/Library/Saved\ Application\ State/com.accomplish.* ~/Library/Saved\ Application\ State/com.openwork.*; do
  if [ -d "$dir" ]; then
    safe_remove_dir "$dir"
  fi
done

# Electron preferences (these are files, not directories)
echo "  Checking preferences..."
for pref in ~/Library/Preferences/com.accomplish.*.plist ~/Library/Preferences/com.openwork.*.plist; do
  if [ -f "$pref" ]; then
    echo "  [DELETE] $pref"
    rm "$pref"
  fi
done

# Step 3: Clear project-level browser data
echo ""
echo "Step 3: Clearing project-level browser data..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

safe_remove_dir "$PROJECT_ROOT/.browser-data"
safe_remove_dir "$PROJECT_ROOT/apps/desktop/.browser-data"
safe_remove_dir "$PROJECT_ROOT/apps/desktop/skills/dev-browser/.browser-data"

# Step 4: Free ports used by dev-browser (only if they're our processes)
# Note: We don't clear ~/Library/Caches/ms-playwright because it's shared
# by ALL Playwright projects on this machine. Clearing it would force
# re-download (~125MB) for other projects too.
echo ""
echo "Step 4: Checking dev-browser ports..."
# Only kill if they're node/tsx processes (our dev-browser)
safe_kill_port 9222
safe_kill_port 9223
safe_kill_port 9224
safe_kill_port 9225

# Step 5: Clean node_modules in dev-browser
echo ""
echo "Step 5: Cleaning dev-browser node_modules..."
safe_remove_dir "$PROJECT_ROOT/apps/desktop/skills/dev-browser/node_modules"

# Also remove package-lock.json if it exists (it's a file)
if [ -f "$PROJECT_ROOT/apps/desktop/skills/dev-browser/package-lock.json" ]; then
  echo "  [DELETE] package-lock.json"
  rm "$PROJECT_ROOT/apps/desktop/skills/dev-browser/package-lock.json"
fi

echo ""
echo "=== Cleanup complete ==="
echo ""
echo "Run 'pnpm install && pnpm dev' for a completely fresh start."
