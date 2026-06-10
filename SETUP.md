# SurfVPN — Setup & Configuration Guide

## Requirements

| Platform | Requirements |
|----------|-------------|
| Windows  | Node.js 18+, Git, Windows 10/11 (64-bit). No OpenVPN install needed — bundled automatically. |
| Linux    | Node.js 18+, Git, `openvpn` package, `sudo` access |
| macOS    | Node.js 18+, Git, `openvpn` via Homebrew, `sudo` access |

---

## Quick Start (Development)

```bash
git clone https://github.com/yahfaz/VPN.git
cd VPN
npm install
npm run dev:all        # starts backend on :3001 + Vite frontend on :5173
```

Open http://localhost:5173 in your browser.  
**Note:** Real VPN connections require the desktop app (not the browser preview).

---

## Building the Desktop App

### Windows

```powershell
npm install
npm run prepare:win          # downloads openvpn.exe + wintun.dll into resources/win/
npm run build                # compiles TypeScript + Vite
npx electron-builder --win   # produces release\SurfVPN Setup 1.0.0.exe
```

`prepare:win` only needs to run once (or with `--force` to re-download).  
The resulting installer is in `release\SurfVPN Setup 1.0.0.exe` — no admin rights needed to install.

### Linux

```bash
npm install
npm run electron:build:appimage   # → release/SurfVPN-1.0.0.AppImage
# or
npm run electron:build:deb        # → release/surfvpn_1.0.0_amd64.deb
```

Requires OpenVPN installed on the system:
```bash
sudo apt-get install openvpn
```

### macOS

```bash
npm install
npm run build
npx electron-builder --mac
```

Requires OpenVPN installed:
```bash
brew install openvpn
```

---

## How It Works

```
┌─────────────────────────────────────────────────────┐
│  Electron (main process)                            │
│  ├─ Forks Node.js backend on port 3001              │
│  ├─ Loads React UI from dist/index.html (file://)  │
│  └─ Passes RESOURCES_PATH to backend               │
├─────────────────────────────────────────────────────┤
│  Backend (server/index.js, port 3001)               │
│  ├─ GET  /api/health   — liveness check             │
│  ├─ GET  /api/servers  — live VPNGate server list   │
│  ├─ GET  /api/ip       — current public IP          │
│  └─ WS   ws://localhost:3001 — connect/disconnect   │
├─────────────────────────────────────────────────────┤
│  VPN Layer                                          │
│  ├─ VPNGate API → hundreds of free servers          │
│  ├─ Base64 OpenVPN configs decoded per server       │
│  └─ openvpn process spawned with wintun (Windows)   │
└─────────────────────────────────────────────────────┘
```

---

## Connecting to a VPN Server

1. Launch the app — the Dashboard shows "Backend connected · OpenVPN ready" when everything is working.
2. The **Quick Connect — Server 4** card on the Dashboard connects to VPNGate server index 3 (0-based).
3. Use the **Servers** page to browse and connect to any of the live VPNGate servers.
4. The connection log (click **Logs** in the banner) shows raw OpenVPN output.
5. Once "Initialization Sequence Completed" appears in the log, your IP is masked.

**VPN credentials used:** `vpn` / `vpn` (standard for all VPNGate volunteer servers)

---

## Troubleshooting

### "Backend starting… please wait"
The Node.js backend takes a few seconds to start. Wait 5–10 seconds. If it never connects, check that port 3001 is not in use: `netstat -ano | findstr 3001` (Windows) or `lsof -i:3001` (Linux/Mac).

### "OpenVPN not found"
- **Windows:** Run `npm run prepare:win` then rebuild. The app will use the bundled binary automatically.
- **Linux:** `sudo apt-get install openvpn`
- **macOS:** `brew install openvpn`

### "No VPN config for selected server"
The server list loaded from static fallback (no real configs). This means the backend couldn't reach vpngate.net. Check your internet connection and retry — the server list refreshes on each backend start.

### Connection times out after 30s
The selected VPNGate server may be offline. Try a different server from the **Servers** page — VPNGate has hundreds of volunteer servers worldwide.

### "TLS handshake failed"
Same as above — server is offline or overloaded. Pick another server.

### App window is blank / dark blue screen
Ensure you built with `npm run build` **after** updating the code. The built assets must use relative paths (`./`). Clean rebuild:
```powershell
Remove-Item -Recurse -Force dist
npm run build
npx electron-builder --win
```

---

## Project Structure

```
VPN/
├── electron/
│   ├── main.js          # Electron main process
│   └── preload.js       # Context bridge (exposes electronAPI)
├── server/
│   ├── index.js         # Express + WebSocket backend
│   ├── openvpn.js       # OpenVPN process management
│   └── vpngate.js       # VPNGate API + CSV parser
├── src/
│   ├── components/      # React UI components
│   ├── pages/           # Dashboard, Servers, Features, Statistics, Settings
│   ├── services/
│   │   └── wsClient.ts  # WebSocket client singleton
│   ├── store/
│   │   └── vpnStore.ts  # Zustand state (VPN state, backend bridge)
│   └── types/
│       └── index.ts     # TypeScript interfaces
├── scripts/
│   └── prepare-win-openvpn.js  # Downloads openvpn.exe + wintun.dll for Windows build
├── resources/
│   └── win/             # Bundled Windows binaries (git-ignored, created by prepare:win)
└── package.json
```

---

## Environment Variables (Backend)

| Variable         | Set by        | Purpose |
|------------------|---------------|---------|
| `ELECTRON`       | Electron main | Signals backend it's running inside Electron |
| `RESOURCES_PATH` | Electron main | Path to bundled resources (openvpn.exe, wintun.dll) |

---

## VPNGate Servers

The app fetches live servers from [VPNGate](https://www.vpngate.net) — a free public VPN relay service run by volunteers at University of Tsukuba, Japan. Servers are cached for 10 minutes.

- All servers use OpenVPN protocol
- Credentials: `vpn` / `vpn` (universal for all VPNGate servers)
- Server quality varies — ping and load are shown in the Servers page
- If vpngate.net is unreachable, the app falls back to a static server list (no real configs available in fallback mode)

---

## Building for Multiple Platforms

```bash
npx electron-builder --win     # Windows NSIS installer
npx electron-builder --linux   # AppImage + .deb
npx electron-builder --mac     # .dmg
npx electron-builder -wlm      # all three platforms (requires macOS host for --mac)
```
