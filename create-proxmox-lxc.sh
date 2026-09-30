#!/usr/bin/env bash
# ==============================================================================
# Disney & Universal Wait Times Dashboard - 1-Command Proxmox LXC Builder
# Run this directly on your Proxmox VE Host Shell (root@proxmox:~#)
# ==============================================================================

# Note: Do NOT use set -e or pipefail here because grep queries in pipelines return 1 on no match!

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

# 1. Verify we are running on a Proxmox VE host
if ! command -v pct &>/dev/null || ! command -v pvesm &>/dev/null; then
    echo -e "${RED}❌ Error: This command must be run directly on the Proxmox VE host shell (root@proxmox:~#).${NC}"
    echo "It looks like this shell is not a Proxmox VE host."
    exit 1
fi

echo -e "${GREEN}✓ Verified running on Proxmox VE host.${NC}"

# 2. Determine Next Container ID
NEXT_CTID=$(pvesh get /cluster/nextid 2>/dev/null || echo "200")
CTID=${CTID:-$NEXT_CTID}

# Ensure CTID is unused
while pct status "$CTID" >/dev/null 2>&1; do
    CTID=$((CTID + 1))
done

HOSTNAME="wait-times"
MEMORY=1024
SWAP=512
CORES=2
BRIDGE="vmbr0"

echo -e "Target LXC Container: ${BOLD}#${CTID}${NC} (${HOSTNAME})"

# 3. Detect Storage Pools
echo -e "${YELLOW}🔍 Detecting Proxmox storage pools...${NC}"

# Storage for vztmpl (templates)
TEMPLATE_STORAGE=$(pvesm status -content vztmpl 2>/dev/null | awk 'NR>1 {print $1}' | head -n 1 || true)
if [ -z "$TEMPLATE_STORAGE" ]; then
    TEMPLATE_STORAGE="local"
fi

# Storage for rootfs (container disk)
ROOTFS_STORAGE=$(pvesm status -content rootdir 2>/dev/null | awk 'NR>1 {print $1}' | head -n 1 || true)
if [ -z "$ROOTFS_STORAGE" ]; then
    ROOTFS_STORAGE="local-lvm"
fi

echo "   • Template Storage: $TEMPLATE_STORAGE"
echo "   • Container Storage: $ROOTFS_STORAGE"

# 4. Check for Debian 12 Template or Download It
echo -e "${YELLOW}📦 Checking for LXC template...${NC}"

# Look for an existing downloaded template
TEMPLATE_VOLID=$(pvesm list "$TEMPLATE_STORAGE" -content vztmpl 2>/dev/null | awk '{print $1}' | grep -i "debian-12" | head -n 1 || true)

if [ -z "$TEMPLATE_VOLID" ]; then
    # Look for debian-11 or ubuntu if debian-12 not downloaded yet
    TEMPLATE_VOLID=$(pvesm list "$TEMPLATE_STORAGE" -content vztmpl 2>/dev/null | awk '{print $1}' | grep -E -i "debian|ubuntu" | head -n 1 || true)
fi

if [ -z "$TEMPLATE_VOLID" ]; then
    echo "   Updating Proxmox appliance index (pveam update)..."
    pveam update || true
    
    DOWNLOAD_TARGET=$(pveam available -section system 2>/dev/null | awk '{print $2}' | grep -i "debian-12-standard" | sort -V | tail -n 1 || true)
    
    if [ -z "$DOWNLOAD_TARGET" ]; then
        DOWNLOAD_TARGET=$(pveam available -section system 2>/dev/null | awk '{print $2}' | grep -E -i "debian-11-standard|ubuntu-24.04-standard|ubuntu-22.04-standard" | sort -V | tail -n 1 || true)
    fi
    
    if [ -z "$DOWNLOAD_TARGET" ]; then
        echo -e "${RED}❌ Could not find an available Debian/Ubuntu template to download.${NC}"
        echo "Please download a Debian 12 template manually in Proxmox (local > CT Templates) and re-run."
        exit 1
    fi
    
    echo "   Downloading $DOWNLOAD_TARGET into $TEMPLATE_STORAGE (this may take 10-30s)..."
    pveam download "$TEMPLATE_STORAGE" "$DOWNLOAD_TARGET"
    TEMPLATE_VOLID="${TEMPLATE_STORAGE}:vztmpl/${DOWNLOAD_TARGET}"
fi

echo -e "${GREEN}✓ Using template:${NC} $TEMPLATE_VOLID"

# 5. Create and Start the LXC Container
echo -e "${YELLOW}🛠️ Creating LXC container $CTID...${NC}"

pct create "$CTID" "$TEMPLATE_VOLID" \
    --ostype debian \
    --hostname "$HOSTNAME" \
    --cores "$CORES" \
    --memory "$MEMORY" \
    --swap "$SWAP" \
    --rootfs "${ROOTFS_STORAGE}:8" \
    --net0 "name=eth0,bridge=${BRIDGE},ip=dhcp" \
    --unprivileged 1 \
    --features nesting=1 \
    --onboot 1

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to create container $CTID. Please check the storage and settings above.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Container $CTID created successfully.${NC}"
echo -e "${YELLOW}⚡ Starting container $CTID...${NC}"
pct start "$CTID"

# 6. Wait for Network Inside Container
echo -e "${YELLOW}⏳ Waiting for network inside container...${NC}"
CONNECTED=0
for i in {1..30}; do
    if pct exec "$CTID" -- ping -c 1 -W 1 1.1.1.1 >/dev/null 2>&1; then
        CONNECTED=1
        break
    fi
    sleep 1
done

if [ $CONNECTED -eq 1 ]; then
    echo -e "${GREEN}✓ Network connected.${NC}"
else
    echo -e "${YELLOW}⚠️ Notice: Network ping timed out, proceeding with package update...${NC}"
fi

# 7. Provision Node.js and Dashboard Inside the Container
echo -e "${YELLOW}🚀 Installing dependencies and building Disney & Universal dashboard...${NC}"

pct exec "$CTID" -- bash -c '
set -e
export DEBIAN_FRONTEND=noninteractive

echo "   [1/5] Updating apt packages..."
apt-get update -qq
apt-get install -y -qq curl git ca-certificates gnupg

echo "   [2/5] Installing Node.js LTS (v20)..."
if ! command -v node &>/dev/null; then
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
    apt-get update -qq
    apt-get install -y -qq nodejs
fi

echo "   [3/5] Cloning repository into /opt/wait-times..."
rm -rf /opt/wait-times
git clone https://github.com/SlippyBoiL/Wait_Times.git /opt/wait-times
cd /opt/wait-times

echo "   [4/5] Building production dashboard..."
npm install
npm run build

echo "   [5/5] Configuring systemd service..."
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
echo -e "${GREEN}${BOLD}🎉 SUCCESS! Your Disney Wait Times Container is Running!${NC}"
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  • Container ID:  ${BOLD}${CTID}${NC} (${HOSTNAME})"
echo -e "  • Dashboard URL: ${CYAN}${BOLD}http://${CONTAINER_IP:-<CONTAINER_IP>}:3000${NC}"
echo -e "  • Tunnel Port:   ${CYAN}http://${CONTAINER_IP:-<CONTAINER_IP>}:5000${NC}"
echo ""
echo -e "To access the container console from Proxmox host:"
echo -e "   ${YELLOW}pct enter ${CTID}${NC}"
echo ""
echo -e "To view live service logs:"
echo -e "   ${YELLOW}pct exec ${CTID} -- journalctl -u wait-times -f${NC}"
echo ""
echo -e "${GREEN}${BOLD}Enjoy real-time wait times and the MOWD downtime radar! 🏰🎡${NC}"
