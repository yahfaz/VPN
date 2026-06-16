'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Loads a user-provided OpenVPN config — e.g. your own AWS VPS set up via
// scripts/setup-vps-openvpn.sh — and exposes it as the primary US server.
//
// Discovery order (first hit wins):
//   1. CUSTOM_OVPN env var — an absolute path to a .ovpn file
//   2. ~/.surfvpn/custom-server.ovpn        (drop-in, no rebuild needed)
//   3. <bundled resources>/custom-server.ovpn  (baked into the installer)
function readCustomConfig() {
  const candidates = [];
  if (process.env.CUSTOM_OVPN) candidates.push(process.env.CUSTOM_OVPN);
  candidates.push(path.join(os.homedir(), '.surfvpn', 'custom-server.ovpn'));
  if (process.env.RESOURCES_PATH) {
    candidates.push(path.join(process.env.RESOURCES_PATH, 'custom-server.ovpn'));
  }
  for (const p of candidates) {
    try {
      const raw = fs.readFileSync(p, 'utf8');
      if (raw && /^remote\s+\S+/m.test(raw)) return raw;
    } catch { /* try next */ }
  }
  return null;
}

// Returns a server object shaped like the VPNGate ones, or null if no config is
// present. Sorted first and pre-selected so the connect flow tries it first.
function getCustomServer() {
  const config = readCustomConfig();
  if (!config) return null;

  const remote = config.match(/^remote\s+(\S+)(?:\s+(\d+))?/m);
  const host = remote ? remote[1] : 'custom';
  const port = remote && remote[2] ? parseInt(remote[2], 10) : 1194;
  const protoM = config.match(/^proto\s+(\w+)/m);
  const proto = protoM ? protoM[1].toLowerCase().replace(/[46]$/, '') : 'udp';

  return {
    id: 'custom-vps',
    hostname: host,
    ip: host, // setup script uses the public IP, so the kill-switch allow-rule works
    country: 'United States',
    countryCode: 'US',
    flag: '🇺🇸',
    city: 'My US Server',
    region: 'Americas',
    score: Number.MAX_SAFE_INTEGER, // always sorts ahead of VPNGate servers
    ping: 0,
    speedMbps: 0,
    sessions: 0,
    load: 0,
    logType: '',
    operator: 'Self-hosted',
    config,
    proto,
    port,
    firewallFriendly: true,
    serverCount: 1,
    type: 'standard',
    favorite: true,
    authUserPass: false, // cert-based (easy-rsa) — don't inject vpn/vpn creds
    custom: true,
  };
}

module.exports = { getCustomServer };
