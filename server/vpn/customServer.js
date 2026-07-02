'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { DEFAULT_SERVER_OVPN } = require('./defaultServerConfig');
const { SECOND_SERVER_OVPN } = require('./secondServerConfig');

// Loads the OpenVPN config for the primary US server. By default this is the
// baked-in self-hosted AWS server (defaultServerConfig.js), so the app connects
// straight to it with no public-list fetch. It can be overridden at runtime:
//
// Discovery order (first hit wins):
//   1. CUSTOM_OVPN env var — an absolute path to a .ovpn file
//   2. ~/.nx3vpn/custom-server.ovpn         (drop-in, no rebuild needed)
//   3. <bundled resources>/custom-server.ovpn  (placed next to the app)
//   4. the baked-in default (defaultServerConfig.js)
function readCustomConfig() {
  const candidates = [];
  if (process.env.CUSTOM_OVPN) candidates.push(process.env.CUSTOM_OVPN);
  candidates.push(path.join(os.homedir(), '.nx3vpn', 'custom-server.ovpn'));
  if (process.env.RESOURCES_PATH) {
    candidates.push(path.join(process.env.RESOURCES_PATH, 'custom-server.ovpn'));
  }
  for (const p of candidates) {
    try {
      const raw = fs.readFileSync(p, 'utf8');
      if (raw && /^remote\s+\S+/m.test(raw)) return raw;
    } catch { /* try next */ }
  }
  // Fall back to the baked-in default server (unless explicitly disabled).
  if (process.env.DISABLE_DEFAULT_SERVER === 'true') return null;
  return DEFAULT_SERVER_OVPN;
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
    score: Number.MAX_SAFE_INTEGER, // primary — sorts first
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

function getSecondServer() {
  if (process.env.DISABLE_DEFAULT_SERVER === 'true') return null;
  const config = SECOND_SERVER_OVPN;
  const remote = config.match(/^remote\s+(\S+)(?:\s+(\d+))?/m);
  const host = remote ? remote[1] : 'custom2';
  const port = remote && remote[2] ? parseInt(remote[2], 10) : 1194;
  const protoM = config.match(/^proto\s+(\w+)/m);
  const proto = protoM ? protoM[1].toLowerCase().replace(/[46]$/, '') : 'udp';

  return {
    id: 'custom-vps-2',
    hostname: host,
    ip: host,
    country: 'United States',
    countryCode: 'US',
    flag: '🇺🇸',
    city: 'My US Server 2',
    region: 'Americas',
    score: Number.MAX_SAFE_INTEGER - 1, // sorts just after the primary
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
    authUserPass: false,
    custom: true,
  };
}

module.exports = { getCustomServer, getSecondServer };
