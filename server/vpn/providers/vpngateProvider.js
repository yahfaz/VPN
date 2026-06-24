'use strict';

const { getServers, getCachedServers } = require('../../vpngate');
const { getCustomServer, getSecondServer } = require('../customServer');

// Default true — set ONLY_USA=false to disable the US-only filter (dev/testing only)
const ONLY_USA = process.env.ONLY_USA !== 'false';

// By default the app connects ONLY to the configured primary server (the
// self-hosted AWS VPS) and never falls back to the free VPNGate pool. Set
// ENABLE_VPNGATE_FALLBACK=true to re-enable the public list as a backup.
const VPNGATE_FALLBACK = process.env.ENABLE_VPNGATE_FALLBACK === 'true';

const onlyUS = (list) => (!ONLY_USA ? list : list.filter(s => s.country === 'United States' || s.countryCode === 'US'));

async function getUSAServers(force = false) {
  const custom = getCustomServer();
  const second = getSecondServer();

  // VPS-only mode (default): return only the baked-in servers, never touch the
  // public VPNGate list. This makes the app fully independent of any external
  // server list.
  if (!VPNGATE_FALLBACK) {
    return [custom, second].filter(Boolean);
  }

  // Fallback enabled: primary + secondary first, then VPNGate backup.
  getServers(force).catch(() => {}); // fire-and-forget background refresh
  const ownIds = new Set([custom?.id, second?.id].filter(Boolean));
  const backup = onlyUS(getCachedServers()).filter(s => !ownIds.has(s.id));
  return [...[custom, second].filter(Boolean), ...backup];
}

module.exports = { getUSAServers, ONLY_USA, VPNGATE_FALLBACK };
