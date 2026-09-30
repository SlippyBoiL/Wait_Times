# 🏰 Disney & Universal Wait Times Dashboard

A comprehensive, real-time theme park intelligence dashboard and wait time predictor for **Walt Disney World** and **Universal Orlando Resort**.

## 🌟 Key Features

- **📱 Dedicated Phone GUI & iPad/Computer GUI**:
  - Automatically adapts to mobile screens with a thumb-friendly bottom navigation bar (`Spotlight`, `Parks`, `Radar`, `Tools`).
  - Seamless 1-tap switcher (`💻 IPAD GUI` / `📱 PHONE GUI`) to toggle between the 2-column iPad layout and the mobile layout on any device.
- **🎯 Turnstile Ride Spotlight**:
  - Live wait time display with giant luminous digits and real-time status.
  - Interactive carousel controls (`◀ PREV`, `🎲 RANDOM`, `NEXT ▶`).
  - Watchlist star and `+ LOG RIDE` / `RIDDEN ✓` trip tracking.
  - Instant MOWD estimated recovery countdown if the attraction is down.
- **🚨 MOWD Downtime & Reopen Radar**:
  - Predictive uptime modeling based on vehicle dispatch cycles, reset telemetry, and historical recovery curves.
  - Live countdown timers (`⏱ ~12m remaining`) and elapsed downtime telemetry.
  - Reopen chime alerts (`🔔 WATCH REOPEN`) that play a fanfare chime when an attraction reboots to open.
  - Golden Walk-on Window advisories (first ~8–12 min post-reopen before Lightning Lane backlogs accumulate).
  - Accuracy confidence ratings based on mechanical archetype and empirical recovery logs.
- **🏰 All 7 Florida Theme Parks**:
  - Magic Kingdom, EPCOT, Disney's Hollywood Studios, Disney's Animal Kingdom.
  - Universal Studios Florida, Universal's Islands of Adventure, and Universal's Epic Universe.
  - Live operating hours, special event hours, average wait times, and operating ratios.
- **🧭 Resort Command Tools**:
  - **Smart Guide Algorithm**: Live queue analysis, optimal headliner deals, and walk-on recommendations.
  - **Resort Crowd Meter**: Crowd density indices and park-by-park queue distributions.
  - **Weather & Lightning Radar**: Real-time 10-mile lightning radius safety tracker and outdoor coaster halt monitor.
  - **Morning Rope Drop Playbook**: Turnstile sprint blueprints and down-ride pivots for all 7 parks.
  - **Park Hopper & Migration Advisor**: Live resort hopping resistance index.
  - **Time Saved & Trip ROI**: Vacation dollar value calculator and ride conquest log.

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- npm or bun

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
```
The server will run at `http://localhost:3000`.

### Production Build
```bash
npm run build
npm start
```

## 🖥️ Running on Proxmox VE Container

### ⚡ 1-Command Automated Proxmox LXC Builder (Run on Proxmox Host)
Run this single command directly in your Proxmox VE host shell (**Node > Shell**, e.g. `root@proxmox:~#`):
```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/SlippyBoiL/Wait_Times/main/create-proxmox-lxc.sh)"
```
This automatically downloads the Debian 12 template, provisions the LXC container with 2 cores / 1GB RAM, installs Node.js, compiles the dashboard, sets up auto-start on boot, and provides your direct web URL!

### Option B: Setup inside an Existing LXC Container
Inside an existing Debian 12 or Ubuntu LXC container console:
```bash
apt-get update && apt-get install -y curl ca-certificates git
curl -fsSL https://raw.githubusercontent.com/SlippyBoiL/Wait_Times/main/proxmox-lxc-setup.sh | bash
```

### Option C: Docker / Docker Compose
```bash
docker compose up -d --build
```
Access at `http://<PROXMOX_IP>:3000`. Full guide available in [PROXMOX.md](./PROXMOX.md).

