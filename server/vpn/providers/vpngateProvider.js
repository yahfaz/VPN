'use strict';

const { getServers, getCachedServers } = require('../../vpngate');
const { getCustomServer } = require('../customServer');

// Default true — set ONLY_USA=false to disable the US-only filter (dev/testing only)
const ONLY_USA = process.env.ONLY_USA !== 'false';

const onlyUS = (list) => (!ONLY_USA ? list : list.filter(s => s.country === 'United States' || s.countryCode === 'US'));

async function getUSAServers(force = false) {
  // The self-hosted server (your AWS VPS) is the primary, always-available US
  // endpoint, so the app connects to it instead of any public list.
  const custom = getCustomServer();

  if (custom) {
    // Never block the VPS on VPNGate: use whatever backup servers are already
    // cached and refresh them in the background. This keeps the app instant even
    // when the VPNGate list is slow or blocked (HTTP 403).
    getServers(force).catch(() => {}); // fire-and-forget background refresh
    const backup = onlyUS(getCachedServers()).filter(s => s.id !== custom.id);
    return [custom, ...backup];
  }

  // No custom server configured — fall back to the public VPNGate list.
  return onlyUS(await getServers(force));
}

module.exports = { getUSAServers, ONLY_USA };
