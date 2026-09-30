#!/usr/bin/env bash
# ==============================================================================
# Disney & Universal Wait Times Dashboard - Proxmox LXC Automated Setup
# Target OS: Debian 11/12 or Ubuntu 22.04/24.04 (Proxmox LXC Container)
# ==============================================================================

set -e

echo "🏰 Setting up Disney & Universal Wait Times Dashboard on Proxmox LXC..."

# 1. Update system packages
apt-get update && apt-get install -y curl git ca-certificates gnupg

# 2. Install Node.js LTS (v20.x) if not already installed
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js LTS (v20.x)..."
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
    apt-get update && apt-get install -y nodejs
fi

echo "✓ Node.js $(node -v) and npm $(npm -v) verified."

# 3. Destination directory
INSTALL_DIR="/opt/wait-times"

if [ -d "$INSTALL_DIR" ]; then
    echo "📁 Updating existing repository in $INSTALL_DIR..."
    cd "$INSTALL_DIR"
    git pull || true
else
    echo "📁 Cloning repository to $INSTALL_DIR..."
    git clone https://github.com/SlippyBoiL/Wait_Times.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# 4. Install dependencies and build client bundle
echo "⚙️ Installing dependencies and building production bundle..."
npm install
npm run build

# 5. Install and enable systemd service
echo "🚀 Configuring systemd service..."
cp wait-times.service /etc/systemd/system/wait-times.service
systemctl daemon-reload
systemctl enable wait-times.service
systemctl restart wait-times.service

# 6. Summary
HOST_IP=$(hostname -I | awk '{print $1}')
echo ""
echo "=============================================================================="
echo "🎉 Setup complete! The dashboard server is now running on Proxmox."
echo "Access your dashboard at:"
echo "   ➜ http://${HOST_IP:-localhost}:3000"
echo "   ➜ http://${HOST_IP:-localhost}:5000 (Cloudflare Tunnel port)"
echo ""
echo "Manage the service with:"
echo "   systemctl status wait-times"
echo "   journalctl -u wait-times -f"
echo "=============================================================================="
