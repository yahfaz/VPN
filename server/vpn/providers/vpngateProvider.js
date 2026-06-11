'use strict';

const { getServers } = require('../../vpngate');

// Default true — set ONLY_USA=false to disable the US-only filter (dev/testing only)
const ONLY_USA = process.env.ONLY_USA !== 'false';

async function getUSAServers() {
  const all = await getServers();
  if (!ONLY_USA) return all;
  return all.filter(s => s.country === 'United States' || s.countryCode === 'US');
}

module.exports = { getUSAServers, ONLY_USA };
