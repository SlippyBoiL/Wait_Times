# 🖥️ Running on Proxmox VE Container Guide

This guide explains how to run the **Disney & Universal Wait Times Dashboard** server inside a Proxmox VE container.

You can run it in two ways depending on your Proxmox setup:
- **Option 1 (Recommended)**: Native Debian/Ubuntu LXC Container (Uses only ~100MB RAM, fastest performance, no Docker overhead).
- **Option 2**: Docker / Docker Compose (Ideal if you run a Docker LXC or Portainer on Proxmox).

---

## 🚀 Option 1: Native Proxmox LXC Container (Recommended)

### Step 1: Create an LXC Container in Proxmox
1. In the Proxmox Web GUI, click **Create CT**.
2. **General**: Give it a CT ID (e.g. `200`) and hostname (e.g. `wait-times`). Check `Unprivileged container` (leave nested virtualization unchecked).
3. **Template**: Choose `debian-12-standard` (or `ubuntu-24.04-standard`).
4. **Disks**: 8 GB is plenty.
5. **CPU**: 1–2 cores.
6. **Memory**: 512 MB – 1024 MB RAM, 512 MB swap.
7. **Network**: DHCP (or assign a static IP like `192.168.1.150/24` with your gateway).
8. Click **Finish** and start the container.

### Step 2: Run the 1-Line Setup
Open the **Console** of your new LXC container in Proxmox and run:

```bash
apt-get update && apt-get install -y curl ca-certificates git
curl -fsSL https://raw.githubusercontent.com/SlippyBoiL/Wait_Times/main/proxmox-lxc-setup.sh | bash
```

This automated script will:
- Install Node.js 20 LTS and npm
- Clone the repository to `/opt/wait-times`
- Install dependencies and build the production bundle (`npm run build`)
- Configure and start the `systemd` service (`wait-times.service`) so it starts automatically on container boot

### Step 3: Access the Dashboard
Once finished, the script will output your container's IP address:
```
http://<CONTAINER_IP>:3000
```
*(Also available on port 5000 for legacy Cloudflare tunnel setups).*

### Managing the Service:
```bash
# Check status
systemctl status wait-times

# View live logs
journalctl -u wait-times -f

# Restart or stop
systemctl restart wait-times
systemctl stop wait-times
```

---

## 🐳 Option 2: Docker or Docker Compose in Proxmox

If you run Docker inside a Proxmox LXC or VM:

### 1. Clone the Repository
```bash
git clone https://github.com/SlippyBoiL/Wait_Times.git
cd Wait_Times
```

### 2. Launch with Docker Compose
```bash
docker compose up -d --build
```

### 3. Check Status and Logs
```bash
docker compose ps
docker compose logs -f
```

The container includes:
- Multi-stage Node 20 Alpine image (~150MB footprint)
- Auto-restart (`restart: unless-stopped`)
- Built-in healthcheck (`/api/health`)
- Ports `3000` and `5000` mapped

---

## 🔒 Optional: Exposing via Cloudflare Tunnel or Reverse Proxy

### Cloudflare Tunnel:
If using `cloudflared` to expose to a custom domain:
```yaml
ingress:
  - hostname: waittimes.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

### Nginx Proxy Manager / Caddy / Traefik:
- **Forward Hostname / IP**: `<CONTAINER_IP>`
- **Forward Port**: `3000`
- **Websockets Support**: Enabled
