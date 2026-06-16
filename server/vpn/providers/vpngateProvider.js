'use strict';

const { getServers } = require('../../vpngate');
const { getCustomServer } = require('../customServer');

// Default true — set ONLY_USA=false to disable the US-only filter (dev/testing only)
const ONLY_USA = process.env.ONLY_USA !== 'false';

async function getUSAServers(force = false) {
  // A self-hosted server (e.g. your AWS VPS) is the primary, always-available US
  // endpoint. It's offered first and — critically — keeps working even when the
  // VPNGate list is unreachable (HTTP 403 / blocked), which is the whole point of
  // "VPS primary + VPNGate backup".
  const custom = getCustomServer();

  let usa = [];
  try {
    const all = await getServers(force);
    usa = !ONLY_USA ? all : all.filter(s => s.country === 'United States' || s.countryCode === 'US');
  } catch (err) {
    if (!custom) throw err; // no fallback — let the API surface the real error
  }

  return custom ? [custom, ...usa.filter(s => s.id !== custom.id)] : usa;
}

module.exports = { getUSAServers, ONLY_USA };
