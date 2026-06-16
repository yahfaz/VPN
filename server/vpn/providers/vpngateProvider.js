'use strict';

const { getServers, getCachedServers } = require('../../vpngate');
const { getCustomServer } = require('../customServer');

// Default true — set ONLY_USA=false to disable the US-only filter (dev/testing only)
const ONLY_USA = process.env.ONLY_USA !== 'false';

// By default the app connects ONLY to the configured primary server (the
// self-hosted AWS VPS) and never falls back to the free VPNGate pool. Set
// ENABLE_VPNGATE_FALLBACK=true to re-enable the public list as a backup.
const VPNGATE_FALLBACK = process.env.ENABLE_VPNGATE_FALLBACK === 'true';

const onlyUS = (list) => (!ONLY_USA ? list : list.filter(s => s.country === 'United States' || s.countryCode === 'US'));

async function getUSAServers(force = false) {
  const custom = getCustomServer();

  // VPS-only mode (default): the primary server is the only server, and we never
  // touch the public VPNGate list. This makes the app fully independent of any
  // external server list (no "free server list not found" failure is possible).
  if (custom && !VPNGATE_FALLBACK) {
    return [custom];
  }

  if (custom) {
    // Fallback enabled: primary first, plus background-refreshed VPNGate backup.
    getServers(force).catch(() => {}); // fire-and-forget background refresh
    const backup = onlyUS(getCachedServers()).filter(s => s.id !== custom.id);
    return [custom, ...backup];
  }

  // No custom server configured at all — fall back to the public VPNGate list.
  return onlyUS(await getServers(force));
}

module.exports = { getUSAServers, ONLY_USA, VPNGATE_FALLBACK };
