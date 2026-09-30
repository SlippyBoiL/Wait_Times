#!/usr/bin/env bash
# ==============================================================================
# Disney & Universal Wait Times - Auto Update & Restart Script
# Checks GitHub for new commits, pulls, builds, and safely restarts the service.
# ==============================================================================

set -e
PROJECT_DIR="/opt/wait-times"
LOG_FILE="/var/log/wait-times-update.log"

if [ ! -d "$PROJECT_DIR" ]; then
    PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

cd "$PROJECT_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE" 2>/dev/null || echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# 1. Fetch latest changes from GitHub
git fetch origin main >/dev/null 2>&1 || true

LOCAL_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "local")
REMOTE_COMMIT=$(git rev-parse origin/main 2>/dev/null || echo "remote")

if [ "$LOCAL_COMMIT" != "$REMOTE_COMMIT" ] || [ "$1" == "--force" ]; then
    log "🚀 New update detected ($LOCAL_COMMIT -> $REMOTE_COMMIT). Updating dashboard..."
    
    # 2. Reset and Pull
    git reset --hard origin/main
    
    # 3. Install any new dependencies if package.json changed
    log "📦 Checking dependencies..."
    npm install --no-audit --no-fund --silent
    
    # 4. Rebuild production Vite bundle
    log "🔨 Rebuilding dashboard..."
    npm run build
    
    # 5. Update systemd service config if changed
    if [ -f "$PROJECT_DIR/wait-times.service" ] && [ -d "/etc/systemd/system" ]; then
        cp "$PROJECT_DIR/wait-times.service" /etc/systemd/system/wait-times.service 2>/dev/null || true
        systemctl daemon-reload 2>/dev/null || true
    fi
    
    # 6. Restart the application service
    log "⚡ Restarting wait-times service..."
    if command -v systemctl &>/dev/null; then
        systemctl restart wait-times
    fi
    
    log "✅ Successfully updated to commit $REMOTE_COMMIT and restarted service!"
else
    log "✨ Dashboard is already up-to-date ($LOCAL_COMMIT)."
fi
