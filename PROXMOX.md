# 🖥️ Running on Proxmox VE Container Guide

This guide explains how to run the **Disney & Universal Wait Times Dashboard** server inside a Proxmox VE container.

---

## ⚡ Option 1: 1-Command Automated LXC Creation (Run on Proxmox Host)

If you are at the Proxmox Node Shell (e.g. `root@proxmox:~#` as seen in the Proxmox Web GUI under **pve > Shell**):

Paste and run this single command:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/SlippyBoiL/Wait_Times/main/create-proxmox-lxc.sh)"
```

### What this command does automatically:
1. Detects your Proxmox storage pools (`local`, `local-lvm`, `local-zfs`, etc.).
2. Finds or downloads the official `debian-12-standard` template.
3. Automatically selects the next available Container ID (e.g. `200` or `101`).
4. Creates a lightweight, unprivileged LXC container (`wait-times`) with 2 cores, 1024MB RAM, and 8GB disk.
5. Boots the container and provisions Node.js 20 LTS, git, and build tools.
6. Clones the repository, compiles the production dashboard, and registers `wait-times.service` to start on boot.
7. Prints your container's IP address and direct dashboard link!

---

## 🚀 Option 2: Setup inside an Existing LXC Container

If you already created an LXC container and are inside its console:

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
