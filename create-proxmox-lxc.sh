#!/usr/bin/env bash
# ==============================================================================
# Disney & Universal Wait Times Dashboard - 1-Command Proxmox LXC Builder
# Run this directly on your Proxmox VE Host Shell (root@proxmox:~#)
# ==============================================================================

set -eo pipefail

# ANSI Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${CYAN}${BOLD}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║   🏰 Disney & Universal Wait Times - Proxmox LXC Creator     ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# 1. Verify we are on a Proxmox VE host
if ! command -v pct &>/dev/null || ! command -v pvesm &>/dev/null; then
    echo -e "${RED}❌ Error: This command must be run directly on the Proxmox VE host shell (e.g., root@proxmox:~#).${NC}"
    echo "If you are already inside a container or VM, please use proxmox-lxc-setup.sh instead."
    exit 1
fi

echo -e "${GREEN}✓ Verified running on Proxmox VE host.${NC}"

# 2. Determine Next Container ID
NEXT_CTID=$(pvesh get /cluster/nextid 2>/dev/null || echo "200")
CTID=${CTID:-$NEXT_CTID}
HOSTNAME="wait-times"
MEMORY=1024
SWAP=512
CORES=2
DISK_SIZE="8G"
BRIDGE="vmbr0"

echo -e "Creating LXC Container ${BOLD}#${CTID}${NC} (${HOSTNAME})..."

# 3. Detect Storage for Templates and Rootfs
echo -e "${YELLOW}🔍 Detecting Proxmox storage pools...${NC}"

# Storage for vztmpl (templates)
TEMPLATE_STORAGE=$(pvesm status -content vztmpl 2>/dev/null | awk 'NR>1 {print $1}' | head -n 1)
if [ -z "$TEMPLATE_STORAGE" ]; then
    TEMPLATE_STORAGE="local"
fi

# Storage for rootfs (container disk)
ROOTFS_STORAGE=$(pvesm status -content rootdir 2>/dev/null | awk 'NR>1 {print $1}' | head -n 1)
if [ -z "$ROOTFS_STORAGE" ]; then
    ROOTFS_STORAGE="local-lvm"
fi

echo "   • Template Storage: $TEMPLATE_STORAGE"
echo "   • Container Storage: $ROOTFS_STORAGE"

# 4. Check for Debian 12 Template or Download It
echo -e "${YELLOW}📦 Checking Debian 12 LXC template...${NC}"
pveam update >/dev/null 2>&1 || true

DEBIAN_TEMPLATE_NAME=$(pveam list "$TEMPLATE_STORAGE" 2>/dev/null | grep -E "debian-12-standard" | awk '{print $1}' | sort -V | tail -n 1)

if [ -z "$DEBIAN_TEMPLATE_NAME" ]; then
    echo "   Downloading latest Debian 12 standard template into $TEMPLATE_STORAGE..."
    DOWNLOAD_TARGET=$(pveam available -section system 2>/dev/null | grep -E "debian-12-standard" | awk '{print $2}' | sort -V | tail -n 1)
    if [ -z "$DOWNLOAD_TARGET" ]; then
        DOWNLOAD_TARGET="debian-12-standard_12.7-1_amd64.tar.zst"
    fi
    pveam download "$TEMPLATE_STORAGE" "$DOWNLOAD_TARGET"
    DEBIAN_TEMPLATE_NAME="$TEMPLATE_STORAGE:vztmpl/$DOWNLOAD_TARGET"
fi

echo -e "${GREEN}✓ Using template:${NC} $DEBIAN_TEMPLATE_NAME"

# 5. Create the Container
echo -e "${YELLOW}🛠️ Creating container $CTID...${NC}"

# Remove existing container if explicitly requested or collision
if pct status "$CTID" >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️ Container $CTID already exists! Generating next available ID...${NC}"
    CTID=$(pvesh get /cluster/nextid)
fi

pct create "$CTID" "$DEBIAN_TEMPLATE_NAME" \
    --ostype debian \
    --hostname "$HOSTNAME" \
    --cores "$CORES" \
    --memory "$MEMORY" \
    --swap "$SWAP" \
    --rootfs "${ROOTFS_STORAGE}:${DISK_SIZE}" \
    --net0 "name=eth0,bridge=${BRIDGE},ip=dhcp" \
    --unprivileged 1 \
    --features nesting=1 \
    --onboot 1 \
    --start 1

echo -e "${GREEN}✓ Container $CTID created and booted.${NC}"

# 6. Wait for Network Inside Container
echo -e "${YELLOW}⏳ Waiting for container network (DHCP)...${NC}"
for i in {1..30}; do
    if pct exec "$CTID" -- ip route get 1.1.1.1 >/dev/null 2>&1; then
        break
    fi
    sleep 1
done

# 7. Provision Node.js and Dashboard Inside the Container
echo -e "${YELLOW}🚀 Installing dependencies and building dashboard inside container...${NC}"

pct exec "$CTID" -- bash -c '
set -e
export DEBIAN_FRONTEND=noninteractive

echo "   ➜ Updating packages..."
apt-get update -qq
apt-get install -y -qq curl git ca-certificates gnupg

echo "   ➜ Installing Node.js LTS (v20)..."
if ! command -v node &>/dev/null; then
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
    apt-get update -qq
    apt-get install -y -qq nodejs
fi

echo "   ➜ Cloning Disney & Universal Wait Times repository..."
rm -rf /opt/wait-times
git clone https://github.com/SlippyBoiL/Wait_Times.git /opt/wait-times
cd /opt/wait-times

echo "   ➜ Installing npm packages & building client bundle..."
npm install --silent
npm run build

echo "   ➜ Setting up auto-start service..."
cp wait-times.service /etc/systemd/system/wait-times.service
systemctl daemon-reload
systemctl enable wait-times.service
systemctl restart wait-times.service
'

# 8. Retrieve Container IP
CONTAINER_IP=$(pct exec "$CTID" -- ip -4 -br addr show eth0 2>/dev/null | awk '{print $3}' | cut -d/ -f1 || true)
if [ -z "$CONTAINER_IP" ]; then
    CONTAINER_IP=$(pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}' || true)
fi

echo ""
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}🎉 SUCCESS! Your Disney Wait Times Container is Live!${NC}"
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  • Container ID:  ${BOLD}${CTID}${NC} (${HOSTNAME})"
echo -e "  • Web Interface: ${CYAN}${BOLD}http://${CONTAINER_IP:-<CONTAINER_IP>}:3000${NC}"
echo -e "  • Tunnel Port:   ${CYAN}http://${CONTAINER_IP:-<CONTAINER_IP>}:5000${NC}"
echo ""
echo -e "To access the container console from Proxmox host:"
echo -e "   ${YELLOW}pct enter ${CTID}${NC}"
echo ""
echo -e "To view live logs:"
echo -e "   ${YELLOW}pct exec ${CTID} -- journalctl -u wait-times -f${NC}"
echo ""
echo -e "${GREEN}${BOLD}Enjoy real-time wait times and the MOWD downtime radar! 🏰🎡${NC}"
